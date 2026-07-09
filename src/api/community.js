export const COMMUNITY_API_VERSION = 'v1';

const DEFAULT_STATUSES = ['published', 'review', 'draft'];
const ALLOWED_STATUSES = new Set(['published', 'review', 'draft', 'notreviewed', 'obsolete']);
const DEFAULT_SEARCH_LIMIT = 5;
const DEFAULT_ANSWER_LIMIT = 8;
const MAX_LIMIT = 20;
const SNIPPET_LENGTH = 500;

export function isCommunityApiPath(pathname = '') {
  return pathname === '/api/openapi.json' ||
    pathname === '/api/v1/health' ||
    pathname === '/api/v1/search' ||
    pathname === '/api/v1/answer' ||
    pathname.startsWith('/api/v1/');
}

export function communityCorsHeaders() {
  return {
    'access-control-allow-origin': '*',
    'access-control-allow-methods': 'GET, POST, OPTIONS',
    'access-control-allow-headers': 'content-type',
    'access-control-max-age': '86400'
  };
}

export function parseCommunitySearchRequest(url) {
  const query = String(url.searchParams.get('q') || url.searchParams.get('query') || '').trim();
  if (!query) throw publicApiError(400, 'missing_query', 'The q query parameter is required.');

  return {
    query,
    language: normalizeLanguage(url.searchParams.get('language')),
    statuses: parseStatuses([
      ...url.searchParams.getAll('status'),
      ...url.searchParams.getAll('statuses')
    ]),
    includeObsolete: parseBoolean(url.searchParams.get('include_obsolete') ?? url.searchParams.get('includeObsolete')),
    limit: parseLimit(url.searchParams.get('limit'), DEFAULT_SEARCH_LIMIT)
  };
}

export function parseCommunityAnswerRequest(body = {}) {
  const question = String(body.question || body.query || '').trim();
  if (!question) throw publicApiError(400, 'missing_question', 'The question field is required.');

  return {
    question,
    language: normalizeLanguage(body.language),
    statuses: parseStatuses(body.statuses ?? body.status ?? []),
    includeObsolete: parseBoolean(body.include_obsolete ?? body.includeObsolete),
    limit: parseLimit(body.limit ?? body.max_results, DEFAULT_ANSWER_LIMIT)
  };
}

export function communityHealthPayload(index, config) {
  return {
    ok: Boolean(index),
    api_version: COMMUNITY_API_VERSION,
    index: communityIndexPayload(index, config),
    is_pull_request: Boolean(config.isPullRequest)
  };
}

export function communitySearchPayload({ retrieval, index, config }) {
  return {
    query: retrieval.query,
    normalized_query: retrieval.normalized_query,
    filters: retrieval.filters,
    results: retrieval.results.map(publicSearchResult),
    index: communityIndexPayload(index, config)
  };
}

export function communityAnswerPayload({ question, language, answer, index, config }) {
  return {
    question,
    language,
    evidence_status: answer.evidence_status,
    answer: answer.answer || '',
    citations: (answer.citations || []).map(publicCitation),
    warnings: answer.warnings || [],
    index: communityIndexPayload(index, config)
  };
}

export function communityErrorPayload(error, index, config) {
  return {
    error: {
      code: error.publicApiCode || errorCodeForStatus(error.statusCode),
      message: error.message || 'Unexpected API error.'
    },
    index: communityIndexPayload(index, config)
  };
}

export function assertCommunityIndexReady(index) {
  if (!index?.chunks?.length) {
    throw publicApiError(503, 'index_unavailable', 'No search index is available. Run npm run index first.');
  }
}

export function publicApiError(statusCode, code, message) {
  const error = new Error(message);
  error.statusCode = statusCode;
  error.publicApiCode = code;
  return error;
}

