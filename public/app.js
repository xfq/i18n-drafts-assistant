const form = typeof document === 'undefined' ? null : document.querySelector('#ask-form');
const submitButton = typeof document === 'undefined' ? null : document.querySelector('#submit-button');
const retrieveButton = typeof document === 'undefined' ? null : document.querySelector('#retrieve-button');
const messageArea = typeof document === 'undefined' ? null : document.querySelector('#message-area');
const warningsEl = typeof document === 'undefined' ? null : document.querySelector('#warnings');
const answerEl = typeof document === 'undefined' ? null : document.querySelector('#answer');
const citationsEl = typeof document === 'undefined' ? null : document.querySelector('#citations');
const sourcesEl = typeof document === 'undefined' ? null : document.querySelector('#sources');
const sourceCountEl = typeof document === 'undefined' ? null : document.querySelector('#source-count');
const debugDetails = typeof document === 'undefined' ? null : document.querySelector('#debug-details');
const debugOutput = typeof document === 'undefined' ? null : document.querySelector('#debug-output');
const healthStatus = typeof document === 'undefined' ? null : document.querySelector('#health-status');

if (form && retrieveButton) {
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (!form.reportValidity()) return;
    await ask();
  });

  retrieveButton.addEventListener('click', async () => {
    if (!form.reportValidity()) return;
    await inspectRetrieval();
  });

  loadHealth();
}

async function loadHealth() {
  try {
    const health = await fetchJson('/api/health');
    healthStatus.textContent = health.ok
      ? `Indexed ${health.indexed_documents} documents and ${health.indexed_chunks} chunks from ${health.source_ref}${health.source_commit ? ` (${health.source_commit.slice(0, 8)})` : ''}.`
      : 'No index is loaded. Run npm run index before asking questions.';
  } catch (error) {
    healthStatus.textContent = `Health check failed: ${error.message}`;
  }
}

async function ask() {
  setLoading('Retrieving W3C i18n sources and composing a cited answer...');
  submitButton.disabled = true;

  try {
    const payload = formPayload();
    const response = await fetchJson('/api/ask', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload)
    });

    renderAnswer(response);
    renderSources(response.debug?.retrieved_after_ranking || []);
    renderDebug(response.debug);
    setMessage(response.evidence_status === 'insufficient_evidence' ? 'No supported answer was found.' : '', '');
  } catch (error) {
    setMessage(error.message, 'error');
  } finally {
    submitButton.disabled = false;
  }
}

async function inspectRetrieval() {
  setLoading('Retrieving matching source chunks...');
  retrieveButton.disabled = true;

  try {
    const payload = formPayload();
    const response = await fetchJson('/api/retrieve', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        query: payload.question,
        language: payload.language,
        statuses: payload.statuses,
        includeObsolete: payload.includeObsolete,
        limit: 10
      })
    });

    renderSources(response.results || response.debug?.retrieved_after_ranking || []);
    renderDebug(response.debug || response);
    setMessage('Retrieved source chunks are shown in the source panel.', '');
  } catch (error) {
    setMessage(error.message, 'error');
  } finally {
    retrieveButton.disabled = false;
  }
}

function formPayload() {
  const data = new FormData(form);
  return {
    question: String(data.get('question') || '').trim(),
    language: String(data.get('language') || 'en'),
    statuses: data.getAll('statuses'),
    includeObsolete: Boolean(data.get('includeObsolete'))
  };
}

function renderAnswer(response) {
  warningsEl.replaceChildren(...(response.warnings || []).map(renderWarning));
  renderMarkdownInto(answerEl, response.answer || '');
  citationsEl.replaceChildren(...(response.citations || []).map(renderCitation));
}

function renderWarning(warning) {
  const element = document.createElement('div');
  element.className = 'warning';
  element.textContent = warning.message;
  return element;
}

