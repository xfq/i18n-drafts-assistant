import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { buildIndex } from '../src/indexing/indexer.js';
import { createServer } from '../src/server.js';

const fixtureRoot = new URL('./fixtures/i18n-mini/', import.meta.url).pathname;

test('HTTP API serves health, retrieval, and cited answers without fetching sources on ask', async () => {
  const index = await buildIndex({
    sourceRoot: fixtureRoot,
    publicBaseUrl: 'https://www.w3.org/International',
    sourceMode: 'local',
    sourceRef: 'fixture',
    sourceCommit: 'fixture-sha',
    write: false
  });
  const app = createServer({
    index,
    config: {
      enableDebug: true,
      modelProvider: 'local',
      publicBaseUrl: 'https://www.w3.org/International',
      sourceMode: 'local',
      sourceRef: 'fixture',
      sourceRepoUrl: '',
      sourceCommit: 'fixture-sha',
      rateLimitWindowMs: 60_000,
      rateLimitMax: 20
    }
  });
  app.listen(0, '127.0.0.1');
  await once(app, 'listening');
  const { port } = app.address();

  try {
    const health = await fetch(`http://127.0.0.1:${port}/api/health`).then((response) => response.json());
    assert.equal(health.ok, true);
    assert.equal(health.indexed_documents, 4);

    const markdownModule = await fetch(`http://127.0.0.1:${port}/markdown.js`);
    assert.equal(markdownModule.status, 200);
    assert.match(await markdownModule.text(), /markdownToHtml/);

    const retrieved = await fetch(`http://127.0.0.1:${port}/api/retrieve`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ query: 'declare UTF-8 character encoding', language: 'en', statuses: ['published', 'review', 'draft'] })
    }).then((response) => response.json());
    assert.equal(retrieved.results[0].source_path, 'articles/http-charset/index.en.html');

    const answer = await fetch(`http://127.0.0.1:${port}/api/ask`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ question: 'How should I declare UTF-8 character encoding?', language: 'en', statuses: ['published', 'review', 'draft'], includeObsolete: false })
    }).then((response) => response.json());
    assert.equal(answer.evidence_status, 'supported');
    assert(answer.citations.length > 0);
    assert.equal(answer.debug.retrieved_after_ranking[0].source_path, 'articles/http-charset/index.en.html');
  } finally {
    app.close();
  }
});

test('HTTP API preserves expected API error status codes', async () => {
  const app = createServer({
    index: null,
    config: {
      enableDebug: true,
      modelProvider: 'local',
      publicBaseUrl: 'https://www.w3.org/International',
      sourceMode: 'local',
      sourceRef: 'fixture',
      sourceRepoUrl: '',
      sourceCommit: 'fixture-sha',
      rateLimitWindowMs: 60_000,
      rateLimitMax: 20
    }
  });
  app.listen(0, '127.0.0.1');
  await once(app, 'listening');
  const { port } = app.address();

  try {
    const response = await fetch(`http://127.0.0.1:${port}/api/retrieve`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ query: 'declare UTF-8 character encoding' })
    });
    const body = await response.json();

    assert.equal(response.status, 503);
    assert.equal(body.evidence_status, 'error');
    assert.match(body.error, /No search index is available/);
  } finally {
    app.close();
  }
});

test('HTTP API ask returns when the model provider times out', async () => {
  const index = await buildIndex({
    sourceRoot: fixtureRoot,
    publicBaseUrl: 'https://www.w3.org/International',
    sourceMode: 'local',
    sourceRef: 'fixture',
    sourceCommit: 'fixture-sha',
    write: false
  });
  const app = createServer({
    index,
    config: {
      enableDebug: true,
      modelProvider: 'openai-compatible',
      modelApiKey: 'test-key',
      modelBaseUrl: 'https://model.test/v1',
      modelTimeoutMs: 5,
      generationModel: 'gpt-5.5',
      publicBaseUrl: 'https://www.w3.org/International',
      sourceMode: 'local',
      sourceRef: 'fixture',
      sourceRepoUrl: '',
      sourceCommit: 'fixture-sha',
      rateLimitWindowMs: 60_000,
      rateLimitMax: 20
    }
  });
  app.listen(0, '127.0.0.1');
  await once(app, 'listening');
  const { port } = app.address();
  const previousFetch = globalThis.fetch;
  globalThis.fetch = async (url, options = {}) => {
    if (String(url).startsWith(`http://127.0.0.1:${port}`)) {
      return previousFetch(url, options);
    }

    const signal = options.signal;
    assert(signal, 'Expected provider fetch to receive an AbortSignal');
    return new Promise((_resolve, reject) => {
      signal.addEventListener('abort', () => {
        reject(signal.reason || new DOMException('The operation was aborted.', 'AbortError'));
      }, { once: true });
    });
  };

  try {
    const response = await fetch(`http://127.0.0.1:${port}/api/ask`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ question: 'How should I declare UTF-8 character encoding?', language: 'en' })
    });
    const body = await response.json();

    assert.equal(response.status, 502);
    assert.equal(body.evidence_status, 'error');
    assert.match(body.error, /Model provider request timed out after 5ms/);
  } finally {
    globalThis.fetch = previousFetch;
    app.close();
  }
});

