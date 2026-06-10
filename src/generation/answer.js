import { buildCitations, validateCitationsForEvidence } from './citations.js';
import { buildPrompt } from './prompt.js';
import { generateWithModel } from './model-client.js';

const INSUFFICIENT = 'I could not find enough support for that in the indexed W3C i18n content.';

export async function answerFromRetrieval({
  question,
  language = 'en',
  retrieval,
  enableDebug = false,
  modelProvider = 'local',
  modelApiKey = '',
  modelBaseUrl = '',
  generationModel = ''
}) {
  const results = retrieval?.results || [];
  const selectedChunks = results.slice(0, 4);
  const topScore = selectedChunks[0]?.score ?? 0;

  if (selectedChunks.length === 0 || topScore < 0.03) {
    return {
      answer: INSUFFICIENT,
      citations: [],
      warnings: [],
      evidence_status: 'insufficient_evidence',
      debug: enableDebug ? debugPayload({ question, retrieval, selectedChunks, answer: INSUFFICIENT, warnings: [] }) : null
    };
  }

  const citations = buildCitations(selectedChunks);
  const warnings = buildWarnings(citations, language);
  const prompt = buildPrompt({ question, language, chunks: selectedChunks });
  const conflictQuestion = asksAboutConflict(question) && hasMixedPublishedAndProvisional(citations);
  let answer;

  try {
    if (conflictQuestion) {
      answer = localConflictAnswer(selectedChunks, citations);
    } else if (modelProvider === 'local' || modelProvider === 'none') {
      answer = localExtractiveAnswer(selectedChunks, citations);
    } else {
      const generated = await generateWithModel({
        provider: modelProvider,
        prompt,
        apiKey: modelApiKey,
        baseUrl: modelBaseUrl,
        model: generationModel
      });
      answer = generated.text || localExtractiveAnswer(selectedChunks, citations);
    }
  } catch (error) {
    return {
      answer: '',
      citations: [],
      warnings: [],
      evidence_status: 'error',
      error: `Model provider error: ${error.message}`,
      debug: enableDebug ? debugPayload({ question, retrieval, selectedChunks, answer: '', warnings, prompt }) : null
    };
  }

  const response = validateCitationsForEvidence({
    answer,
    citations,
    warnings,
    evidence_status: conflictQuestion ? 'partially_supported' : (topScore >= 0.18 ? 'supported' : 'partially_supported'),
    debug: enableDebug ? debugPayload({ question, retrieval, selectedChunks, answer, warnings, prompt, citations }) : null
  });

  return response;
}

export function buildWarnings(citations, selectedLanguage) {
  const warnings = [];
  const provisional = citations.filter((citation) => ['review', 'draft'].includes(citation.status));

  if (provisional.length > 0) {
    warnings.push({
      type: 'uses_draft_or_review',
      message: 'This answer includes material from draft or review-stage W3C i18n content. Draft/review material may change before publication.'
    });
  }

  if (provisional.length > citations.length / 2) {
    warnings.push({
      type: 'primarily_draft_or_review',
      message: 'This answer relies primarily on draft or review-stage W3C i18n content. Treat it as provisional guidance.'
    });
  }

  const language = String(selectedLanguage || 'en').toLowerCase();
  if (language !== 'en' && citations.length > 0 && !citations.some((citation) => citation.language === language) && citations.some((citation) => citation.language === 'en')) {
    warnings.push({
      type: 'english_fallback',
      message: `No sufficiently relevant ${language} source was found, so this answer uses English W3C i18n sources.`
    });
  }

  return warnings;
}

function localExtractiveAnswer(chunks, citations) {
  const sentences = chunks.slice(0, citations.length).map((chunk, index) => {
    const sentence = firstUsefulSentence(chunk.text);
    const prefix = ['review', 'draft'].includes(chunk.status) ? `${statusLabel(chunk.status)} material says ` : '';
    return `${prefix}${sentence} [${index + 1}]`;
  });

  return `From the indexed W3C i18n content: ${sentences.join(' ')}`;
}

function localConflictAnswer(chunks, citations) {
  const publishedIndex = citations.findIndex((citation) => citation.status === 'published');
  const provisionalIndex = citations.findIndex((citation) => ['review', 'draft'].includes(citation.status));
  const parts = ['The retrieved W3C i18n sources could not confirm a direct conflict from the indexed content.'];

  if (publishedIndex >= 0) {
    parts.push(`Published material says ${firstUsefulSentence(chunks[publishedIndex].text)} [${publishedIndex + 1}]`);
  }
  if (provisionalIndex >= 0) {
    parts.push(`${statusLabel(citations[provisionalIndex].status)} material says ${firstUsefulSentence(chunks[provisionalIndex].text)} [${provisionalIndex + 1}] Treat draft/review material as provisional until it is published.`);
  }

  return parts.join(' ');
}

function asksAboutConflict(question) {
  return /\b(conflict|contradict|contradiction|contradicts|disagree|differs?)\b/i.test(question);
}

function hasMixedPublishedAndProvisional(citations) {
  return citations.some((citation) => citation.status === 'published') &&
    citations.some((citation) => ['review', 'draft'].includes(citation.status));
}

function firstUsefulSentence(text) {
  const clean = String(text || '').replace(/\s+/g, ' ').trim();
  const sentence = clean.match(/[^.!?。！？]+[.!?。！？]/u)?.[0] || clean;
  return sentence.trim();
}

function statusLabel(status) {
  return status === 'draft' ? 'Draft' : 'Review-stage';
}

function debugPayload({ question, retrieval, selectedChunks, answer, warnings, prompt, citations = [] }) {
  return {
    raw_query: question,
    normalized_query: retrieval?.normalized_query || '',
    selected_filters: retrieval?.filters || {},
    retrieved_before_ranking: retrieval?.debug?.retrieved_before_ranking || [],
    retrieved_after_ranking: retrieval?.debug?.retrieved_after_ranking || retrieval?.results || [],
    final_context: prompt?.context || selectedChunks.map((chunk) => chunk.text).join('\n\n'),
    model_answer: answer,
    citation_mapping: citations,
    warnings_triggered: warnings
  };
}
