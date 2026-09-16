/**
 * Talking to whichever model the person picked.
 *
 * There is no server in between and no key of ours anywhere: the browser calls
 * the provider directly with the person's own key, or with no key at all for a
 * model running on their own machine. Every provider here was checked to allow
 * browser calls (CORS), and every host is listed in `connect-src` in
 * security-headers.js — `csp.test.js` keeps the two in step.
 *
 * Most providers speak the OpenAI chat-completions dialect, so one adapter
 * covers them. It sends only `Authorization` and `Content-Type`: some hosts
 * reject a browser preflight asking for any other header. Claude goes through
 * the official Anthropic SDK, loaded only when someone actually picks it.
 */

import { parseAdvice, schemaOf, systemPromptFor, userMessage } from './prompt';

/*
 * Browsers are increasingly strict about a public website reaching a server on
 * the visitor's own machine: Chrome asks for "local network access", and some
 * embedded browsers refuse outright (seen while testing: net::ERR_BLOCKED_BY_CLIENT
 * with no request ever reaching the server). Nothing in the page can override
 * that, so the setup steps say it plainly.
 */
const LOCAL_BROWSER_NOTE =
  'If loading fails, your browser may be blocking websites from reaching your own computer. Allow local network access if it asks, or try another browser.';

export const PROVIDERS = [
  {
    id: 'openrouter',
    label: 'OpenRouter',
    kind: 'openai',
    base: 'https://openrouter.ai/api/v1',
    needsKey: true,
    free: true,
    tagline: 'Many free models with a free account',
    keyUrl: 'https://openrouter.ai/keys',
    privacy: 'Sent to OpenRouter and the company hosting the model. Free models may log or train on what you send — check their terms.',
  },
  {
    id: 'gemini',
    label: 'Google Gemini',
    kind: 'openai',
    base: 'https://generativelanguage.googleapis.com/v1beta/openai',
    needsKey: true,
    free: true,
    tagline: 'Free tier with a Google AI Studio key',
    keyUrl: 'https://aistudio.google.com/apikey',
    privacy: 'Sent to Google. On free tiers, prompts may be used to improve Google products — check their terms.',
  },
  {
    id: 'groq',
    label: 'Groq',
    kind: 'openai',
    base: 'https://api.groq.com/openai/v1',
    needsKey: true,
    free: true,
    tagline: 'Fast open models, free tier with rate limits',
    keyUrl: 'https://console.groq.com/keys',
    privacy: 'Sent to Groq. Check their terms for how requests are kept.',
  },
  {
    id: 'ollama',
    label: 'Ollama',
    kind: 'openai',
    base: 'http://localhost:11434/v1',
    needsKey: false,
    free: true,
    local: true,
    tagline: 'Free and private — a model on your own computer',
    setupUrl: 'https://ollama.com/download',
    setup: (origin) => [
      'Install Ollama and download a model, for example: ollama pull llama3.2',
      `Start it so this site may talk to it: OLLAMA_ORIGINS=${origin} ollama serve`,
      LOCAL_BROWSER_NOTE,
    ],
    privacy: 'Nothing leaves this computer: the model runs locally.',
  },
  {
    id: 'lmstudio',
    label: 'LM Studio',
    kind: 'openai',
    base: 'http://localhost:1234/v1',
    needsKey: false,
    free: true,
    local: true,
    tagline: 'Free and private — a model on your own computer',
    setupUrl: 'https://lmstudio.ai',
    setup: () => [
      'Load a model in LM Studio and start its local server (Developer tab).',
      'Turn on "Enable CORS" in the server settings.',
      LOCAL_BROWSER_NOTE,
    ],
    privacy: 'Nothing leaves this computer: the model runs locally.',
  },
  {
    id: 'anthropic',
    label: 'Claude',
    kind: 'anthropic',
    base: 'https://api.anthropic.com',
    needsKey: true,
    free: false,
    tagline: 'Anthropic, with your own API key (paid)',
    keyUrl: 'https://console.anthropic.com/settings/keys',
    defaultModel: 'claude-opus-5',
    suggested: ['claude-opus-5', 'claude-sonnet-5', 'claude-haiku-4-5'],
    privacy: 'Sent to Anthropic under your own API account.',
  },
  {
    id: 'openai',
    label: 'OpenAI',
    kind: 'openai',
    base: 'https://api.openai.com/v1',
    needsKey: true,
    free: false,
    tagline: 'With your own API key (paid)',
    keyUrl: 'https://platform.openai.com/api-keys',
    privacy: 'Sent to OpenAI under your own API account.',
  },
];