function renderCitation(citation, index) {
  const card = document.createElement('article');
  card.className = 'citation';
  card.id = `citation-${index + 1}`;

  const heading = document.createElement('h3');
  heading.textContent = `[${index + 1}] ${citation.label}`;

  const meta = document.createElement('div');
  meta.className = 'meta-row';
  meta.append(
    badge(statusLabel(citation.status), citation.status),
    badge(translationLabel(citation.translation_state), citation.translation_state),
    textNode(citation.language)
  );

  const link = document.createElement('a');
  link.href = citation.url;
  link.rel = 'noreferrer';
  link.textContent = citation.url;

  card.append(heading, meta, link);
  return card;
}

function renderSources(results) {
  sourceCountEl.textContent = String(results.length);
  if (!results.length) {
    const empty = document.createElement('p');
    empty.className = 'panel-empty';
    empty.textContent = 'No retrieved sources.';
    sourcesEl.replaceChildren(empty);
    return;
  }

  sourcesEl.replaceChildren(...results.map((result) => {
    const card = document.createElement('article');
    card.className = 'source-card';

    const heading = document.createElement('h3');
    heading.textContent = result.title;

    const section = document.createElement('p');
    section.className = 'meta-row';
    section.textContent = (result.heading_path || []).join(' > ') || result.source_path;

    const meta = document.createElement('div');
    meta.className = 'meta-row';
    meta.append(
      badge(statusLabel(result.status), result.status),
      badge(translationLabel(result.translation_state), result.translation_state),
      textNode(result.language),
      textNode(result.rank ? `Rank ${result.rank}` : ''),
      textNode(Number.isFinite(result.score) ? `Score ${result.score}` : '')
    );

    const preview = document.createElement('p');
    preview.className = 'preview';
    preview.textContent = truncate(result.text, 260);

    const link = document.createElement('a');
    link.href = result.section_url;
    link.rel = 'noreferrer';
    link.textContent = result.section_url;

    card.append(heading, section, meta, preview, link);
    return card;
  }));
}

function renderDebug(debug) {
  if (!debug) {
    debugDetails.hidden = true;
    debugOutput.textContent = '';
    return;
  }

  debugDetails.hidden = false;
  debugOutput.textContent = JSON.stringify(debug, null, 2);
}

function badge(label, className = '') {
  const element = document.createElement('span');
  element.className = `badge ${className || ''}`.trim();
  element.textContent = label;
  return element;
}

function textNode(value) {
  return document.createTextNode(value ? `${value} ` : '');
}

function statusLabel(status) {
  return {
    published: 'Published',
    review: 'Review',
    draft: 'Draft',
    notreviewed: 'Not reviewed',
    obsolete: 'Obsolete'
  }[status] || status || 'Unknown';
}

function translationLabel(state) {
  return {
    current: 'Current translation',
    out_of_date: 'Out-of-date translation',
    updated: 'Updated translation',
    unlinked: 'Unlinked translation',
    unknown: 'Translation state unknown'
  }[state] || state || 'Translation state unknown';
}

function truncate(value, maxLength) {
  const text = String(value || '').replace(/\s+/g, ' ').trim();
  return text.length > maxLength ? `${text.slice(0, maxLength - 1)}...` : text;
}

function setLoading(message) {
  setMessage(message, 'loading');
}

function setMessage(message, className) {
  messageArea.className = `message-area ${className || ''}`.trim();
  messageArea.textContent = message;
}

async function fetchJson(url, options) {
  const response = await fetch(url, options);
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.error || `Request failed with HTTP ${response.status}`);
  }
  return data;
}

export function renderMarkdownInto(element, markdown) {
  const template = document.createElement('template');
  template.innerHTML = markdownToHtml(markdown);
  element.replaceChildren(template.content.cloneNode(true));
}

