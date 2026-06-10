import { isIP } from 'node:net';

export function createRateLimiter(windowMs, maxRequests, { trustedProxies = [] } = {}) {
  const buckets = new Map();
  const trustedProxyRanges = parseTrustedProxyRanges(trustedProxies);

  return (request, response) => {
    const now = Date.now();
    const key = rateLimitKeyForRequest(request, trustedProxyRanges);
    const bucket = buckets.get(key) || { count: 0, resetAt: now + windowMs };
    if (now > bucket.resetAt) {
      bucket.count = 0;
      bucket.resetAt = now + windowMs;
    }
    bucket.count += 1;
    buckets.set(key, bucket);

    if (bucket.count > maxRequests) {
      sendRateLimitExceeded(response);
      return false;
    }
    return true;
  };
}

function sendRateLimitExceeded(response) {
  response.writeHead(429, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store'
  });
  response.end(JSON.stringify({ evidence_status: 'error', error: 'Rate limit exceeded.' }));
}

function rateLimitKeyForRequest(request, trustedProxyRanges) {
  const remoteAddress = parseIpAddress(request.socket.remoteAddress || '');
  if (!remoteAddress) return 'unknown';
  if (!isTrustedProxy(remoteAddress, trustedProxyRanges)) return ipKey(remoteAddress);

  let clientAddress = remoteAddress;
  const forwardedAddresses = forwardedAddressChain(request);
  for (let index = forwardedAddresses.length - 1; index >= 0; index -= 1) {
    const forwardedAddress = parseIpAddress(forwardedAddresses[index]);
    if (!forwardedAddress) continue;

    clientAddress = forwardedAddress;
    if (!isTrustedProxy(clientAddress, trustedProxyRanges)) break;
  }

  return ipKey(clientAddress);
}

function forwardedAddressChain(request) {
  const xForwardedFor = headerValues(request.headers, 'x-forwarded-for')
    .flatMap((value) => splitHeaderValue(value, ','))
    .map(extractIpAddress)
    .filter(Boolean);
  if (xForwardedFor.length) return xForwardedFor;

  return headerValues(request.headers, 'forwarded')
    .flatMap(parseForwardedHeader)
    .filter(Boolean);
}

function parseForwardedHeader(headerValue) {
  const addresses = [];
  for (const entry of splitHeaderValue(headerValue, ',')) {
    for (const parameter of splitHeaderValue(entry, ';')) {
      const separatorIndex = parameter.indexOf('=');
      if (separatorIndex < 0) continue;

      const name = parameter.slice(0, separatorIndex).trim().toLowerCase();
      if (name !== 'for') continue;

      const value = parameter.slice(separatorIndex + 1).trim();
      const address = extractIpAddress(value);
      if (address) addresses.push(address);
    }
  }
  return addresses;
}

function headerValues(headers, name) {
  const value = headers[name];
  if (Array.isArray(value)) return value;
  return value ? [value] : [];
}

function splitHeaderValue(value, separator) {
  const parts = [];
  let quoted = false;
  let escaped = false;
  let start = 0;

  for (let index = 0; index < value.length; index += 1) {
    const char = value[index];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (char === '\\' && quoted) {
      escaped = true;
      continue;
    }
    if (char === '"') {
      quoted = !quoted;
      continue;
    }
    if (char === separator && !quoted) {
      parts.push(value.slice(start, index).trim());
      start = index + 1;
    }
  }

  parts.push(value.slice(start).trim());
  return parts.filter(Boolean);
}

function parseTrustedProxyRanges(trustedProxies) {
  return normalizeTrustedProxyEntries(trustedProxies).map(parseTrustedProxyRange);
}

