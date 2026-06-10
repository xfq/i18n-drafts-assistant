# Ask W3C i18n

Public-facing AI assistant for W3C Internationalization content in the `w3c/i18n-drafts` repository.

It indexes a local or cached `w3c/i18n-drafts` checkout, retrieves source chunks with metadata, and returns answers with mandatory citations and draft/review warnings.

## Run Locally

Use a local source checkout:

```sh
cp .env.example .env
# edit .env and set SOURCE_MODE=local plus SOURCE_REPO_PATH

npm run index
npm run start
```

Use the default remote source:

```sh
SOURCE_MODE=git npm run index
npm run start
```

Open `http://127.0.0.1:3000`.

## Configuration

The app loads `.env` automatically from the project root. Copy `.env.example` to `.env` for local development, then edit values there.

Configuration precedence is:

1. explicit code/CLI overrides
2. shell environment variables
3. `.env`
4. built-in defaults

Do not commit real `.env` files or secrets.

Important defaults:

- `SOURCE_MODE=git`
- `SOURCE_REPO_URL=https://github.com/w3c/i18n-drafts.git`
- `SOURCE_REF=gh-pages`
- `SOURCE_CACHE_DIR=.cache/source/i18n-drafts`
- `PUBLIC_BASE_URL=https://www.w3.org/International`
- `MODEL_PROVIDER=local`

`MODEL_PROVIDER=local` uses a deterministic extractive answerer over retrieved chunks. To use an external server-side model, set:

```sh
MODEL_PROVIDER=openai-compatible
MODEL_API_KEY=...
MODEL_BASE_URL=https://api.openai.com/v1
GENERATION_MODEL=...
```

API keys are read only by the Node server and are never sent to the browser.

## Commands

```sh
npm test
npm run index
npm run rag:index
npm run eval
npm run start
```

For fixture development:

```sh
npm run index -- --source-mode=local --source-repo-path=tests/fixtures/i18n-mini
npm run eval
```

## API

- `GET /api/health` returns source mode, ref, commit, and index counts.
- `POST /api/retrieve` returns ranked source chunks for debug and development.
- `POST /api/ask` returns `{ answer, citations, warnings, evidence_status, debug }`.
- `POST /api/admin/reindex` is hidden unless `ADMIN_TOKEN` is set and must be called with `x-admin-token`.

Public answer requests only use the latest loaded index. They do not clone or fetch sources.

## Data Model

The prototype stores JSON in `.data/index.json`:

- `documents`: source metadata, status, translation state, canonical URL, hash.
- `chunks`: semantic section chunks with section URLs and heading paths.
- `index_runs`: source mode, ref, commit, counts, warnings, and errors.

Query logs are JSONL at `.data/query-log.jsonl` and store question text, selected language, filters, retrieved source ids, evidence status, latency, and error type. They do not store API keys or account identifiers.

## Notes

The implementation is dependency-free to make clean checkout setup reliable. Hybrid retrieval combines keyword scoring with deterministic hashed-vector similarity. This keeps the retrieval pipeline inspectable and replaceable by provider-backed embeddings later.
