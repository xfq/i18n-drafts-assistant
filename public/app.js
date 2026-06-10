const form = document.querySelector('#ask-form');
const submitButton = document.querySelector('#submit-button');
const retrieveButton = document.querySelector('#retrieve-button');
const messageArea = document.querySelector('#message-area');
const warningsEl = document.querySelector('#warnings');
const answerEl = document.querySelector('#answer');
const citationsEl = document.querySelector('#citations');
const sourcesEl = document.querySelector('#sources');
const sourceCountEl = document.querySelector('#source-count');
const debugDetails = document.querySelector('#debug-details');
const debugOutput = document.querySelector('#debug-output');
const healthStatus = document.querySelector('#health-status');

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
  answerEl.textContent = response.answer || '';
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
