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

test('public UI keeps the main ask flow accessible', async () => {
  const page = await readFile(new URL('../public/index.html', import.meta.url), 'utf8');

  assert.match(page, /class="skip-link" href="#content"/);
  assert.match(page, /<main id="content" class="app-shell" tabindex="-1">/);
  assert.match(page, /aria-describedby="question-help"/);
  assert.match(page, /<section id="message-area" class="message-area" aria-live="polite" aria-atomic="true"><\/section>/);
  assert.match(page, /<ol id="citations" class="citation-list" role="list" aria-label="Cited sources"><\/ol>/);
  assert.doesNotMatch(page, /aria-labelledby="ask-heading"/);
});
