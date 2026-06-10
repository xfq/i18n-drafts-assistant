import vm from 'node:vm';

const EMPTY_TRANSLATIONS = Object.freeze({
  versions: [],
  out_of_date_translations: [],
  updated_translations: [],
  unlinked_translations: []
});

export function parseTranslationsFile(source = '') {
  const sandbox = { trans: {} };

  try {
    vm.runInNewContext(source, sandbox, {
      timeout: 100,
      displayErrors: false,
      contextName: 'translations-metadata'
    });
  } catch {
    return { ...EMPTY_TRANSLATIONS };
  }

  const trans = sandbox.trans || {};
  return {
    versions: normalizeTranslationList(trans.versions),
    out_of_date_translations: normalizeTranslationList(trans.outofdatetranslations),
    updated_translations: normalizeTranslationList(trans.updatedtranslations),
    unlinked_translations: normalizeTranslationList(trans.unlinkedtranslations)
  };
}

export function translationStateForLanguage(translations = EMPTY_TRANSLATIONS, language = '') {
  const lang = normalizeLanguage(language);
  if (!lang) return 'unknown';

  if (containsLanguage(translations.out_of_date_translations, lang)) return 'out_of_date';
  if (containsLanguage(translations.unlinked_translations, lang)) return 'unlinked';
  if (containsLanguage(translations.updated_translations, lang)) return 'updated';
  if (containsLanguage(translations.versions, lang)) return 'current';
  return 'unknown';
}

export function normalizeTranslationList(value) {
  if (!Array.isArray(value)) return [];

  return value
    .map((entry) => {
      if (typeof entry === 'string') return { lang: normalizeLanguage(entry) };
      if (!entry || typeof entry !== 'object') return null;

      const lang = normalizeLanguage(
        entry.lang || entry.language || entry.langcode || entry.code || entry.locale || entry[0]
      );
      return lang ? { ...entry, lang } : null;
    })
    .filter(Boolean);
}

function containsLanguage(entries = [], language) {
  return entries.some((entry) => normalizeLanguage(entry.lang) === language);
}

export function normalizeLanguage(language = '') {
  return String(language).trim().toLowerCase().replace(/_/g, '-');
}

export { EMPTY_TRANSLATIONS };
