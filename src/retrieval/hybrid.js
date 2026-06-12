import { cosineSimilarity, hashedVector, keywordMatchStats, normalizeQuery, tokenize } from './text.js';

const DEFAULT_STATUSES = ['published', 'review', 'draft'];

export function retrieve({
  query,
  language = 'en',
  statuses = DEFAULT_STATUSES,
  includeObsolete = false,
  chunks = [],
  limit = 10
}) {
  const normalizedQuery = normalizeQuery(query);
  const queryTokens = tokenize(normalizedQuery);
  const queryVector = hashedVector(queryTokens);
  const allowedStatuses = new Set((statuses?.length ? statuses : DEFAULT_STATUSES).map((status) => String(status).toLowerCase()));
  const requestedLanguage = String(language || 'en').toLowerCase();

  const beforeRanking = chunks
    .filter((chunk) => statusAllowed(chunk.status, allowedStatuses, includeObsolete))
    .map((chunk) => {
      const searchable = [
        chunk.title,
        chunk.heading_path?.join(' '),
        chunk.source_path,
        chunk.text
      ].join(' ');
      const keywordStats = keywordMatchStats(queryTokens, searchable);
      const keyword = keywordStats.score;
      // Hash-bucket vector similarity catches broader token overlap while the
      // keyword gate below keeps weak accidental hash collisions from ranking.
      const vector = cosineSimilarity(queryVector, hashedVector(tokenize(searchable)));
      const score = isMeaningfulCandidate(keywordStats) ? (keyword * 0.65) + (vector * 0.35) : 0;

      return {
        ...publicChunk(chunk),
        keyword_score: round(keyword),
        vector_score: round(vector),
        matched_tokens: keywordStats.matched_tokens,
        base_score: round(score),
        score: round(score)
      };
    })
    .filter((chunk) => chunk.score > 0);

  const afterRanking = beforeRanking
    .map((chunk) => ({
      ...chunk,
      score: round(chunk.base_score + languageBoost(chunk, requestedLanguage) + statusBoost(chunk.status) + translationBoost(chunk))
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((chunk, index) => ({ ...chunk, rank: index + 1 }));

  return {
    query,
    normalized_query: normalizedQuery,
    filters: {
      language: requestedLanguage,
      statuses: [...allowedStatuses],
      includeObsolete
    },
    results: afterRanking,
    debug: {
      raw_query: query,
      normalized_query: normalizedQuery,
      selected_filters: {
        language: requestedLanguage,
        statuses: [...allowedStatuses],
        includeObsolete
      },
      retrieved_before_ranking: beforeRanking,
      retrieved_after_ranking: afterRanking
    }
  };
}

function isMeaningfulCandidate(keywordStats) {
  if (keywordStats.technical_matches > 0) return true;
  return keywordStats.unique_matches >= 2;
}

function statusAllowed(status, allowedStatuses, includeObsolete) {
  const normalized = String(status || 'notreviewed').toLowerCase();
  if (normalized === 'obsolete') return includeObsolete;
  return allowedStatuses.has(normalized);
}

function languageBoost(chunk, requestedLanguage) {
  if (chunk.language === requestedLanguage) return 0.12;
  if (chunk.language === 'en') return 0.06;
  return 0;
}

function statusBoost(status) {
  return {
    published: 0.05,
    review: 0.025,
    draft: 0.01,
    notreviewed: 0,
    obsolete: -0.2
  }[status] ?? 0;
}

function translationBoost(chunk) {
  if (chunk.translation_state === 'current') return 0.02;
  if (chunk.translation_state === 'out_of_date') return -0.02;
  if (chunk.translation_state === 'unlinked') return -0.03;
  return 0;
}

function publicChunk(chunk) {
  return {
    chunk_id: chunk.chunk_id,
    source_path: chunk.source_path,
    section_url: chunk.section_url,
    title: chunk.title,
    heading_path: chunk.heading_path || [],
    language: chunk.language,
    status: chunk.status,
    translation_state: chunk.translation_state,
    text: chunk.text
  };
}

function round(value) {
  return Math.round(value * 10000) / 10000;
}
