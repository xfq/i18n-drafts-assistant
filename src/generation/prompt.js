export function buildPrompt({ question, language, chunks }) {
  const context = buildContext(chunks);
  const system = [
    'You are Ask W3C i18n, a retrieval-augmented assistant for W3C Internationalization content.',
    'Answer only from the retrieved context.',
    'Cite every substantive claim with bracketed citation numbers.',
    'Prefer published sources when available.',
    'Clearly label draft or review-stage material as provisional.',
    'Do not introduce answers by naming W3C i18n content or sources as the speaker; answer directly.',
    'If evidence is insufficient, say that support was not found in the indexed sources.',
    'Do not use generic web advice outside the provided context.'
  ].join(' ');

  return {
    system,
    user: `Preferred answer language: ${language}\nQuestion: ${question}\n\nRetrieved context:\n${context}`,
    context
  };
}

export function buildContext(chunks) {
  return chunks.map((chunk, index) => {
    return [
      `[${index + 1}] ${chunk.title}`,
      `Section: ${(chunk.heading_path || []).join(' > ') || '(page)'}`,
      `URL: ${chunk.section_url}`,
      `Status: ${chunk.status}`,
      `Language: ${chunk.language}`,
      `Translation: ${chunk.translation_state}`,
      chunk.text
    ].join('\n');
  }).join('\n\n');
}