test('HTTP API rate limiter keys requests by forwarded client only from trusted proxies', async () => {
  const app = createServer({
    index: null,
    config: {
      enableDebug: true,
      modelProvider: 'local',
      publicBaseUrl: 'https://www.w3.org/International',
      sourceMode: 'local',
      sourceRef: 'fixture',
      sourceRepoUrl: '',
      sourceCommit: 'fixture-sha',
      rateLimitWindowMs: 60_000,
      rateLimitMax: 1,
      trustedProxies: ['127.0.0.1/32']
    }
  });
  app.listen(0, '127.0.0.1');
  await once(app, 'listening');
  const { port } = app.address();

  try {
    const first = await fetch(`http://127.0.0.1:${port}/api/health`, {
      headers: { 'x-forwarded-for': '198.51.100.10' }
    });
    const sameClient = await fetch(`http://127.0.0.1:${port}/api/health`, {
      headers: { 'x-forwarded-for': '198.51.100.10' }
    });
    const differentClient = await fetch(`http://127.0.0.1:${port}/api/health`, {
      headers: { 'x-forwarded-for': '198.51.100.11' }
    });

    assert.equal(first.status, 200);
    assert.equal(sameClient.status, 429);
    assert.equal(differentClient.status, 200);
  } finally {
    app.close();
  }
});

test('HTTP API rate limiter uses the nearest untrusted forwarded hop', async () => {
  const app = createServer({
    index: null,
    config: {
      enableDebug: true,
      modelProvider: 'local',
      publicBaseUrl: 'https://www.w3.org/International',
      sourceMode: 'local',
      sourceRef: 'fixture',
      sourceRepoUrl: '',
      sourceCommit: 'fixture-sha',
      rateLimitWindowMs: 60_000,
      rateLimitMax: 1,
      trustedProxies: ['127.0.0.1/32']
    }
  });
  app.listen(0, '127.0.0.1');
  await once(app, 'listening');
  const { port } = app.address();

  try {
    const first = await fetch(`http://127.0.0.1:${port}/api/health`, {
      headers: { 'x-forwarded-for': '203.0.113.1, 198.51.100.20' }
    });
    const spoofedLeftmost = await fetch(`http://127.0.0.1:${port}/api/health`, {
      headers: { 'x-forwarded-for': '203.0.113.2, 198.51.100.20' }
    });
    const differentClient = await fetch(`http://127.0.0.1:${port}/api/health`, {
      headers: { 'x-forwarded-for': '203.0.113.3, 198.51.100.21' }
    });

    assert.equal(first.status, 200);
    assert.equal(spoofedLeftmost.status, 429);
    assert.equal(differentClient.status, 200);
  } finally {
    app.close();
  }
});

test('HTTP API rate limiter ignores forwarded headers from untrusted peers', async () => {
  const app = createServer({
    index: null,
    config: {
      enableDebug: true,
      modelProvider: 'local',
      publicBaseUrl: 'https://www.w3.org/International',
      sourceMode: 'local',
      sourceRef: 'fixture',
      sourceRepoUrl: '',
      sourceCommit: 'fixture-sha',
      rateLimitWindowMs: 60_000,
      rateLimitMax: 1,
      trustedProxies: []
    }
  });
  app.listen(0, '127.0.0.1');
  await once(app, 'listening');
  const { port } = app.address();

  try {
    const first = await fetch(`http://127.0.0.1:${port}/api/health`, {
      headers: { 'x-forwarded-for': '198.51.100.30' }
    });
    const spoofed = await fetch(`http://127.0.0.1:${port}/api/health`, {
      headers: { 'x-forwarded-for': '198.51.100.31' }
    });

    assert.equal(first.status, 200);
    assert.equal(spoofed.status, 429);
  } finally {
    app.close();
  }
});
