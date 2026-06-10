import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { canonicalUrlForSourcePath } from '../src/indexing/canonical-url.js';
import { parseTranslationsFile, translationStateForLanguage } from '../src/indexing/parse-translations.js';
import { parseHtmlPage } from '../src/indexing/parse-html.js';

const fixtureRoot = new URL('./fixtures/i18n-mini/', import.meta.url);

test('canonical URLs remove language suffixes and preserve index directories', () => {
  assert.equal(
    canonicalUrlForSourcePath('articles/http-charset/index.en.html', 'https://www.w3.org/International'),
    'https://www.w3.org/International/articles/http-charset/'
  );
  assert.equal(
    canonicalUrlForSourcePath('questions/qa-link-lang.en.html', 'https://www.w3.org/International/'),
    'https://www.w3.org/International/questions/qa-link-lang'
  );
  assert.equal(
    canonicalUrlForSourcePath('articles/http-charset/index.en.html', 'https://www.w3.org/International', 'charset'),
    'https://www.w3.org/International/articles/http-charset/#charset'
  );
});

test('translation metadata maps language states from companion translations.js', async () => {
  const file = await readFile(join(fixtureRoot.pathname, 'articles/http-charset/index-data/translations.js'), 'utf8');
  const translations = parseTranslationsFile(file);

  assert.equal(translationStateForLanguage(translations, 'en'), 'current');
  assert.equal(translationStateForLanguage(translations, 'zh-hans'), 'out_of_date');
  assert.equal(translationStateForLanguage(translations, 'ja'), 'updated');
  assert.equal(translationStateForLanguage(translations, 'ar'), 'unlinked');
  assert.equal(translationStateForLanguage(translations, 'ko'), 'unknown');
});

test('HTML parser extracts W3C i18n metadata and cleaned main text', async () => {
  const file = await readFile(join(fixtureRoot.pathname, 'articles/http-charset/index.en.html'), 'utf8');
  const parsed = parseHtmlPage({
    html: file,
    sourcePath: 'articles/http-charset/index.en.html',
    publicBaseUrl: 'https://www.w3.org/International',
    translations: { versions: [{ lang: 'en' }], out_of_date_translations: [], updated_translations: [], unlinked_translations: [] }
  });

  assert.equal(parsed.language, 'en');
  assert.equal(parsed.title, 'Declaring character encoding in HTML');
  assert.equal(parsed.h1, 'Declaring character encoding in HTML');
  assert.equal(parsed.status, 'published');
  assert.equal(parsed.translation_state, 'current');
  assert.equal(parsed.canonical_url, 'https://www.w3.org/International/articles/http-charset/');
  assert.equal(parsed.metadata.f.status, 'published');
  assert.match(parsed.text, /use UTF-8/i);
  assert.doesNotMatch(parsed.text, /Boilerplate footer/);
});
