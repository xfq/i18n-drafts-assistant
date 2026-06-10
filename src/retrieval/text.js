export function normalizeQuery(query = '') {
  return String(query).normalize('NFKC').trim().toLowerCase().replace(/\s+/g, ' ');
}

export function tokenize(value = '') {
  const normalized = normalizeQuery(value);
  const tokens = [];
  const pattern = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]|[\p{L}\p{N}][\p{L}\p{N}-]*/gu;
  let match;

  while ((match = pattern.exec(normalized))) {
    const token = match[0];
    if ((token.length > 1 || /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/u.test(token)) && !STOPWORDS.has(token)) {
      tokens.push(token);
    }
  }

  return tokens;
}

const STOPWORDS = new Set([
  'a',
  'an',
  'and',
  'are',
  'as',
  'at',
  'be',
  'between',
  'by',
  'can',
  'could',
  'do',
  'does',
  'for',
  'from',
  'how',
  'i',
  'in',
  'into',
  'is',
  'it',
  'me',
  'of',
  'on',
  'or',
  'should',
  'that',
  'the',
  'this',
  'to',
  'use',
  'what',
  'when',
  'where',
  'which',
  'with',
  'about',
  'content',
  'draft',
  'final',
  'guidance',
  'html',
  'index',
  'page',
  'pages',
  'published',
  'review',
  'say',
  'tell',
  'show'
]);

export function keywordScore(queryTokens, text) {
  return keywordMatchStats(queryTokens, text).score;
}

export function keywordMatchStats(queryTokens, text) {
  const textTokens = tokenize(text);
  if (queryTokens.length === 0 || textTokens.length === 0) {
    return { score: 0, unique_matches: 0, technical_matches: 0, matched_tokens: [] };
  }

  const textCounts = new Map();
  for (const token of textTokens) textCounts.set(token, (textCounts.get(token) || 0) + 1);

  let matches = 0;
  const matchedTokens = new Set();
  let technicalMatches = 0;

  for (const token of new Set(queryTokens)) {
    if (textCounts.has(token)) {
      matchedTokens.add(token);
      if (isTechnicalToken(token)) technicalMatches += 1;
      matches += 1 + Math.log1p(textCounts.get(token));
    }
  }

  return {
    score: matches / queryTokens.length,
    unique_matches: matchedTokens.size,
    technical_matches: technicalMatches,
    matched_tokens: [...matchedTokens]
  };
}

export function hashedVector(tokens, dimensions = 128) {
  const vector = new Array(dimensions).fill(0);
  for (const token of tokens) {
    const hash = fnv1a(token);
    const index = hash % dimensions;
    vector[index] += 1;
  }
  return normalizeVector(vector);
}

export function cosineSimilarity(a, b) {
  const length = Math.min(a.length, b.length);
  let dot = 0;
  for (let index = 0; index < length; index += 1) dot += a[index] * b[index];
  return dot;
}

const TECHNICAL_TERMS = new Set([
  'bidi',
  'charset',
  'dir',
  'encoding',
  'hreflang',
  'lang',
  'ltr',
  'rtl',
  'utf-8'
]);

function isTechnicalToken(token) {
  return TECHNICAL_TERMS.has(token) ||
    /[\d-]/.test(token) ||
    /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/u.test(token);
}

function normalizeVector(vector) {
  const magnitude = Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0));
  if (magnitude === 0) return vector;
  return vector.map((value) => value / magnitude);
}

function fnv1a(value) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}