export function openApiDocument() {
  return {
    openapi: '3.1.0',
    info: {
      title: 'Ask W3C i18n Community API',
      version: COMMUNITY_API_VERSION,
      description: 'Public, source-grounded search and answer endpoints for indexed W3C Internationalization guidance.'
    },
    paths: {
      '/api/v1/health': {
        get: {
          summary: 'Check API and index status',
          responses: {
            200: { description: 'Index and API status.' }
          }
        }
      },
      '/api/v1/search': {
        get: {
          summary: 'Search indexed source sections',
          parameters: [
            requiredQueryParam('q', 'Search query.'),
            queryParam('language', 'Preferred language, such as en or zh-hans.', 'en'),
            queryParam('status', 'Allowed source status. Repeat or comma-separate values.', 'published,review,draft'),
            queryParam('statuses', 'Alias for status. Repeat or comma-separate values.', 'published,review,draft'),
            queryParam('include_obsolete', 'Whether obsolete sources may be returned.', false),
            queryParam('limit', `Maximum results, capped at ${MAX_LIMIT}.`, DEFAULT_SEARCH_LIMIT)
          ],
          responses: {
            200: {
              description: 'Ranked source snippets.',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/SearchResponse' }
                }
              }
            },
            400: { $ref: '#/components/responses/BadRequest' },
            429: { $ref: '#/components/responses/RateLimitExceeded' },
            503: { $ref: '#/components/responses/IndexUnavailable' }
          }
        }
      },
      '/api/v1/answer': {
        post: {
          summary: 'Answer a question using indexed sources',
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/AnswerRequest' }
              }
            }
          },
          responses: {
            200: {
              description: 'A source-grounded answer with citations.',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/AnswerResponse' }
                }
              }
            },
            400: { $ref: '#/components/responses/BadRequest' },
            429: { $ref: '#/components/responses/RateLimitExceeded' },
            502: { $ref: '#/components/responses/GenerationError' },
            503: { $ref: '#/components/responses/IndexUnavailable' }
          }
        }
      }
    },
    components: {
      schemas: {
        AnswerRequest: {
          type: 'object',
          required: ['question'],
          properties: {
            question: { type: 'string' },
            language: { type: 'string', default: 'en' },
            statuses: {
              type: 'array',
              items: { type: 'string', enum: [...ALLOWED_STATUSES] },
              default: DEFAULT_STATUSES
            },
            status: {
              description: 'Alias for statuses. May be a string or an array.',
              oneOf: [
                { type: 'string', enum: [...ALLOWED_STATUSES] },
                { type: 'array', items: { type: 'string', enum: [...ALLOWED_STATUSES] } }
              ]
            },
            include_obsolete: { type: 'boolean', default: false },
            limit: { type: 'integer', minimum: 1, maximum: MAX_LIMIT, default: DEFAULT_ANSWER_LIMIT }
          }
        },
        AnswerResponse: {
          type: 'object',
          properties: {
            question: { type: 'string' },
            language: { type: 'string' },
            evidence_status: { type: 'string' },
            answer: { type: 'string' },
            citations: {
              type: 'array',
              items: { $ref: '#/components/schemas/Citation' }
            },
            warnings: {
              type: 'array',
              items: { $ref: '#/components/schemas/Warning' }
            },
            index: { $ref: '#/components/schemas/IndexSummary' }
          }
        },
        SearchResponse: {
          type: 'object',
          properties: {
            query: { type: 'string' },
            normalized_query: { type: 'string' },
            filters: { type: 'object' },
            results: {
              type: 'array',
              items: { $ref: '#/components/schemas/SearchResult' }
            },
            index: { $ref: '#/components/schemas/IndexSummary' }
          }
        },
        SearchResult: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            rank: { type: 'integer' },
            score: { type: 'number' },
            title: { type: 'string' },
            heading_path: { type: 'array', items: { type: 'string' } },
            url: { type: 'string' },
            language: { type: 'string' },
            status: { type: 'string' },
            translation_state: { type: 'string' },
            source_path: { type: 'string' },
            source_id: { type: 'string' },
            snippet: { type: 'string' }
          }
        },
        Citation: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            label: { type: 'string' },
            url: { type: 'string' },
            language: { type: 'string' },
            status: { type: 'string' },
            translation_state: { type: 'string' },
            source_path: { type: 'string' },
            rank: { type: 'integer' }
          }
        },
        Warning: {
          type: 'object',
          properties: {
            type: { type: 'string' },
            message: { type: 'string' }
          }
        },
        IndexSummary: {
          type: 'object',
          properties: {
            source_mode: { type: 'string' },
            source_repo_url: { type: 'string' },
            source_ref: { type: 'string' },
            source_commit: { type: 'string' },
            indexed_documents: { type: 'integer' },
            indexed_chunks: { type: 'integer' },
            last_indexed_at: { type: ['string', 'null'] }
          }
        },
        ErrorResponse: {
          type: 'object',
          properties: {
            error: {
              type: 'object',
              properties: {
                code: { type: 'string' },
                message: { type: 'string' }
              }
            },
            index: { $ref: '#/components/schemas/IndexSummary' }
          }
        }
      },
      responses: {
        BadRequest: {
          description: 'Invalid request.',
          content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } }
        },
        RateLimitExceeded: {
          description: 'Too many API requests in the current rate limit window.',
          content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } }
        },
        GenerationError: {
          description: 'Answer generation failed.',
          content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } }
        },
        IndexUnavailable: {
          description: 'No search index is loaded.',
          content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } }
        }
      }
    }
  };
}

