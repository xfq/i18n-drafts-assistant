import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, readdir, rm, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { appendQueryLog } from '../src/db/store.js';

async function tempLogFile(t) {
  const directory = await mkdtemp(join(tmpdir(), 'i18n-query-log-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  return join(directory, 'query-log.jsonl');
}

test('appendQueryLog writes one JSONL line per entry', async (t) => {
  const logPath = await tempLogFile(t);

  await appendQueryLog({ question: 'first', language: 'en' }, logPath);
  await appendQueryLog({ question: 'second', language: 'zh' }, logPath);

  const lines = (await readFile(logPath, 'utf8')).trim().split('\n');
  assert.equal(lines.length, 2);
  assert.equal(JSON.parse(lines[0]).question, 'first');
  assert.equal(JSON.parse(lines[0]).language, 'en');
  assert.equal(JSON.parse(lines[1]).question, 'second');
  assert.ok(JSON.parse(lines[0]).timestamp);
});

test('appendQueryLog rotates by size and keeps a bounded number of backups', async (t) => {
  const logPath = await tempLogFile(t);

  for (let index = 0; index < 30; index += 1) {
    await appendQueryLog({ question: `q-${index} ${'x'.repeat(120)}`, language: 'en' }, logPath, {
      maxBytes: 250,
      backups: 2
    });
  }

  const files = (await readdir(join(logPath, '..'))).filter((file) => file.startsWith('query-log.jsonl'));
  assert.deepEqual(files.sort(), ['query-log.jsonl', 'query-log.jsonl.1', 'query-log.jsonl.2']);

  const currentLines = (await readFile(logPath, 'utf8')).trim().split('\n');
  assert.ok(currentLines.length >= 1);
  assert.ok(currentLines.every((line) => line.length < 300));
  assert.ok(JSON.parse(currentLines.at(-1)).question.startsWith('q-29'));
});

test('appendQueryLog truncates the current file instead of keeping backups when backups is 0', async (t) => {
  const logPath = await tempLogFile(t);

  for (let index = 0; index < 10; index += 1) {
    await appendQueryLog({ question: `q-${index} ${'x'.repeat(120)}`, language: 'en' }, logPath, {
      maxBytes: 250,
      backups: 0
    });
  }

  const files = (await readdir(join(logPath, '..'))).filter((file) => file.startsWith('query-log.jsonl'));
  assert.deepEqual(files, ['query-log.jsonl']);

  const lines = (await readFile(logPath, 'utf8')).trim().split('\n');
  assert.equal(lines.length, 1);
  assert.ok(JSON.parse(lines[0]).question.startsWith('q-9'));
  assert.ok((await stat(logPath)).size < 300);
});
