# Ask W3C i18n

Ask W3C i18n answers questions about W3C Internationalization guidance with source-grounded citations and source status.

<p align="center">
  <a href="https://i18n-drafts-assistant.onrender.com/"><strong>Try it online</strong></a>
</p>

> **Unofficial project:** This is currently an unofficial project and is not an official W3C service.

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
- `TRUSTED_PROXIES=` (empty by default; forwarded client IP headers are ignored)

`MODEL_PROVIDER=local` uses a deterministic extractive answerer over retrieved chunks. To use an external server-side model, set:

```sh
MODEL_PROVIDER=openai-compatible
MODEL_API_KEY=...
MODEL_BASE_URL=https://api.openai.com/v1
GENERATION_MODEL=...
MODEL_TIMEOUT_MS=30000
```

API keys are read only by the Node server and are never sent to the browser.

For deployments behind a reverse proxy or CDN, set `TRUSTED_PROXIES` to the proxy IPs or CIDR ranges that are allowed to set `Forwarded` or `X-Forwarded-For` headers:

```sh
TRUSTED_PROXIES=127.0.0.1/32,::1
```

When this is unset, rate limiting deliberately uses the direct socket address only so public clients cannot spoof forwarded IP headers to bypass limits.

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

## Community API

The stable community API is versioned under `/api/v1`. It uses the latest loaded index only; answer and search requests do not clone or fetch sources.

OpenAPI documentation is available at:

```sh
curl http://127.0.0.1:3000/api/openapi.json
```

Search indexed source sections:

```sh
curl "http://127.0.0.1:3000/api/v1/search?q=declare%20UTF-8&language=en&status=published&limit=5"
```

Search returns ranked snippets, not full debug chunks:

```json
{
  "query": "declare UTF-8",
  "results": [
    {
      "id": "articles/http-charset/index.en.html#charset",
      "rank": 1,
      "score": 1.23,
      "title": "Declaring character encodings in HTML",
      "url": "https://www.w3.org/International/articles/http-charset/#charset",
      "language": "en",
      "status": "published",
      "translation_state": "current",
      "snippet": "For HTML pages, use UTF-8..."
    }
  ],
  "index": {
    "source_ref": "gh-pages",
    "source_commit": "..."
  }
}
```

Answer a question with citations:

```sh
curl -X POST http://127.0.0.1:3000/api/v1/answer \
  -H "content-type: application/json" \
  -d '{"question":"How should I declare UTF-8 character encoding?","language":"en","statuses":["published"]}'
```

Answer responses have this shape:

```json
{
  "question": "How should I declare UTF-8 character encoding?",
  "language": "en",
  "evidence_status": "supported",
  "answer": "... [1]",
  "citations": [
    {
      "id": "articles/http-charset/index.en.html#charset",
      "label": "Declaring character encodings in HTML: The charset parameter",
      "url": "https://www.w3.org/International/articles/http-charset/#charset",
      "language": "en",
      "status": "published",
      "translation_state": "current",
      "source_path": "articles/http-charset/index.en.html",
      "rank": 1
    }
  ],
  "warnings": [],
  "index": {
    "source_ref": "gh-pages",
    "source_commit": "..."
  }
}
```

Supported filters:

- `language`: preferred BCP 47 language tag, default `en`.
- `status` or `statuses`: one or more of `published`, `review`, `draft`, `notreviewed`, `obsolete`.
- `include_obsolete`: set to `true` to allow obsolete sources.
- `limit`: maximum retrieval results, capped at `20`.

Errors use a stable object:

```json
{
  "error": {
    "code": "index_unavailable",
    "message": "No search index is available. Run npm run index first."
  },
  "index": {
    "source_ref": "gh-pages",
    "source_commit": "..."
  }
}
```

CORS is enabled for the community API. The same in-memory rate limiter applies to all `/api/` routes.

## Internal API

- `GET /api/health` returns source mode, ref, commit, and index counts.
- `POST /api/retrieve` returns ranked source chunks for debug and development.
- `POST /api/ask` returns `{ answer, citations, warnings, evidence_status, debug }`.
- `POST /api/admin/reindex` is hidden unless `ADMIN_TOKEN` is set and must be called with `x-admin-token`.

## Data Model

The prototype stores JSON in `.data/index.json`:

- `documents`: source metadata, status, translation state, canonical URL, hash.
- `chunks`: semantic section chunks with section URLs and heading paths.
- `index_runs`: source mode, ref, commit, counts, warnings, and errors.

Query logs are JSONL at `.data/query-log.jsonl` and store question text, selected language, filters, retrieved source ids, evidence status, latency, and error type. They do not store API keys or account identifiers.