function communityIndexPayload(index, config) {
  const payload = {
    source_mode: index?.source?.mode || config.sourceMode,
    source_repo_url: config.sourceRepoUrl,
    source_ref: index?.source?.ref || config.sourceRef,
    source_commit: index?.source?.commit || config.sourceCommit || '',
    indexed_documents: index?.documents?.length || 0,
    indexed_chunks: index?.chunks?.length || 0,
    last_indexed_at: index?.summary?.finished_at || null
  };

  if (index?.sources?.length > 1) {
    payload.source_mode = 'multi';
    payload.sources = index.sources;
  }

  return payload;
}

function publicSearchResult(chunk) {
  const result = {
    id: chunk.chunk_id,
    rank: chunk.rank,
    score: chunk.score,
    title: chunk.title,
    heading_path: chunk.heading_path || [],
    url: chunk.section_url,
    language: chunk.language,
    status: chunk.status,
    translation_state: chunk.translation_state,
    source_path: chunk.source_path,
    snippet: snippet(chunk.text)
  };

  if (chunk.source_id) result.source_id = chunk.source_id;
  return result;
}

function publicCitation(citation) {
  return {
    id: citation.chunk_id,
    label: citation.label,
    url: citation.url,
    language: citation.language,
    status: citation.status,
    translation_state: citation.translation_state,
    source_path: citation.source_path,
    rank: citation.rank
  };
}

function normalizeLanguage(language) {
  return String(language || 'en').trim().toLowerCase() || 'en';
}

function parseStatuses(values) {
  const statuses = (Array.isArray(values) ? values : [values])
    .flatMap((value) => String(value || '').split(','))
    .map((status) => status.trim().toLowerCase())
    .filter(Boolean);

  if (statuses.length === 0) return DEFAULT_STATUSES;

  const invalid = statuses.find((status) => !ALLOWED_STATUSES.has(status));
  if (invalid) {
    throw publicApiError(400, 'invalid_status', `Unsupported status filter: ${invalid}.`);
  }

  return [...new Set(statuses)];
}

function parseLimit(value, fallback) {
  if (value === undefined || value === null || value === '') return fallback;
  const limit = Number(value);
  if (!Number.isInteger(limit) || limit < 1) {
    throw publicApiError(400, 'invalid_limit', `Limit must be an integer between 1 and ${MAX_LIMIT}.`);
  }
  return Math.min(limit, MAX_LIMIT);
}

function parseBoolean(value) {
  return ['1', 'true', 'yes', 'on'].includes(String(value || '').toLowerCase());
}

function snippet(text) {
  const normalized = String(text || '').replace(/\s+/g, ' ').trim();
  if (normalized.length <= SNIPPET_LENGTH) return normalized;
  return `${normalized.slice(0, SNIPPET_LENGTH - 1).trimEnd()}...`;
}

function errorCodeForStatus(statusCode) {
  return {
    400: 'bad_request',
    413: 'request_too_large',
    429: 'rate_limit_exceeded',
    502: 'generation_error',
    503: 'index_unavailable'
  }[statusCode] || 'internal_error';
}

function queryParam(name, description, example) {
  return {
    name,
    in: 'query',
    required: false,
    schema: typeof example === 'boolean'
      ? { type: 'boolean', default: example }
      : typeof example === 'number'
        ? { type: 'integer', default: example }
        : { type: 'string', example },
    description
  };
}

function requiredQueryParam(name, description) {
  return {
    name,
    in: 'query',
    required: true,
    schema: { type: 'string' },
    description
  };
}