export const providerById = (id) => PROVIDERS.find((p) => p.id === id) || PROVIDERS[0];

export class AiError extends Error {
  constructor(kind, message, hint = '') {
    super(message);
    this.name = 'AiError';
    this.kind = kind;
    this.hint = hint;
  }
}

function httpError(provider, status, detail) {
  const said = detail ? ` ${provider.label} said: ${String(detail).slice(0, 300)}` : '';
  if (status === 401 || status === 403) {
    return new AiError('auth', `${provider.label} did not accept the API key.${said}`,
      provider.keyUrl ? `Check the key, or create a new one at ${provider.keyUrl}` : '');
  }
  if (status === 402) {
    return new AiError('credit', `${provider.label} says this account has no credit for that model.${said}`,
      'Pick a free model, or add credit with the provider.');
  }
  if (status === 404) {
    return new AiError('model', `${provider.label} could not find that model.${said}`, 'Load the model list and pick one from it.');
  }
  if (status === 429) {
    return new AiError('rate', `${provider.label} is limiting requests right now.${said}`,
      provider.free ? 'Free tiers have tight limits. Wait a minute, or try another model.' : 'Wait a minute and try again.');
  }
  return new AiError('http', `${provider.label} returned an error (${status}).${said}`);
}

function networkError(provider) {
  return new AiError(
    'network',
    `Could not reach ${provider.label}.`,
    provider.local
      ? `Is ${provider.label} running and set up to allow this site? Your browser may also be blocking websites from reaching your own computer — see the setup steps.`
      : 'Check your connection, or whether a browser extension is blocking the request.'
  );
}

async function openAiRequest(provider, path, { key, body, signal }) {
  const headers = {};
  if (key) headers.Authorization = `Bearer ${key}`;
  if (body) headers['Content-Type'] = 'application/json';

  let res;
  try {
    res = await fetch(`${provider.base}${path}`, {
      method: body ? 'POST' : 'GET',
      headers,
      body: body ? JSON.stringify(body) : undefined,
      signal,
    });
  } catch (e) {
    if (e?.name === 'AbortError') throw new AiError('aborted', 'Cancelled.');
    throw networkError(provider);
  }

  let json = null;
  try {
    json = await res.json();
  } catch {
    /* some errors come back as plain text */
  }
  const detail = json?.error?.message || (Array.isArray(json) ? json[0]?.error?.message : '') || json?.message || '';

  if (!res.ok) throw httpError(provider, res.status, detail);
  // OpenRouter can report an upstream failure inside a 200.
  if (json?.error) throw httpError(provider, Number(json.error.code) || 502, detail);
  return json;
}

/* ─────────────────────────────── Anthropic ─────────────────────────────── */

async function anthropic(key) {
  const sdk = await import('@anthropic-ai/sdk');
  // Browser use is safe here in the way the flag's name warns about: the key
  // is the visitor's own, typed into their own browser, not ours shipped to them.
  return { sdk, client: new sdk.default({ apiKey: key, dangerouslyAllowBrowser: true, maxRetries: 1 }) };
}

