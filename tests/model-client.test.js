import test from 'node:test';
import assert from 'node:assert/strict';
import { generateWithModel } from '../src/generation/model-client.js';

test('openai-compatible errors include provider response body', async () => {
  const previousFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify({
    error: {
      code: 'model_not_found',
      message: 'The model gpt-5.5 does not exist.'
    }
  }), { status: 400, headers: { 'content-type': 'application/json' } });

  try {
    await assert.rejects(
      generateWithModel({
        provider: 'openai-compatible',
        apiKey: 'test-key',
        model: 'gpt-5.5',
        prompt: {
          system: 'system',
          user: 'user'
        }
      }),
      /Model provider returned HTTP 400: .*model_not_found.*gpt-5\.5/
    );
  } finally {
    globalThis.fetch = previousFetch;
  }
});

test('openai-compatible requests omit temperature by default', async () => {
  const previousFetch = globalThis.fetch;
  let requestBody = null;
  globalThis.fetch = async (url, options) => {
    requestBody = JSON.parse(options.body);
    return new Response(JSON.stringify({
      choices: [{ message: { content: 'ok' } }]
    }), { status: 200, headers: { 'content-type': 'application/json' } });
  };

  try {
    const result = await generateWithModel({
      provider: 'openai-compatible',
      apiKey: 'test-key',
      model: 'gpt-5.5',
      prompt: {
        system: 'system',
        user: 'user'
      }
    });

    assert.equal(result.text, 'ok');
    assert.equal(Object.hasOwn(requestBody, 'temperature'), false);
  } finally {
    globalThis.fetch = previousFetch;
  }
});
