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

test('openai-compatible requests disable storage and omit temperature by default', async () => {
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
    assert.equal(requestBody.store, false);
    assert.equal(Object.hasOwn(requestBody, 'temperature'), false);
  } finally {
    globalThis.fetch = previousFetch;
  }
});

test('openai-compatible requests time out slow provider responses', async () => {
  const previousFetch = globalThis.fetch;
  let sawSignal = false;
  globalThis.fetch = async (url, options = {}) => {
    const signal = options.signal;
    assert(signal, 'Expected fetch to receive an AbortSignal');
    sawSignal = true;
    return new Promise((_resolve, reject) => {
      signal.addEventListener('abort', () => {
        reject(signal.reason || new DOMException('The operation was aborted.', 'AbortError'));
      }, { once: true });
    });
  };

  try {
    await assert.rejects(
      generateWithModel({
        provider: 'openai-compatible',
        apiKey: 'test-key',
        model: 'gpt-5.5',
        timeoutMs: 5,
        prompt: {
          system: 'system',
          user: 'user'
        }
      }),
      /Model provider request timed out after 5ms/
    );
    assert.equal(sawSignal, true);
  } finally {
    globalThis.fetch = previousFetch;
  }
});

test('openai-compatible timeout covers slow response body reads', async () => {
  const previousFetch = globalThis.fetch;
  globalThis.fetch = async (url, options = {}) => {
    return {
      ok: true,
      async json() {
        const signal = options.signal;
        assert(signal, 'Expected fetch to receive an AbortSignal');
        return new Promise((_resolve, reject) => {
          signal.addEventListener('abort', () => {
            reject(signal.reason || new DOMException('The operation was aborted.', 'AbortError'));
          }, { once: true });
          setTimeout(() => reject(new Error('Response body was not aborted before the test guard')), 25).unref?.();
        });
      }
    };
  };

  try {
    await assert.rejects(
      generateWithModel({
        provider: 'openai-compatible',
        apiKey: 'test-key',
        model: 'gpt-5.5',
        timeoutMs: 5,
        prompt: {
          system: 'system',
          user: 'user'
        }
      }),
      /Model provider request timed out after 5ms/
    );
  } finally {
    globalThis.fetch = previousFetch;
  }
});
