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

test('public UI prominently states the project is unofficial', async () => {
  const page = await readFile(new URL('../public/index.html', import.meta.url), 'utf8');

  assert.match(page, /<aside class="project-notice" aria-label="Project status">/);
  assert.match(page, /currently an unofficial project/i);
});

test('project notice uses a shorter centered max width', async () => {
  const css = await readFile(new URL('../public/styles.css', import.meta.url), 'utf8');

  assert.match(css, /\.project-notice\s*{[^}]*inline-size:\s*min\(calc\(100% - 2rem\), 860px\);/s);
  assert.doesNotMatch(css, /\.project-notice\s*{[^}]*inline-size:\s*min\(calc\(100% - 2rem\), 1080px\);/s);
});

test('answer citation references use lighter type with micro spacing', async () => {
  const css = await readFile(new URL('../public/styles.css', import.meta.url), 'utf8');
  const citationRefRule = css.match(/\.answer-text \.citation-ref\s*{(?<body>[^}]*)}/s)?.groups.body || '';

  assert.match(citationRefRule, /font-weight:\s*620;/);
  assert.match(citationRefRule, /letter-spacing:\s*0\.02em;/);
});

test('public UI includes a bottom notice for pull request previews', async () => {
  const [page, css, app] = await Promise.all([
    readFile(new URL('../public/index.html', import.meta.url), 'utf8'),
    readFile(new URL('../public/styles.css', import.meta.url), 'utf8'),
    readFile(new URL('../public/app.js', import.meta.url), 'utf8')
  ]);

  assert.match(page, /<footer id="preview-notice" class="preview-notice" hidden>/);
  assert.match(page, /This is a PR preview\./);
  assert.match(css, /\.preview-notice\s*{[^}]*position:\s*fixed;[^}]*inset-block-end:\s*0;/s);
  assert.match(app, /previewNotice\.hidden\s*=\s*!health\.is_pull_request;/);
});
