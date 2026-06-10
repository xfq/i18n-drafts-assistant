import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { getConfig, parseEnvFileContent } from '../src/config.js';

const touchedKeys = [
  'PORT',
  'SOURCE_MODE',
  'SOURCE_REPO_PATH',
  'SOURCE_REF',
  'ENABLE_DEBUG',
  'MODEL_PROVIDER',
  'MODEL_API_KEY',
  'MODEL_TIMEOUT_MS',
  'TRUSTED_PROXIES'
];

test('getConfig loads values from a .env file', async () => {
  const envFilePath = await writeTempEnv([
    '# local configuration',
    'PORT=4123',
    'SOURCE_MODE=local',
    'SOURCE_REPO_PATH="/tmp/i18n drafts"',
    'export SOURCE_REF=fixture-ref',
    'ENABLE_DEBUG=true',
    'MODEL_PROVIDER=openai-compatible',
    'MODEL_API_KEY=server-side-secret',
    'MODEL_TIMEOUT_MS=12345',
    'TRUSTED_PROXIES=127.0.0.1/32, ::1'
  ].join('\n'));

  await withCleanEnv(async () => {
    const config = getConfig({ envFilePath });

    assert.equal(config.port, 4123);
    assert.equal(config.sourceMode, 'local');
    assert.equal(config.sourceRepoPath, '/tmp/i18n drafts');
    assert.equal(config.sourceRef, 'fixture-ref');
    assert.equal(config.enableDebug, true);
    assert.equal(config.modelProvider, 'openai-compatible');
    assert.equal(config.modelApiKey, 'server-side-secret');
    assert.equal(config.modelTimeoutMs, 12345);
    assert.deepEqual(config.trustedProxies, ['127.0.0.1/32', '::1']);
  });
});

test('process.env overrides .env values and explicit overrides win last', async () => {
  const envFilePath = await writeTempEnv('PORT=4123\nSOURCE_MODE=git\nENABLE_DEBUG=false\n');

  await withCleanEnv(async () => {
    process.env.PORT = '5555';
    process.env.SOURCE_MODE = 'local';
    const config = getConfig({ envFilePath, port: 7777 });

    assert.equal(config.port, 7777);
    assert.equal(config.sourceMode, 'local');
    assert.equal(config.enableDebug, false);
  });
});

test('parseEnvFileContent ignores comments and supports inline comments outside quotes', () => {
  const parsed = parseEnvFileContent([
    'PLAIN=value # comment',
    'QUOTED="value # not comment"',
    "SINGLE='another # value'",
    'EMPTY=',
    'export SPACED = spaced value'
  ].join('\n'));

  assert.deepEqual(parsed, {
    PLAIN: 'value',
    QUOTED: 'value # not comment',
    SINGLE: 'another # value',
    EMPTY: '',
    SPACED: 'spaced value'
  });
});

async function writeTempEnv(content) {
  const directory = await mkdtemp(join(tmpdir(), 'i18n-env-'));
  const envFilePath = join(directory, '.env');
  await writeFile(envFilePath, content, 'utf8');
  return envFilePath;
}

async function withCleanEnv(callback) {
  const previous = Object.fromEntries(touchedKeys.map((key) => [key, process.env[key]]));
  for (const key of touchedKeys) delete process.env[key];

  try {
    await callback();
  } finally {
    for (const key of touchedKeys) {
      if (previous[key] === undefined) delete process.env[key];
      else process.env[key] = previous[key];
    }
  }
}
