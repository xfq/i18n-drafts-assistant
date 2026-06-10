import { mkdir, readFile, writeFile, appendFile } from 'node:fs/promises';
import { dirname } from 'node:path';

export async function saveIndex(index, indexPath = '.data/index.json') {
  await mkdir(dirname(indexPath), { recursive: true });
  await writeFile(indexPath, JSON.stringify(index, null, 2), 'utf8');
}

export async function loadIndex(indexPath = '.data/index.json') {
  const raw = await readFile(indexPath, 'utf8');
  return JSON.parse(raw);
}

export async function appendQueryLog(entry, logPath = '.data/query-log.jsonl') {
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
  await appendFile(logPath, `${JSON.stringify(safeEntry)}\n`, 'utf8');
}
