export function buildCitations(chunks) {
  return chunks.map((chunk, index) => ({
    chunk_id: chunk.chunk_id,
    label: citationLabel(chunk),
    url: chunk.section_url,
    status: chunk.status,
    translation_state: chunk.translation_state,
    language: chunk.language,
    source_path: chunk.source_path,
    rank: chunk.rank || index + 1
  }));
}

export function citationLabel(chunk) {
  const heading = Array.isArray(chunk.heading_path) && chunk.heading_path.length > 0
    ? `: ${chunk.heading_path.join(' > ')}`
    : '';
  return `${chunk.title}${heading}`;
}

export function validateCitationsForEvidence(response) {
  if ((response.evidence_status === 'supported' || response.evidence_status === 'partially_supported') &&
    (!Array.isArray(response.citations) || response.citations.length === 0)) {
    return {
      ...response,
      answer: 'I could not find enough support for that in the indexed W3C i18n content.',
      citations: [],
      warnings: response.warnings || [],
      evidence_status: 'insufficient_evidence'
    };
  }

  return alignCitationsToAnswer(response);
}

function alignCitationsToAnswer(response) {
  const citations = Array.isArray(response.citations) ? response.citations : [];
  const usedNumbers = citedNumbers(response.answer, citations.length);
  if (usedNumbers.length === 0) return response;

  const remap = new Map(usedNumbers.map((number, index) => [number, index + 1]));

  return {
    ...response,
    answer: remapAnswerCitations(response.answer, remap),
    citations: usedNumbers.map((number) => citations[number - 1])
  };
}

function citedNumbers(answer, citationCount) {
  const seen = new Set();
  const numbers = [];

  for (const match of String(answer || '').matchAll(/\[((?:\d+\s*,\s*)*\d+)\]/g)) {
    for (const value of match[1].split(',')) {
      const number = Number.parseInt(value.trim(), 10);
      if (number < 1 || number > citationCount || seen.has(number)) continue;
      seen.add(number);
      numbers.push(number);
    }
  }

  return numbers;
}

function remapAnswerCitations(answer, remap) {
  return String(answer || '').replace(/\[((?:\d+\s*,\s*)*\d+)\]/g, (match, value) => {
    const seen = new Set();
    const mapped = value
      .split(',')
      .map((item) => remap.get(Number.parseInt(item.trim(), 10)))
      .filter((number) => {
        if (!number || seen.has(number)) return false;
        seen.add(number);
        return true;
      });

    return mapped.length > 0 ? `[${mapped.join(', ')}]` : match;
  });
}