function normalizeTrustedProxyEntries(trustedProxies) {
  if (Array.isArray(trustedProxies)) return trustedProxies.flatMap(normalizeTrustedProxyEntries);
  return String(trustedProxies || '')
    .split(/[,\s]+/)
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function parseTrustedProxyRange(entry) {
  const separatorIndex = entry.indexOf('/');
  const address = separatorIndex >= 0 ? entry.slice(0, separatorIndex) : entry;
  const parsedAddress = parseIpAddress(address);
  if (!parsedAddress) throw new Error(`Invalid TRUSTED_PROXIES entry: ${entry}`);

  const prefixLength = separatorIndex >= 0
    ? Number(entry.slice(separatorIndex + 1))
    : parsedAddress.bits;
  if (!Number.isInteger(prefixLength) || prefixLength < 0 || prefixLength > parsedAddress.bits) {
    throw new Error(`Invalid TRUSTED_PROXIES CIDR prefix: ${entry}`);
  }

  const hostBits = parsedAddress.bits - prefixLength;
  const mask = prefixLength === 0
    ? 0n
    : ((1n << BigInt(prefixLength)) - 1n) << BigInt(hostBits);

  return {
    version: parsedAddress.version,
    bits: parsedAddress.bits,
    network: parsedAddress.value & mask,
    mask
  };
}

function isTrustedProxy(address, trustedProxyRanges) {
  return trustedProxyRanges.some((range) => (
    range.version === address.version &&
    (address.value & range.mask) === range.network
  ));
}

function ipKey(address) {
  return `${address.version}:${address.value.toString(16)}`;
}

function parseIpAddress(rawAddress) {
  const address = extractIpAddress(rawAddress).toLowerCase();
  if (!address) return null;

  const ipv4 = parseIpv4Address(address);
  if (ipv4 !== null) {
    return { version: 4, bits: 32, value: ipv4 };
  }

  const ipv6 = parseIpv6Address(address);
  if (ipv6 === null) return null;

  if (ipv6 >> 32n === 0xffffn) {
    return { version: 4, bits: 32, value: ipv6 & 0xffffffffn };
  }

  return { version: 6, bits: 128, value: ipv6 };
}

function extractIpAddress(rawAddress) {
  let address = String(rawAddress || '').trim();
  if (!address) return '';

  if (address.startsWith('"') && address.endsWith('"')) {
    address = address.slice(1, -1).replaceAll('\\"', '"').trim();
  }
  if (address.toLowerCase() === 'unknown') return '';

  if (address.startsWith('[')) {
    const closingBracket = address.indexOf(']');
    if (closingBracket > 0) return address.slice(1, closingBracket);
  }

  if (isIP(address)) return address;

  const colonCount = [...address].filter((char) => char === ':').length;
  if (colonCount === 1 && address.includes('.')) {
    const host = address.slice(0, address.lastIndexOf(':'));
    if (isIP(host) === 4) return host;
  }

  return address;
}

function parseIpv4Address(address) {
  const parts = address.split('.');
  if (parts.length !== 4) return null;

  let value = 0n;
  for (const part of parts) {
    if (!/^\d{1,3}$/.test(part)) return null;
    const byte = Number(part);
    if (byte < 0 || byte > 255) return null;
    value = (value << 8n) + BigInt(byte);
  }
  return value;
}

function parseIpv6Address(address) {
  const zoneIndex = address.indexOf('%');
  const withoutZone = zoneIndex >= 0 ? address.slice(0, zoneIndex) : address;
  if (!withoutZone.includes(':')) return null;

  let normalized = withoutZone;
  if (normalized.includes('.')) {
    const lastColon = normalized.lastIndexOf(':');
    const ipv4 = parseIpv4Address(normalized.slice(lastColon + 1));
    if (ipv4 === null) return null;

    const high = Number((ipv4 >> 16n) & 0xffffn).toString(16);
    const low = Number(ipv4 & 0xffffn).toString(16);
    normalized = `${normalized.slice(0, lastColon)}:${high}:${low}`;
  }

  const compressedParts = normalized.split('::');
  if (compressedParts.length > 2) return null;

  const left = compressedParts[0] ? compressedParts[0].split(':') : [];
  const right = compressedParts.length === 2 && compressedParts[1] ? compressedParts[1].split(':') : [];
  const explicitGroupCount = left.length + right.length;
  const missingGroupCount = 8 - explicitGroupCount;

  if (compressedParts.length === 1 && missingGroupCount !== 0) return null;
  if (compressedParts.length === 2 && missingGroupCount < 1) return null;

  const groups = [
    ...left,
    ...Array.from({ length: compressedParts.length === 2 ? missingGroupCount : 0 }, () => '0'),
    ...right
  ];
  if (groups.length !== 8) return null;

  let value = 0n;
  for (const group of groups) {
    if (!/^[0-9a-f]{1,4}$/.test(group)) return null;
    value = (value << 16n) + BigInt(Number.parseInt(group, 16));
  }
  return value;
}