function fromAnthropic(sdk, provider, e) {
  if (e instanceof sdk.APIUserAbortError) return new AiError('aborted', 'Cancelled.');
  if (e instanceof sdk.AuthenticationError || e instanceof sdk.PermissionDeniedError) return httpError(provider, 401, e.message);
  if (e instanceof sdk.RateLimitError) return httpError(provider, 429, e.message);
  if (e instanceof sdk.NotFoundError) return httpError(provider, 404, e.message);
  if (e instanceof sdk.BadRequestError) return httpError(provider, 400, e.message);
  if (e instanceof sdk.APIConnectionError) return networkError(provider);
  if (e instanceof sdk.APIError) return httpError(provider, e.status ?? 500, e.message);
  return new AiError('http', e?.message || 'Something went wrong.');
}

/** Models on which a declined request is re-run server-side on a fallback model. */
const SERVER_FALLBACKS = new Set(['claude-opus-5', 'claude-fable-5-1']);

async function askClaude({ provider, key, model, topic, user, signal }) {
  const { sdk, client } = await anthropic(key);
  const params = {
    model,
    max_tokens: 16000,
    system: systemPromptFor(topic),
    messages: [{ role: 'user', content: user }],
    output_config: { format: { type: 'json_schema', schema: schemaOf(topic) } },
  };

  let res;
  try {
    res = SERVER_FALLBACKS.has(model)
      ? await client.beta.messages.create(
          { ...params, betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' },
          { signal }
        )
      : await client.messages.create(params, { signal });
  } catch (e) {
    throw fromAnthropic(sdk, provider, e);
  }

  if (res.stop_reason === 'refusal') {
    throw new AiError('refusal', 'Claude declined to answer this request.', 'Try different answers, or another model.');
  }
  if (res.stop_reason === 'max_tokens') {
    throw new AiError('truncated', 'The answer was cut off before it finished.', 'Try again, or pick another model.');
  }
  return res.content.filter((b) => b.type === 'text').map((b) => b.text).join('');
}

/* ──────────────────────────────── Public API ─────────────────────────────── */

export async function listModels(provider, key, signal) {
  if (provider.kind === 'anthropic') {
    if (!key) return (provider.suggested || []).map((id) => ({ id, label: id, free: false }));
    const { sdk, client } = await anthropic(key);
    const out = [];
    try {
      for await (const m of client.models.list({ limit: 100 }, { signal })) {
        out.push({ id: m.id, label: m.display_name || m.id, free: false });
        if (out.length >= 100) break;
      }
    } catch (e) {
      throw fromAnthropic(sdk, provider, e);
    }
    return out;
  }

  const json = await openAiRequest(provider, '/models', { key, signal });
  const models = (json?.data || [])
    .map((m) => {
      const id = String(m?.id || '').replace(/^models\//, '');
      return { id, label: m?.name || id, free: provider.local || id.endsWith(':free') };
    })
    .filter((m) => m.id);

  // On OpenRouter the point is usually the free ones; put them first.
  return provider.id === 'openrouter' ? [...models.filter((m) => m.free), ...models.filter((m) => !m.free)] : models;
}

export async function requestAdvice({ provider, key, model, summary, topic = 'investing', signal }) {
  if (!model) throw new AiError('model', 'Choose a model first.');
  if (provider.needsKey && !key) throw new AiError('auth', `${provider.label} needs an API key.`);

  const user = userMessage(summary, topic);
  let raw;
  if (provider.kind === 'anthropic') {
    raw = await askClaude({ provider, key, model, topic, user, signal });
  } else {
    const json = await openAiRequest(provider, '/chat/completions', {
      key,
      signal,
      // No temperature or token limit: several current models reject one or
      // the other, and the defaults are fine for a single answer.
      body: {
        model,
        messages: [
          { role: 'system', content: systemPromptFor(topic) },
          { role: 'user', content: user },
        ],
      },
    });
    const choice = json?.choices?.[0];
    const content = choice?.message?.content;
    raw = typeof content === 'string' ? content : Array.isArray(content) ? content.map((p) => p?.text || '').join('') : '';
    if (!raw && choice?.finish_reason === 'length') {
      throw new AiError('truncated', 'The model ran out of room before answering.', 'Try another model.');
    }
  }

  return { advice: parseAdvice(raw, topic), topic, model, provider: provider.id, at: Date.now() };
}
