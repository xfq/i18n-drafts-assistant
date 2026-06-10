import { canonicalUrlForSourcePath } from './canonical-url.js';
import { cleanText, firstMatch, htmlToCleanText, sha256 } from './parse-html.js';

export function chunkHtmlPage(page, options = {}) {
  const publicBaseUrl = options.publicBaseUrl || page.public_base_url || 'https://www.w3.org/International';
  const html = removeNonContent(page.html || '');
  const sections = extractSectionChunks(html);
  const indexedAt = new Date().toISOString();
  const rawChunks = sections.length > 0 ? sections : fallbackChunks(html);

  return rawChunks
    .map((raw, index) => {
      const sectionId = raw.section_id || `chunk-${index + 1}`;
      const text = raw.text;
      if (!text) return null;

      return {
        id: `${page.source_path}#${sectionId}`,
        document_id: page.id || page.source_path,
        chunk_id: `${page.source_path}#${sectionId}`,
        source_path: page.source_path,
        canonical_url: page.canonical_url,
        section_id: sectionId,
        section_url: canonicalUrlForSourcePath(page.source_path, publicBaseUrl, sectionId),
        language: page.language,
        status: page.status,
        translation_state: page.translation_state,
        title: page.title || page.h1 || page.source_path,
        heading_path: raw.heading_path.length > 0 ? raw.heading_path : [page.h1 || page.title].filter(Boolean),
        text,
        text_hash: sha256(text),
        token_estimate: estimateTokens(text),
        indexed_at: indexedAt
      };
    })
    .filter(Boolean);
}

function extractSectionChunks(html) {
  const chunks = [];
  const sectionPattern = /<section\b([^>]*)>([\s\S]*?)<\/section>/gi;
  let match;

  while ((match = sectionPattern.exec(html))) {
    const attrs = match[1] || '';
    const sectionHtml = match[2] || '';
    const sectionId = firstMatch(attrs, /\bid=["']?([^"'\s>]+)/i);
    const heading = cleanText(firstMatch(sectionHtml, /<h[2-4]\b[^>]*>([\s\S]*?)<\/h[2-4]>/i));
    const text = htmlToCleanText(sectionHtml);

    if (text) {
      chunks.push({
        section_id: sectionId || '',
        heading_path: heading ? [heading] : [],
        text
      });
    }
  }

  return chunks;
}

function fallbackChunks(html) {
  const text = htmlToCleanText(html);
  return text ? [{ section_id: 'chunk-1', heading_path: [], text }] : [];
}

function removeNonContent(html) {
  return String(html)
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<script\b[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[\s\S]*?<\/style>/gi, ' ')
    .replace(/<(nav|footer|header|aside)\b[\s\S]*?<\/\1>/gi, ' ');
}

function estimateTokens(text) {
  return Math.max(1, Math.ceil(String(text).length / 4));
}
