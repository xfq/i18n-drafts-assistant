import test from 'node:test';
import assert from 'node:assert/strict';
import {
  MESSAGES,
  UI_LANGUAGE_OPTIONS,
  applyUILanguage,
  detectUILanguage,
  getUILanguage,
  isSupportedUILanguage,
  onUILanguageChange,
  t,
  uiTextDirection
} from '../public/i18n.js';

test('UI language options cover the same language set as answers', () => {
  assert.deepEqual(UI_LANGUAGE_OPTIONS.map(({ code }) => code), [
    'en',
    'zh-hans'
  ]);
});

test('every UI language defines the same message keys as English', () => {
  const englishKeys = Object.keys(MESSAGES.en).sort();
  for (const { code } of UI_LANGUAGE_OPTIONS) {
    assert.deepEqual(Object.keys(MESSAGES[code]).sort(), englishKeys, `${code} message keys`);
  }
});

test('t() defaults to English and falls back to the key when missing', () => {
  applyUILanguage('en');
  assert.equal(t('submitButton'), 'Ask from sources');
  applyUILanguage('zh-hans');
  assert.equal(t('submitButton'), '提问');
  assert.equal(t('missing-key'), 'missing-key');
  applyUILanguage('en');
});

test('t() interpolates named parameters', () => {
  applyUILanguage('zh-hans');
  assert.equal(t('requestFailed', { status: 429 }), '请求失败，HTTP状态码429');
  assert.equal(t('healthIndexed', { documents: 3, chunks: 12 }), '已索引3个文档和12个片段');
  applyUILanguage('en');
});

test('RTL languages map to rtl direction', () => {
  assert.equal(uiTextDirection('ar'), 'rtl');
  assert.equal(uiTextDirection('he'), 'rtl');
  assert.equal(uiTextDirection('en'), 'ltr');
  assert.equal(uiTextDirection('zh-hans'), 'ltr');
});

test('unsupported language codes fall back to English', () => {
  assert.equal(applyUILanguage('xx'), 'en');
  assert.equal(getUILanguage(), 'en');
  assert.equal(t('submitButton'), 'Ask from sources');
});

test('language codes are normalized to lowercase', () => {
  assert.equal(isSupportedUILanguage('ZH-HANS'), true);
  assert.equal(applyUILanguage('ZH-HANS'), 'zh-hans');
  assert.equal(t('submitButton'), '提问');
  applyUILanguage('en');
});

test('detectUILanguage falls back to English outside a browser', () => {
  assert.equal(detectUILanguage(), 'en');
});

test('onUILanguageChange notifies listeners until unsubscribed', () => {
  const seen = [];
  const unsubscribe = onUILanguageChange((language) => seen.push(language));
  applyUILanguage('zh-hans');
  unsubscribe();
  applyUILanguage('en');
  assert.deepEqual(seen, ['zh-hans']);
  applyUILanguage('en');
});
