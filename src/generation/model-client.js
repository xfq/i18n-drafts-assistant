export async function generateWithModel({ provider = 'local', prompt, apiKey, baseUrl, model, timeoutMs = 30_000 }) {
  if (provider === 'local' || provider === 'none') {
    return { provider: 'local', text: '' };
  }

  if (provider === 'openai-compatible') {
    if (!apiKey) throw new Error('MODEL_API_KEY is required for openai-compatible provider');
    const timeout = Number(timeoutMs);
    const timeoutEnabled = Number.isFinite(timeout) && timeout > 0;
    const abortController = timeoutEnabled ? new AbortController() : null;
    const timeoutError = timeoutEnabled ? new Error(`Model provider request timed out after ${timeout}ms`) : null;
    let timeoutId = null;

    try {
      if (abortController) {
        timeoutId = setTimeout(() => abortController.abort(timeoutError), timeout);
        timeoutId.unref?.();
      }

      const response = await fetch(`${(baseUrl || 'https://api.openai.com/v1').replace(/\/+$/, '')}/chat/completions`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${apiKey}`
        },
        signal: abortController?.signal,
        body: JSON.stringify({
          model: model || 'gpt-4.1-mini',
          store: false,
          messages: [
            { role: 'system', content: prompt.system },
            { role: 'user', content: prompt.user }
          ]
        })
      });

      if (!response.ok) {
        const detail = formatProviderErrorDetail(await response.text().catch((error) => {
          if (abortController?.signal.aborted) throw error;
          return '';
        }), apiKey);
        throw new Error(`Model provider returned HTTP ${response.status}${detail ? `: ${detail}` : ''}`);
      }

      const data = await response.json();
      return {
        provider,
        text: data.choices?.[0]?.message?.content || ''
      };
    } catch (error) {
      if (abortController?.signal.aborted) throw timeoutError;
      throw error;
    } finally {
      if (timeoutId) clearTimeout(timeoutId);
    }
  }

  throw new Error(`Unsupported MODEL_PROVIDER: ${provider}`);
}

function formatProviderErrorDetail(value, apiKey) {
  const text = String(value || '')
    .replaceAll(apiKey || '\u0000', '[redacted]')
    .replace(/Bearer\s+[A-Za-z0-9._-]+/g, 'Bearer [redacted]')
    .replace(/\s+/g, ' ')
    .trim();

  return text.length > 600 ? `${text.slice(0, 597)}...` : text;
}
