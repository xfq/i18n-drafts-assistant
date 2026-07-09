# Development Guide

This file describes the current project architecture and development workflow. Keep it current whenever project code changes.

## Architecture Summary

Ask W3C i18n is a Node.js 24 ESM application with no framework and no build
step. It has two main execution paths:

- Indexing path: read a `w3c/i18n-drafts` source tree, parse content pages, create document and chunk records, and write `.data/index.json`.
- Query path: serve a static browser UI, load the latest index into memory, retrieve relevant chunks, generate a cited answer, and log query metadata to `.data/query-log.jsonl`.

Answers must be based only on indexed W3C Internationalization sources.

## Framework Choice

The project intentionally does not use a web framework. The current shape is a small static UI plus a Node HTTP API, so framework routing, component conventions, bundling, and server-side rendering would mostly add dependency and build complexity without solving a current problem.

Keep this choice unless the product grows into a larger multi-page application, needs complex auth/session handling, server-side rendering, or a substantial client-side component system.

## Runtime

- `package.json` sets `"type": "module"` and requires Node `24.x`.
- `npm run start` and `npm run dev` both run `node src/server.js`.
- `npm run index` and `npm run rag:index` both run
  `node src/indexing/indexer.js`.
- `npm run eval` runs `node src/evals/run.js`.
- `npm test` runs the Node built-in test runner over `tests/*.test.js`.

There is no bundler, transpiler, database server, or client-side build pipeline.
The browser receives the files in `public/` directly from the Node server.

## Directory Map

- `src/server.js`: HTTP server, static file serving, API routing, in-memory index lifecycle, rate limiting, and admin reindex endpoint.
- `src/config.js`: `.env` parsing and runtime configuration assembly.
- `src/db/store.js`: JSON index persistence and JSONL query logging.
- `src/indexing/`: source sync, content discovery, HTML parsing,
  translation metadata parsing, canonical URL generation, chunk creation, and index writing.
- `src/retrieval/`: query normalization, tokenization, stemming, keyword scoring, hash-bucket vector similarity, status/language/translation boosts, and result ranking.
- `src/generation/`: prompt construction, local extractive answer generation, optional OpenAI-compatible model calls, citation construction, citation validation, and answer warnings.
- `src/rate-limit.js`: in-memory API rate limiting keyed by direct client IP or a trusted forwarded client IP.
- `src/evals/`: deterministic evaluation cases for retrieval and answer behavior against an existing index.
- `public/`: static HTML, CSS, and browser JavaScript for the public UI.
- `tests/`: Node test files plus `tests/fixtures/i18n-mini`, a minimal i18n-drafts-like corpus.
- `.cache/`: ignored local source checkout/cache when `SOURCE_MODE=git`.
- `.data/`: ignored local index and query log outputs.

## Indexing Pipeline

The indexer entry point is `runIndexer()` in `src/indexing/indexer.js`.

## Query Pipeline

The public query path starts in `src/server.js`.

Retrieval scoring combines two signals:

- `keyword_score`: direct overlap between normalized query tokens and chunk text.
- `vector_score`: each token is hashed into one of 128 fixed buckets, the bucket counts are normalized into a vector, and query/chunk vectors are compared with cosine similarity. This is a lightweight local similarity signal, not a neural embedding model. Hash collisions are possible, so it is blended with direct keyword evidence instead of used alone.

## Evaluation and Tests

Use the fixture corpus for deterministic local development:

```sh
npm run index -- --source-mode=local --source-repo-path=tests/fixtures/i18n-mini
npm run eval
```

Run the full test suite with:

```sh
npm test
```

## Pull Request Previews

Maintainers can add the `render-preview` label to a pull request to render the PR preview. The preview UI displays a bottom notice when it is running from a pull request preview environment.

## Change Guidelines

- Keep source ingestion, retrieval, and generation boundaries explicit. Avoid making `POST /api/ask` read or fetch source files.
- If index shape changes, update parser/chunker tests, API tests, eval expectations, and this file.
- If retrieval scoring changes, update retrieval tests and eval cases with the intended ranking behavior.
- If a new environment variable is added, update `src/config.js`, `.env.example`, `README.md` if user-facing, and this file.
- If security behavior changes, add or update tests.
- Treat `.cache/`, `.data/`, `.env`, and `node_modules/` as local-only ignored state.
