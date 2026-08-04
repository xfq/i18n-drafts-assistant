import test from 'node:test';
import assert from 'node:assert/strict';
import { createRateLimiter, pruneExpiredBuckets } from '../src/rate-limit.js';

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

test('rate limiter resets a bucket after its window expires', () => {
  let fakeNow = 1_000;
  const limiter = createRateLimiter(60_000, 1, { now: () => fakeNow });

  const first = applyLimit(limiter, { remoteAddress: '203.0.113.10' });
  const blocked = applyLimit(limiter, { remoteAddress: '203.0.113.10' });
  fakeNow += 60_001;
  const afterWindow = applyLimit(limiter, { remoteAddress: '203.0.113.10' });
  const blockedAgain = applyLimit(limiter, { remoteAddress: '203.0.113.10' });

  assert.equal(first.allowed, true);
  assert.equal(blocked.allowed, false);
  assert.equal(blocked.statusCode, 429);
  assert.equal(afterWindow.allowed, true);
  assert.equal(blockedAgain.allowed, false);
});

test('pruneExpiredBuckets removes expired buckets and keeps active ones', () => {
  const buckets = new Map([
    ['first', { count: 1, resetAt: 1_000 }],
    ['second', { count: 2, resetAt: 2_000 }],
    ['third', { count: 3, resetAt: 1_500 }]
  ]);

  pruneExpiredBuckets(buckets, 1_600);

  assert.deepEqual([...buckets.keys()], ['second']);
});

test('rate limiter reclaims expired one-shot buckets at the cap without dropping active clients', () => {
  let fakeNow = 1_000;
  const limiter = createRateLimiter(60_000, 1, { now: () => fakeNow, maxBuckets: 2 });

  const firstClient = applyLimit(limiter, { remoteAddress: '198.51.100.1' });
  const secondClient = applyLimit(limiter, { remoteAddress: '198.51.100.2' });
  fakeNow += 61_000;
  const thirdClient = applyLimit(limiter, { remoteAddress: '198.51.100.3' });
  const thirdClientAgain = applyLimit(limiter, { remoteAddress: '198.51.100.3' });
  const firstClientAgain = applyLimit(limiter, { remoteAddress: '198.51.100.1' });

  assert.equal(firstClient.allowed, true);
  assert.equal(secondClient.allowed, true);
  assert.equal(thirdClient.allowed, true);
  assert.equal(thirdClientAgain.allowed, false);
  assert.equal(thirdClientAgain.statusCode, 429);
  assert.equal(firstClientAgain.allowed, true);
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
