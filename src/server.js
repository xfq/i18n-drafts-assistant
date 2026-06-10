import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { getConfig } from './config.js';
import { loadIndex, appendQueryLog } from './db/store.js';
import { retrieve } from './retrieval/hybrid.js';
import { answerFromRetrieval } from './generation/answer.js';
import { runIndexer } from './indexing/indexer.js';
import { createRateLimiter } from './rate-limit.js';

const PUBLIC_DIR = new URL('../public/', import.meta.url).pathname;

export function createServer({ index = null, config = getConfig() } = {}) {
  const rateLimiter = createRateLimiter(config.rateLimitWindowMs, config.rateLimitMax, {
    trustedProxies: config.trustedProxies
  });

  return http.createServer(async (request, response) => {
    try {
      const url = new URL(request.url, `http://${request.headers.host || 'localhost'}`);

      if (url.pathname.startsWith('/api/')) {
        if (!rateLimiter(request, response)) return;
        await handleApi({ request, response, url, index, config });
        return;
      }

      await serveStatic(request, response, url);
    } catch (error) {
      sendJson(response, httpErrorStatus(error), {
        evidence_status: 'error',
        error: error.message
      });
    }
  });
}

async function handleApi({ request, response, url, index, config }) {
  if (request.method === 'GET' && url.pathname === '/api/health') {
    sendJson(response, 200, healthPayload(index, config));
    return;
  }

  if (request.method === 'POST' && url.pathname === '/api/retrieve') {
    const body = await readJson(request);
    assertIndexReady(index);
    const result = retrieve({
      query: body.query || body.question || '',
      language: body.language || 'en',
      statuses: body.statuses,
      includeObsolete: Boolean(body.includeObsolete),
      chunks: index.chunks,
      limit: Number(body.limit || 10)
    });
    sendJson(response, 200, config.enableDebug ? result : { results: result.results });
    return;
  }

  if (request.method === 'POST' && url.pathname === '/api/ask') {
    const started = Date.now();
    const body = await readJson(request);
    const question = String(body.question || '').trim();
    if (!question) {
      sendJson(response, 400, { evidence_status: 'error', error: 'Question is required.' });
      return;
    }
    assertIndexReady(index);
    const retrieval = retrieve({
      query: question,
      language: body.language || 'en',
      statuses: body.statuses,
      includeObsolete: Boolean(body.includeObsolete),
      chunks: index.chunks,
      limit: 8
    });
    const answer = await answerFromRetrieval({
      question,
      language: body.language || 'en',
      retrieval,
      enableDebug: config.enableDebug,
      modelProvider: config.modelProvider,
      modelApiKey: config.modelApiKey,
      modelBaseUrl: config.modelBaseUrl,
      generationModel: config.generationModel,
      modelTimeoutMs: config.modelTimeoutMs
    });

    appendQueryLog({
      question,
      language: body.language || 'en',
      statuses: body.statuses || ['published', 'review', 'draft'],
      retrieved_source_ids: retrieval.results.map((chunk) => chunk.chunk_id),
      evidence_status: answer.evidence_status,
      latency_ms: Date.now() - started,
      error_type: answer.evidence_status === 'error' ? 'generation' : ''
    }, config.queryLogPath).catch(() => {});

    sendJson(response, answer.evidence_status === 'error' ? 502 : 200, answer);
    return;
  }

  if (request.method === 'POST' && url.pathname === '/api/admin/reindex') {
    if (!config.adminToken) {
      sendJson(response, 404, { error: 'Not found.' });
      return;
    }
    if (request.headers['x-admin-token'] !== config.adminToken) {
      sendJson(response, 403, { error: 'Forbidden.' });
      return;
    }
    const newIndex = await runIndexer(config);
    index = newIndex;
    sendJson(response, 200, healthPayload(index, config));
    return;
  }

  sendJson(response, 404, { error: 'Not found.' });
}

function healthPayload(index, config) {
  return {
    ok: Boolean(index),
    source_mode: index?.source?.mode || config.sourceMode,
    source_repo_url: config.sourceRepoUrl,
    source_ref: index?.source?.ref || config.sourceRef,
    source_commit: index?.source?.commit || config.sourceCommit || '',
    indexed_documents: index?.documents?.length || 0,
    indexed_chunks: index?.chunks?.length || 0,
    last_indexed_at: index?.summary?.finished_at || null
  };
}

function assertIndexReady(index) {
  if (!index?.chunks?.length) {
    const error = new Error('No search index is available. Run npm run index first.');
    error.statusCode = 503;
    throw error;
  }
}

async function serveStatic(request, response, url) {
  if (request.method !== 'GET') {
    response.writeHead(405);
    response.end();
    return;
  }

  const path = url.pathname === '/' ? '/index.html' : url.pathname;
  if (!['/index.html', '/styles.css', '/app.js', '/markdown.js'].includes(path)) {
    response.writeHead(404);
    response.end('Not found');
    return;
  }

  const content = await readFile(join(PUBLIC_DIR, path));
  response.writeHead(200, { 'content-type': mimeType(path) });
  response.end(content);
}

async function readJson(request) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > 16_384) throw new Error('Request body is too large.');
    chunks.push(chunk);
  }
  return chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {};
}

function sendJson(response, statusCode, body) {
  response.writeHead(statusCode, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store'
  });
  response.end(JSON.stringify(body));
}

function httpErrorStatus(error) {
  const statusCode = Number(error?.statusCode || error?.status);
  return Number.isInteger(statusCode) && statusCode >= 400 && statusCode <= 599 ? statusCode : 500;
}

function mimeType(path) {
  return {
    '.html': 'text/html; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8'
  }[extname(path)] || 'application/octet-stream';
}

const currentFile = fileURLToPath(import.meta.url);
if (process.argv[1] === currentFile) {
  const config = getConfig();
  let index = null;
  try {
    if (config.sourceRefreshMode === 'startup') {
      index = await runIndexer(config);
    } else {
      index = await loadIndex(config.indexPath);
    }
  } catch (error) {
    console.error(`Index unavailable: ${error.message}`);
  }

  const server = createServer({ index, config });
  server.listen(config.port, () => {
    console.log(`Ask W3C i18n listening at http://127.0.0.1:${config.port}`);
  });
}
