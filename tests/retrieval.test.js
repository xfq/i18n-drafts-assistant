import test from 'node:test';
import assert from 'node:assert/strict';
import { retrieve } from '../src/retrieval/hybrid.js';

const chunks = [
  {
    chunk_id: 'articles/http-charset/index.en.html#charset',
    source_path: 'articles/http-charset/index.en.html',
    section_url: 'https://www.w3.org/International/articles/http-charset/#charset',
    title: 'Declaring character encoding in HTML',
    heading_path: ['The charset parameter'],
    language: 'en',
    status: 'published',
    translation_state: 'current',
    text: 'For HTML pages, use UTF-8 and declare the character encoding early in the document.'
  },
  {
    chunk_id: 'articles/http-charset/index.zh-hans.html#charset',
    source_path: 'articles/http-charset/index.zh-hans.html',
    section_url: 'https://www.w3.org/International/articles/http-charset/#charset',
    title: '在 HTML 中声明字符编码',
    heading_path: ['charset 参数'],
    language: 'zh-hans',
    status: 'published',
    translation_state: 'out_of_date',
    text: 'HTML 页面应使用 UTF-8，并在文档开头声明字符编码。'
  },
  {
    chunk_id: 'questions/qa-link-lang.en.html#link-language',
    source_path: 'questions/qa-link-lang.en.html',
    section_url: 'https://www.w3.org/International/questions/qa-link-lang#link-language',
    title: 'Link language declarations',
    heading_path: ['Use hreflang for linked resources'],
    language: 'en',
    status: 'review',
    translation_state: 'unknown',
    text: 'The hreflang attribute indicates the language of a linked resource.'
  },
  {
    chunk_id: 'questions/qa-obsolete.en.html#old-advice',
    source_path: 'questions/qa-obsolete.en.html',
    section_url: 'https://www.w3.org/International/questions/qa-obsolete#old-advice',
    title: 'Obsolete example page',
    heading_path: ['Old advice'],
    language: 'en',
    status: 'obsolete',
    translation_state: 'unknown',
    text: 'This obsolete guidance should not appear unless obsolete content is explicitly included.'
  }
];

test('retrieval ranks exact technical terms and excludes obsolete by default', () => {
  const result = retrieve({
    query: 'How should I declare UTF-8 character encoding?',
    language: 'en',
    statuses: ['published', 'review', 'draft'],
    includeObsolete: false,
    chunks,
    limit: 5
  });

  assert.equal(result.results[0].chunk_id, 'articles/http-charset/index.en.html#charset');
  assert(!result.results.some((item) => item.status === 'obsolete'));
  assert(result.results[0].score > 0);
});

test('retrieval prefers selected language but keeps stronger current English fallback visible', () => {
  const result = retrieve({
    query: 'UTF-8 字符编码',
    language: 'zh-hans',
    statuses: ['published', 'review', 'draft'],
    includeObsolete: false,
    chunks,
    limit: 3
  });

  assert.equal(result.results[0].language, 'zh-hans');
  assert(result.results.some((item) => item.language === 'en'));
});

test('retrieval respects status filters', () => {
  const result = retrieve({
    query: 'hreflang linked resource language',
    language: 'en',
    statuses: ['published'],
    includeObsolete: false,
    chunks,
    limit: 5
  });

  assert(!result.results.some((item) => item.status === 'review'));
});

test('retrieval does not treat stopword overlap as enough evidence', () => {
  const result = retrieve({
    query: 'What payment API should I use for subscriptions?',
    language: 'en',
    statuses: ['published', 'review', 'draft'],
    includeObsolete: false,
    chunks,
    limit: 5
  });

  assert.equal(result.results.length, 0);
});

test('retrieval rejects chunks that only match one broad non-technical term', () => {
  const result = retrieve({
    query: 'How should I declare the language of an HTML page?',
    language: 'en',
    statuses: ['published', 'review', 'draft'],
    includeObsolete: false,
    chunks,
    limit: 5
  });

  assert.equal(result.results.length, 0);
});

test('retrieval does not leak published answers through excluded status filters', () => {
  const result = retrieve({
    query: 'How should I declare UTF-8 character encoding in HTML?',
    language: 'en',
    statuses: ['review'],
    includeObsolete: false,
    chunks,
    limit: 5
  });

  assert.equal(result.results.length, 0);
});
