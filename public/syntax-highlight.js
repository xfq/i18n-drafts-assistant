const HTML_LANGUAGES = new Set(['html', 'xml', 'xhtml']);

export function highlightCode(source, language = '') {
  const code = String(source ?? '');
  const normalizedLanguage = String(language).toLowerCase();

  if (HTML_LANGUAGES.has(normalizedLanguage)) return highlightHtml(code);
  if (normalizedLanguage === 'css') return highlightCss(code);
  return escapeHtml(code);
}

function highlightHtml(source) {
  const tagPattern = /<!--[\s\S]*?-->|<!\[CDATA\[[\s\S]*?\]\]>|<!doctype\s+[^>]*>|<\/?[A-Za-z][^>]*>/gi;
  let result = '';
  let cursor = 0;

  for (const match of source.matchAll(tagPattern)) {
    const start = match.index ?? cursor;
    result += escapeHtml(source.slice(cursor, start));
    result += highlightHtmlToken(match[0]);
    cursor = start + match[0].length;
  }

  return result + escapeHtml(source.slice(cursor));
}

function highlightHtmlToken(source) {
  if (source.startsWith('<!--')) return token('comment', source);
  if (source.startsWith('<![CDATA[')) return token('cdata', source);
  if (/^<!doctype\b/i.test(source)) return token('doctype', source);

  const openingMatch = source.match(/^<(\/?)\s*/);
  if (!openingMatch) return escapeHtml(source);

  const opening = openingMatch[0];
  const closingSlash = openingMatch[1] ? '/' : '';
  const tagStart = opening.length;
  const tagNameMatch = source.slice(tagStart).match(/^[A-Za-z][\w:.-]*/);
  if (!tagNameMatch) return escapeHtml(source);

  let result = token('punctuation', `<${closingSlash}`);
  result += token('tag-name', tagNameMatch[0]);
  let cursor = tagStart + tagNameMatch[0].length;

  while (cursor < source.length) {
    const whitespace = source.slice(cursor).match(/^\s+/);
    if (whitespace) {
      result += escapeHtml(whitespace[0]);
      cursor += whitespace[0].length;
      continue;
    }

    const punctuation = source.slice(cursor).match(/^\/?>(?=$|\s*)/);
    if (punctuation) {
      result += token('punctuation', punctuation[0]);
      cursor += punctuation[0].length;
      continue;
    }

    const attribute = source.slice(cursor).match(/^[^\s=/>]+/);
    if (!attribute) {
      result += escapeHtml(source[cursor]);
      cursor += 1;
      continue;
    }

    result += token('attr-name', attribute[0]);
    cursor += attribute[0].length;

    const attributeWhitespace = source.slice(cursor).match(/^\s*/)[0];
    result += escapeHtml(attributeWhitespace);
    cursor += attributeWhitespace.length;

    if (source[cursor] !== '=') continue;
    result += token('punctuation', '=');
    cursor += 1;

    const valueWhitespace = source.slice(cursor).match(/^\s*/)[0];
    result += escapeHtml(valueWhitespace);
    cursor += valueWhitespace.length;

    const quotedValue = source.slice(cursor).match(/^("[^"\n]*"|'[^'\n]*')/);
    if (quotedValue) {
      result += token('attr-value', quotedValue[0]);
      cursor += quotedValue[0].length;
      continue;
    }

    const unquotedValue = source.slice(cursor).match(/^[^\s>]+/);
    if (unquotedValue) {
      result += token('attr-value', unquotedValue[0]);
      cursor += unquotedValue[0].length;
    }
  }

  return result;
}

function highlightCss(source) {
  let result = '';
  let cursor = 0;
  let blockDepth = 0;
  let declarationStart = false;

  while (cursor < source.length) {
    const rest = source.slice(cursor);

    if (rest.startsWith('/*')) {
      const end = source.indexOf('*/', cursor + 2);
      const commentEnd = end === -1 ? source.length : end + 2;
      result += token('comment', source.slice(cursor, commentEnd));
      cursor = commentEnd;
      continue;
    }

    const quotedValue = rest.match(/^("(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*')/s);
    if (quotedValue) {
      result += token('string', quotedValue[0]);
      cursor += quotedValue[0].length;
      continue;
    }

    if (/^\s/.test(rest)) {
      const whitespace = rest.match(/^\s+/)[0];
      result += escapeHtml(whitespace);
      cursor += whitespace.length;
      continue;
    }

    if (rest[0] === '{') {
      result += token('punctuation', '{');
      cursor += 1;
      blockDepth += 1;
      declarationStart = true;
      continue;
    }

    if (rest[0] === '}') {
      result += token('punctuation', '}');
      cursor += 1;
      blockDepth = Math.max(0, blockDepth - 1);
      declarationStart = blockDepth > 0;
      continue;
    }

    if (blockDepth > 0 && rest[0] === ';') {
      result += token('punctuation', ';');
      cursor += 1;
      declarationStart = true;
      continue;
    }

    if (blockDepth === 0) {
      const selector = rest.match(/^[^{}\/"']+(?=\s*\{)/s);
      if (selector) {
        result += highlightSelectorOrAtRule(selector[0]);
        cursor += selector[0].length;
        continue;
      }

      const atRule = rest.match(/^@[A-Za-z_-][\w-]*/);
      if (atRule) {
        result += token('atrule', atRule[0]);
        cursor += atRule[0].length;
        continue;
      }
    }

    if (blockDepth > 0 && declarationStart) {
      const nestedSelector = rest.match(/^[^{}\/"']+(?=\s*\{)/s);
      if (nestedSelector) {
        result += highlightSelectorOrAtRule(nestedSelector[0]);
        cursor += nestedSelector[0].length;
        continue;
      }

      const property = rest.match(/^(?:--)?[A-Za-z_][\w-]*(?=\s*:)/);
      if (property) {
        result += token('property', property[0]);
        cursor += property[0].length;
        declarationStart = false;
        continue;
      }
      declarationStart = false;
    }

    const atRule = rest.match(/^@[A-Za-z_-][\w-]*/);
    if (atRule) {
      result += token('atrule', atRule[0]);
      cursor += atRule[0].length;
      continue;
    }

    const number = rest.match(/^(?:#[0-9A-Fa-f]{3,8}\b|\b\d+(?:\.\d+)?(?:%|[A-Za-z]+)?\b)/);
    if (number) {
      result += token(number[0].startsWith('#') ? 'color' : 'number', number[0]);
      cursor += number[0].length;
      continue;
    }

    if (/^[(),:;[\]]/.test(rest)) {
      result += token('punctuation', rest[0]);
      cursor += 1;
      continue;
    }

    const functionName = rest.match(/^[A-Za-z_-][\w-]*(?=\s*\()/);
    if (functionName) {
      result += token('function', functionName[0]);
      cursor += functionName[0].length;
      continue;
    }

    result += escapeHtml(rest[0]);
    cursor += 1;
  }

  return result;
}

function highlightSelector(source) {
  const match = source.match(/^(\s*)([\s\S]*?)(\s*)$/);
  if (!match || !match[2]) return escapeHtml(source);
  return escapeHtml(match[1]) + token('selector', match[2]) + escapeHtml(match[3]);
}

function highlightSelectorOrAtRule(source) {
  const match = source.match(/^(\s*)(@[A-Za-z_-][\w-]*)([\s\S]*)$/);
  if (!match) return highlightSelector(source);
  return escapeHtml(match[1]) + token('atrule', match[2]) + escapeHtml(match[3]);
}

function token(className, value) {
  return `<span class="token ${className}">${escapeHtml(value)}</span>`;
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
