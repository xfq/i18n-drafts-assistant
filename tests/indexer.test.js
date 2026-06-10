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
