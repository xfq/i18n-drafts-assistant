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

  return response;
}
