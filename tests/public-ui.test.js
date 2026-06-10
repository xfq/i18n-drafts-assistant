import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('public UI omits the retired retrieved-sources panel', async () => {
  const page = await readFile(new URL('../public/index.html', import.meta.url), 'utf8');

  assert.doesNotMatch(page, /source-panel/);
  assert.doesNotMatch(page, /id="sources"/);
  assert.doesNotMatch(page, /source-count/);
  assert.doesNotMatch(page, /Inspect retrieval/);
});
