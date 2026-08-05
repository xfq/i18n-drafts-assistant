import { appendFile, mkdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

const DEFAULT_QUERY_LOG_MAX_BYTES = 10 * 1024 * 1024;
const DEFAULT_QUERY_LOG_BACKUPS = 3;

// Serializes appends and rotations so concurrent requests cannot interleave
// a rename with a write to the same log file.
let queryLogQueue = Promise.resolve();

export async function saveIndex(index, indexPath = '.data/index.json') {
  await mkdir(dirname(indexPath), { recursive: true });
  await writeFile(indexPath, JSON.stringify(index, null, 2), 'utf8');
}

export async function loadIndex(indexPath = '.data/index.json') {
  const raw = await readFile(indexPath, 'utf8');
  return JSON.parse(raw);
}

export async function appendQueryLog(entry, logPath = '.data/query-log.jsonl', options = {}) {
  const maxBytes = positiveFiniteNumber(options.maxBytes, DEFAULT_QUERY_LOG_MAX_BYTES);
  const backups = nonNegativeInteger(options.backups, DEFAULT_QUERY_LOG_BACKUPS);
  const run = queryLogQueue.then(async () => {
    await mkdir(dirname(logPath), { recursive: true });
    const safeEntry = {
      timestamp: new Date().toISOString(),
      question: entry.question,
      language: entry.language,
      statuses: entry.statuses,
      retrieved_source_ids: entry.retrieved_source_ids,
      evidence_status: entry.evidence_status,
      latency_ms: entry.latency_ms,
      error_type: entry.error_type || ''
    };
    const line = `${JSON.stringify(safeEntry)}\n`;
    const currentSize = await stat(logPath).then((stats) => stats.size, () => 0);
    if (currentSize > 0 && currentSize + Buffer.byteLength(line) > maxBytes) {
      await rotateQueryLog(logPath, backups);
    }
    await appendFile(logPath, line, 'utf8');
  });
  queryLogQueue = run.catch(() => {});
  await run;
}

function positiveFiniteNumber(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function nonNegativeInteger(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? Math.floor(parsed) : fallback;
}

async function rotateQueryLog(logPath, backups) {
  if (backups === 0) {
    await rm(logPath, { force: true });
    return;
  }

  // Drop the oldest backup, then shift the chain down before moving the
  // current file into position 1, so every step has a free destination.
  await rm(`${logPath}.${backups}`, { force: true });
  for (let index = backups - 1; index >= 1; index -= 1) {
    await rename(`${logPath}.${index}`, `${logPath}.${index + 1}`).catch((error) => {
      if (error.code !== 'ENOENT') throw error;
    });
  }
  await rename(logPath, `${logPath}.1`);
}
