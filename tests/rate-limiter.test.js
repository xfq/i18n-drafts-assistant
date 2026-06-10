import test from 'node:test';
import assert from 'node:assert/strict';
import { createRateLimiter } from '../src/rate-limit.js';

test('rate limiter keys requests by forwarded client only from trusted proxies', () => {
  const limiter = createRateLimiter(60_000, 1, { trustedProxies: ['127.0.0.1/32'] });

  const first = applyLimit(limiter, {
    remoteAddress: '::ffff:127.0.0.1',
    headers: { 'x-forwarded-for': '198.51.100.10' }
  });
  const sameClient = applyLimit(limiter, {
    remoteAddress: '::ffff:127.0.0.1',
    headers: { 'x-forwarded-for': '198.51.100.10' }
  });
  const differentClient = applyLimit(limiter, {
    remoteAddress: '::ffff:127.0.0.1',
    headers: { 'x-forwarded-for': '198.51.100.11' }
  });

  assert.equal(first.allowed, true);
  assert.equal(sameClient.allowed, false);
  assert.equal(sameClient.statusCode, 429);
  assert.equal(differentClient.allowed, true);
});

test('rate limiter uses the nearest untrusted forwarded hop', () => {
  const limiter = createRateLimiter(60_000, 1, { trustedProxies: ['127.0.0.1/32'] });

  const first = applyLimit(limiter, {
    remoteAddress: '127.0.0.1',
    headers: { 'x-forwarded-for': '203.0.113.1, 198.51.100.20' }
  });
  const spoofedLeftmost = applyLimit(limiter, {
    remoteAddress: '127.0.0.1',
    headers: { 'x-forwarded-for': '203.0.113.2, 198.51.100.20' }
  });
  const differentClient = applyLimit(limiter, {
    remoteAddress: '127.0.0.1',
    headers: { 'x-forwarded-for': '203.0.113.3, 198.51.100.21' }
  });

  assert.equal(first.allowed, true);
  assert.equal(spoofedLeftmost.allowed, false);
  assert.equal(spoofedLeftmost.statusCode, 429);
  assert.equal(differentClient.allowed, true);
});

test('rate limiter accepts standard Forwarded headers from trusted proxies', () => {
  const limiter = createRateLimiter(60_000, 1, { trustedProxies: ['127.0.0.1/32'] });

  const first = applyLimit(limiter, {
    remoteAddress: '127.0.0.1',
    headers: { forwarded: 'for=198.51.100.40;proto=https' }
  });
  const sameClient = applyLimit(limiter, {
    remoteAddress: '127.0.0.1',
    headers: { forwarded: 'for=198.51.100.40;proto=https' }
  });
  const differentClient = applyLimit(limiter, {
    remoteAddress: '127.0.0.1',
    headers: { forwarded: 'for=198.51.100.41;proto=https' }
  });

  assert.equal(first.allowed, true);
  assert.equal(sameClient.allowed, false);
  assert.equal(sameClient.statusCode, 429);
  assert.equal(differentClient.allowed, true);
});

test('rate limiter ignores forwarded headers from untrusted peers', () => {
  const limiter = createRateLimiter(60_000, 1, { trustedProxies: [] });

  const first = applyLimit(limiter, {
    remoteAddress: '127.0.0.1',
    headers: { 'x-forwarded-for': '198.51.100.30' }
  });
  const spoofed = applyLimit(limiter, {
    remoteAddress: '127.0.0.1',
    headers: { 'x-forwarded-for': '198.51.100.31' }
  });

  assert.equal(first.allowed, true);
  assert.equal(spoofed.allowed, false);
  assert.equal(spoofed.statusCode, 429);
});

function applyLimit(limiter, { remoteAddress, headers = {} }) {
  const response = {
    statusCode: null,
    body: null,
    writeHead(statusCode) {
      this.statusCode = statusCode;
    },
    end(body) {
      this.body = body;
    }
  };

  return {
    allowed: limiter({ socket: { remoteAddress }, headers }, response),
    statusCode: response.statusCode,
    body: response.body
  };
}
