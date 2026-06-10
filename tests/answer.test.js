import test from 'node:test';
import assert from 'node:assert/strict';
import { answerFromRetrieval } from '../src/generation/answer.js';
import { validateCitationsForEvidence } from '../src/generation/citations.js';
import { buildPrompt } from '../src/generation/prompt.js';

const reviewChunk = {
  chunk_id: 'questions/qa-link-lang.en.html#link-language',
  source_path: 'questions/qa-link-lang.en.html',
  section_url: 'https://www.w3.org/International/questions/qa-link-lang#link-language',
  title: 'Link language declarations',
  heading_path: ['Use hreflang for linked resources'],
  language: 'en',
  status: 'review',
  translation_state: 'unknown',
  text: 'The hreflang attribute indicates the language of a linked resource. Review-stage guidance may change before publication.',
  score: 0.74,
  rank: 1
};

const publishedChunk = {
  chunk_id: 'articles/http-charset/index.en.html#charset',
  source_path: 'articles/http-charset/index.en.html',
  section_url: 'https://www.w3.org/International/articles/http-charset/#charset',
  title: 'Declaring character encoding in HTML',
  heading_path: ['The charset parameter'],
  language: 'en',
  status: 'published',
  translation_state: 'current',
  text: 'For HTML pages, use UTF-8 and declare the character encoding early in the document.',
  score: 0.52,
  rank: 2
};

test('supported answers include citations and draft/review warnings', async () => {
  const response = await answerFromRetrieval({
    question: 'What does hreflang indicate?',
    language: 'en',
    retrieval: { results: [reviewChunk], debug: { query: 'What does hreflang indicate?' } },
    enableDebug: true,
    modelProvider: 'local'
  });

  assert.equal(response.evidence_status, 'supported');
  assert.match(response.answer, /\[1\]/);
  assert.equal(response.citations.length, 1);
  assert.equal(response.citations[0].status, 'review');
  assert(response.warnings.some((warning) => warning.type === 'uses_draft_or_review'));
  assert(response.debug.final_context.includes('hreflang'));
});

test('answer instructions avoid naming the site corpus as the speaker', async () => {
  const prompt = buildPrompt({
    question: 'How should I declare UTF-8 character encoding in HTML?',
    language: 'en',
    chunks: [publishedChunk]
  });

  assert.match(prompt.system, /Do not introduce answers by naming W3C i18n content or sources as the speaker/i);

  const response = await answerFromRetrieval({
    question: 'How should I declare UTF-8 character encoding in HTML?',
    language: 'en',
    retrieval: { results: [publishedChunk] },
    modelProvider: 'local'
  });

  assert.doesNotMatch(response.answer, /From the indexed W3C i18n content/i);
  assert.doesNotMatch(response.answer, /W3C i18n (?:content|sources) (?:says|say|could)/i);
  assert.match(response.answer, /UTF-8.*\[1\]/i);
});

test('mostly draft or review evidence uses stronger warning', async () => {
  const response = await answerFromRetrieval({
    question: 'What does hreflang indicate?',
    language: 'en',
    retrieval: { results: [reviewChunk, { ...reviewChunk, chunk_id: 'draft#x', status: 'draft', rank: 2 }] },
    modelProvider: 'local'
  });

  assert(response.warnings.some((warning) => warning.type === 'primarily_draft_or_review'));
});

test('selected non-English answer discloses English fallback when no selected-language citation is used', async () => {
  const response = await answerFromRetrieval({
    question: 'hreflang 表示什么？',
    language: 'zh-hans',
    retrieval: { results: [reviewChunk] },
    modelProvider: 'local'
  });

  assert(response.warnings.some((warning) => warning.type === 'english_fallback'));
});

test('citation validation fails closed for supported answers without citations', () => {
  const validated = validateCitationsForEvidence({
    answer: 'Use UTF-8.',
    citations: [],
    evidence_status: 'supported',
    warnings: []
  });

  assert.equal(validated.evidence_status, 'insufficient_evidence');
  assert.equal(validated.citations.length, 0);
});

test('citation validation keeps answer references aligned with returned citations', () => {
  const citations = [
    { chunk_id: 'source-1', label: 'Source 1' },
    { chunk_id: 'source-2', label: 'Source 2' },
    { chunk_id: 'source-3', label: 'Source 3' },
    { chunk_id: 'source-4', label: 'Source 4' }
  ];

  const validated = validateCitationsForEvidence({
    answer: 'Use quick tips for concise guidance [3]. Use Unicode design guidance for implementation details [4].',
    citations,
    evidence_status: 'supported',
    warnings: []
  });

  assert.equal(validated.answer, 'Use quick tips for concise guidance [1]. Use Unicode design guidance for implementation details [2].');
  assert.deepEqual(validated.citations.map((citation) => citation.chunk_id), ['source-3', 'source-4']);
});

test('answer generation exposes citations for every chunk shown to the model', async () => {
  const response = await answerFromRetrieval({
    question: 'How should I declare UTF-8 character encoding in HTML?',
    language: 'en',
    retrieval: {
      results: [
        publishedChunk,
        { ...publishedChunk, chunk_id: 'source-2', source_path: 'source-2.html', rank: 2 },
        { ...publishedChunk, chunk_id: 'source-3', source_path: 'source-3.html', rank: 3 },
        { ...publishedChunk, chunk_id: 'source-4', source_path: 'source-4.html', rank: 4 }
      ]
    },
    modelProvider: 'local'
  });

  assert.equal(response.citations.length, 4);
  assert.equal(response.citations[3].chunk_id, 'source-4');
});

test('conflict questions with mixed published and review evidence are treated as partial', async () => {
  const response = await answerFromRetrieval({
    question: 'Is there a conflict between published charset guidance and review hreflang guidance?',
    language: 'en',
    retrieval: { results: [reviewChunk, publishedChunk] },
    modelProvider: 'local'
  });

  assert.equal(response.evidence_status, 'partially_supported');
  assert.match(response.answer, /could not confirm a direct conflict/i);
  assert(response.warnings.some((warning) => warning.type === 'uses_draft_or_review'));
});
