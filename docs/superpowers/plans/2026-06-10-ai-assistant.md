# AI Assistant Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a local/public-ready W3C Internationalization RAG assistant from the PRD.

**Architecture:** A dependency-free Node.js application indexes a local or cached `i18n-drafts` checkout into JSON documents/chunks, serves retrieval and answer APIs, and renders a static accessible web UI. Retrieval is hybrid lexical plus deterministic local vector scoring; generation is provider-abstracted with a local extractive fallback and citation validation.

**Tech Stack:** Node.js 24 ESM, `node:test`, native `http`, native `fetch`, JSON index store, static HTML/CSS/JS.

---

### Task 1: Parser, Translation Metadata, and Canonical URLs

**Files:**
- Create: `src/indexing/canonical-url.js`
- Create: `src/indexing/parse-translations.js`
- Create: `src/indexing/parse-html.js`
- Test: `tests/parser.test.js`
- Fixture: `tests/fixtures/i18n-mini/articles/http-charset/index.en.html`
- Fixture: `tests/fixtures/i18n-mini/articles/http-charset/index.zh-hans.html`
- Fixture: `tests/fixtures/i18n-mini/articles/http-charset/index-data/translations.js`

- [x] Write failing parser tests before implementation.
- [x] Run `node --test tests/parser.test.js` and verify module-not-found failure.
- [x] Implement metadata, translation-state, and canonical URL helpers.
- [x] Re-run parser tests and verify they pass.

### Task 2: Discovery, Chunking, and Index Store

**Files:**
- Create: `src/indexing/discover.js`
- Create: `src/indexing/chunk.js`
- Create: `src/indexing/indexer.js`
- Create: `src/indexing/source-sync.js`
- Create: `src/db/store.js`
- Test: `tests/indexer.test.js`

- [x] Write failing indexer/chunker tests before implementation.
- [x] Run `node --test tests/indexer.test.js` and verify module-not-found failure.
- [x] Implement source discovery, semantic chunking, JSON index writes, local/git source acquisition.
- [x] Re-run indexer tests and verify they pass.

### Task 3: Hybrid Retrieval

**Files:**
- Create: `src/retrieval/text.js`
- Create: `src/retrieval/hybrid.js`
- Test: `tests/retrieval.test.js`

- [x] Write failing retrieval tests before implementation.
- [x] Run `node --test tests/retrieval.test.js` and verify module-not-found failure.
- [x] Implement tokenization, keyword score, hashed-vector score, metadata filters, status/language ranking.
- [x] Re-run retrieval tests and verify they pass.

### Task 4: Answer Generation, Warnings, and Citation Enforcement

**Files:**
- Create: `src/generation/prompt.js`
- Create: `src/generation/citations.js`
- Create: `src/generation/model-client.js`
- Create: `src/generation/answer.js`
- Test: `tests/answer.test.js`

- [x] Write failing answer tests before implementation.
- [x] Run `node --test tests/answer.test.js` and verify module-not-found failure.
- [x] Implement source-grounded answer contract, draft/review warnings, English fallback disclosure, provider abstraction, and no-citation fallback.
- [x] Re-run answer tests and verify they pass.

### Task 5: HTTP API and Public UI

**Files:**
- Create: `src/config.js`
- Create: `src/server.js`
- Create: `public/index.html`
- Create: `public/styles.css`
- Create: `public/app.js`
- Test: `tests/api.test.js`

- [x] Write failing API tests before implementation.
- [x] Run `node --test tests/api.test.js` and verify module-not-found failure.
- [x] Implement `/api/ask`, `/api/retrieve`, `/api/health`, protected `/api/admin/reindex`, static UI, rate limiting, escaped rendering.
- [x] Re-run API tests and verify they pass.

### Task 6: Evaluation and Documentation

**Files:**
- Create: `src/evals/cases.json`
- Create: `src/evals/run.js`
- Create: `README.md`
- Create: `.env.example`
- Modify: `package.json`

- [x] Add 25 evaluation cases covering PRD categories.
- [x] Document setup, local/git indexing, server run, evals, and provider configuration.
- [x] Run `npm test`, `npm run eval`, and `npm run index -- --source-mode=local --source-repo-path=tests/fixtures/i18n-mini`.
- [ ] Run `npm run start` smoke check. Blocked by local port sandbox approval failure in this environment; API server path is covered by `npm test`.
