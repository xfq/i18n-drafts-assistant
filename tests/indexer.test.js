import test from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { discoverContentFiles } from '../src/indexing/discover.js';
import { chunkHtmlPage } from '../src/indexing/chunk.js';
import { buildIndex } from '../src/indexing/indexer.js';

const fixtureRoot = new URL('./fixtures/i18n-mini/', import.meta.url).pathname;

test('content discovery indexes primary content roots and skips support data HTML', async () => {
  const files = await discoverContentFiles(fixtureRoot);

  assert(files.includes('articles/http-charset/index.en.html'));
  assert(files.includes('questions/qa-link-lang.en.html'));
  assert(!files.includes('articles/http-charset/index-data/example.html'));
});

test('chunker creates section citations with heading paths and anchors', () => {
  const page = {
    source_path: 'articles/http-charset/index.en.html',
    canonical_url: 'https://www.w3.org/International/articles/http-charset/',
    language: 'en',
    status: 'published',
    translation_state: 'current',
    title: 'Declaring character encoding in HTML',
    html: '<main><h1>Declaring character encoding in HTML</h1><section id="charset"><h2>The charset parameter</h2><p>Use UTF-8.</p></section></main>'
  };

  const chunks = chunkHtmlPage(page);
  assert.equal(chunks.length, 1);
  assert.equal(chunks[0].chunk_id, 'articles/http-charset/index.en.html#charset');
  assert.equal(chunks[0].section_url, 'https://www.w3.org/International/articles/http-charset/#charset');
  assert.deepEqual(chunks[0].heading_path, ['The charset parameter']);
  assert.equal(chunks[0].text, 'The charset parameter Use UTF-8.');
});

test('chunker emits separate chunks for nested sections', () => {
  const page = {
    source_path: 'articles/nested/index.en.html',
    canonical_url: 'https://www.w3.org/International/articles/nested/',
    language: 'en',
    status: 'published',
    translation_state: 'current',
    title: 'Nested sections test',
    html: [
      '<main><h1>Nested sections test</h1>',
      '<section id="outer">',
      '<h2>Outer heading</h2>',
      '<section id="inner">',
      '<h3>Inner heading</h3>',
      '<p>Inner content.</p>',
      '</section>',
      '<p>Outer trailing content.</p>',
      '</section>',
      '<section id="sibling">',
      '<h2>Sibling heading</h2>',
      '<p>Sibling content.</p>',
      '</section>',
      '</main>'
    ].join('')
  };

  const chunks = chunkHtmlPage(page);
  const ids = chunks.map((c) => c.section_id);

  assert(ids.includes('outer'), 'outer section should be chunked');
  assert(ids.includes('inner'), 'nested section should be chunked');
  assert(ids.includes('sibling'), 'sibling section should be chunked');

  const outer = chunks.find((c) => c.section_id === 'outer');
  const inner = chunks.find((c) => c.section_id === 'inner');
  const sibling = chunks.find((c) => c.section_id === 'sibling');

  assert.match(outer.text, /Outer heading/);
  assert.match(outer.text, /Inner content/);
  assert.match(outer.text, /Outer trailing content/);
  assert.match(inner.text, /Inner heading/);
  assert.match(inner.text, /Inner content/);
  assert.match(sibling.text, /Sibling heading/);
  assert.match(sibling.text, /Sibling content/);
});

test('indexer builds documents and chunks with source metadata', async () => {
  const index = await buildIndex({
    sourceRoot: fixtureRoot,
    publicBaseUrl: 'https://www.w3.org/International',
    sourceMode: 'local',
    sourceRef: 'fixture',
    sourceCommit: 'fixture-sha',
    write: false
  });

  assert.equal(index.source.mode, 'local');
  assert.equal(index.source.ref, 'fixture');
  assert.equal(index.source.commit, 'fixture-sha');
  assert.equal(index.documents.length, 4);
  assert(index.chunks.some((chunk) => chunk.chunk_id === 'articles/http-charset/index.en.html#charset'));
  assert(index.documents.some((doc) => doc.translation_state === 'out_of_date'));
  assert.equal(index.summary.skipped, 1);
});