export function markdownToHtml(markdown) {
  const lines = String(markdown || '').replace(/\r\n?/g, '\n').split('\n');
  const blocks = [];
  let index = 0;

  while (index < lines.length) {
    if (!lines[index].trim()) {
      index += 1;
      continue;
    }

    const fence = lines[index].match(/^```([A-Za-z0-9_-]+)?\s*$/);
    if (fence) {
      const language = fence[1] ? ` class="language-${escapeAttribute(fence[1])}"` : '';
      const codeLines = [];
      index += 1;
      while (index < lines.length && !/^```\s*$/.test(lines[index])) {
        codeLines.push(lines[index]);
        index += 1;
      }
      if (index < lines.length) index += 1;
      blocks.push(`<pre><code${language}>${escapeHtml(codeLines.join('\n'))}</code></pre>`);
      continue;
    }

    const heading = lines[index].match(/^(#{1,6})\s+(.+)$/);
    if (heading) {
      const level = heading[1].length;
      blocks.push(`<h${level}>${renderInline(heading[2].trim())}</h${level}>`);
      index += 1;
      continue;
    }

    if (/^\s*[-*+]\s+/.test(lines[index])) {
      const items = [];
      while (index < lines.length && /^\s*[-*+]\s+/.test(lines[index])) {
        items.push(`<li>${renderInline(lines[index].replace(/^\s*[-*+]\s+/, '').trim())}</li>`);
        index += 1;
      }
      blocks.push(`<ul>${items.join('')}</ul>`);
      continue;
    }

    if (/^\s*\d+[.)]\s+/.test(lines[index])) {
      const items = [];
      while (index < lines.length && /^\s*\d+[.)]\s+/.test(lines[index])) {
        items.push(`<li>${renderInline(lines[index].replace(/^\s*\d+[.)]\s+/, '').trim())}</li>`);
        index += 1;
      }
      blocks.push(`<ol>${items.join('')}</ol>`);
      continue;
    }

    if (/^\s*>\s?/.test(lines[index])) {
      const quoteLines = [];
      while (index < lines.length && /^\s*>\s?/.test(lines[index])) {
        quoteLines.push(lines[index].replace(/^\s*>\s?/, '').trim());
        index += 1;
      }
      blocks.push(`<blockquote>${renderParagraphs(quoteLines)}</blockquote>`);
      continue;
    }

    const paragraphLines = [];
    while (index < lines.length && lines[index].trim() && !isBlockStart(lines[index])) {
      paragraphLines.push(lines[index].trim());
      index += 1;
    }
    blocks.push(`<p>${renderInline(paragraphLines.join(' '))}</p>`);
  }

  return blocks.join('');
}

function renderParagraphs(lines) {
  return lines
    .join('\n')
    .split(/\n{2,}/)
    .map((paragraph) => `<p>${renderInline(paragraph.replace(/\n/g, ' ').trim())}</p>`)
    .join('');
}

function isBlockStart(line) {
  return /^```/.test(line) ||
    /^(#{1,6})\s+/.test(line) ||
    /^\s*[-*+]\s+/.test(line) ||
    /^\s*\d+[.)]\s+/.test(line) ||
    /^\s*>\s?/.test(line);
}

function renderInline(text) {
  const codeTokens = [];
  const textWithTokens = String(text).replace(/`([^`]*)`/g, (_, code) => {
    const token = `\u0000CODE${codeTokens.length}\u0000`;
    codeTokens.push(`<code>${escapeHtml(code)}</code>`);
    return token;
  });

  return renderInlineText(textWithTokens).replace(/\u0000CODE(\d+)\u0000/g, (_, tokenIndex) => {
    return codeTokens[Number(tokenIndex)] || '';
  });
}

function renderInlineText(text) {
  return escapeHtml(text)
    .replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+|mailto:[^)\s]+)\)/g, (_, label, href) => {
      return `<a href="${escapeAttribute(href)}" rel="noreferrer">${label}</a>`;
    })
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/__([^_]+)__/g, '<strong>$1</strong>')
    .replace(/\*([^*]+)\*/g, '<em>$1</em>')
    .replace(/_([^_]+)_/g, '<em>$1</em>')
    .replace(/\[([1-9]\d*)\]/g, (_, number) => {
      return `<a href="#citation-${number}" class="citation-ref" aria-label="Citation ${number}">[${number}]</a>`;
    });
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function escapeAttribute(value) {
  return escapeHtml(value).replace(/'/g, '&#39;');
}
