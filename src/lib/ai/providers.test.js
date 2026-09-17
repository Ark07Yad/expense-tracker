import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const sdkCalls = { create: [], beta: [] };
let nextResponse;

vi.mock('@anthropic-ai/sdk', () => {
  class APIError extends Error { constructor(status, message) { super(message); this.status = status; } }
  class AuthenticationError extends APIError {}
  class PermissionDeniedError extends APIError {}
  class RateLimitError extends APIError {}
  class NotFoundError extends APIError {}
  class BadRequestError extends APIError {}
  class APIConnectionError extends APIError {}
  class APIUserAbortError extends APIError {}
  /** A stream that replays the canned answer as text deltas, then settles. */
  const fakeStream = (record) => (params, options) => {
    record.push({ params, options });
    const message = nextResponse();
    const text = (message.content || []).filter((b) => b.type === 'text').map((b) => b.text).join('');
    return {
      async *[Symbol.asyncIterator]() {
        for (let i = 0; i < text.length; i += 25) {
          yield { type: 'content_block_delta', delta: { type: 'text_delta', text: text.slice(i, i + 25) } };
        }
      },
      finalMessage: async () => message,
    };
  };

  function Anthropic(opts) {
    this.opts = opts;
    const withOpts = (record) => (params, options) => fakeStream(record)({ ...params }, { ...options, opts });
    this.messages = { stream: withOpts(sdkCalls.create) };
    this.beta = { messages: { stream: withOpts(sdkCalls.beta) } };
  }
  return { default: Anthropic, APIError, AuthenticationError, PermissionDeniedError, RateLimitError, NotFoundError, BadRequestError, APIConnectionError, APIUserAbortError };
});

const { AiError, PROVIDERS, listModels, providerById, requestAdvice } = await import('./providers');

const advice = {
  summary: 'Keep going.',
  allocation: [{ assetClass: 'Index funds', targetPct: 100, why: 'Long horizon' }],
  actions: [{ title: 'Build a cushion', detail: 'Three months', priority: 'now' }],
  risks: [], assumptions: [],
};
const spendingAdvice = {
  summary: 'Dining is the mover.',
  caps: [{ category: 'Food & Dining', monthlyCap: 300, why: 'Just above habit' }],
  actions: [{ title: 'Cap dining', detail: 'At 300', priority: 'soon' }],
  risks: [], assumptions: [],
};
const summary = { currency: 'EUR', cashFlow: { typicalMonthlyIncome: 4000 } };
const reply = (body, init = {}) => Promise.resolve(new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' }, ...init }));

/** An OpenAI-style event stream, delivered in small pieces. */
const streamed = (text, { size = 30 } = {}) => {
  const body = new ReadableStream({
    start(controller) {
      const encode = new TextEncoder();
      for (let i = 0; i < text.length; i += size) {
        controller.enqueue(encode.encode(`data: ${JSON.stringify({ choices: [{ delta: { content: text.slice(i, i + size) } }] })}\n\n`));
      }
      controller.enqueue(encode.encode('data: [DONE]\n\n'));
      controller.close();
    },
  });
  return Promise.resolve(new Response(body, { status: 200, headers: { 'Content-Type': 'text/event-stream' } }));
};

let fetchMock;
beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
  sdkCalls.create = [];
  sdkCalls.beta = [];
});
afterEach(() => vi.unstubAllGlobals());

describe('OpenAI-compatible providers', () => {
  it('post the system prompt and summary with only the two allowed headers', async () => {
    fetchMock.mockReturnValueOnce(reply({ choices: [{ message: { content: JSON.stringify(advice) } }] }));
    const out = await requestAdvice({ provider: providerById('groq'), key: 'gsk-1', model: 'm', summary });

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://api.groq.com/openai/v1/chat/completions');
    expect(Object.keys(init.headers).sort()).toEqual(['Authorization', 'Content-Type']);
    expect(init.headers.Authorization).toBe('Bearer gsk-1');
    const body = JSON.parse(init.body);
    expect(body.model).toBe('m');
    expect(body.messages.map((x) => x.role)).toEqual(['system', 'user']);
    expect(body.messages[0].content).toMatch(/investment guidance/);
    expect(body.messages[1].content).toContain('All money is in EUR');
    expect(body).not.toHaveProperty('temperature');
    expect(out.advice.actions[0].title).toBe('Build a cushion');
  });

  it('asks the question the topic is about, and says which topic answered', async () => {
    fetchMock.mockReturnValueOnce(reply({ choices: [{ message: { content: JSON.stringify(spendingAdvice) } }] }));
    const out = await requestAdvice({ provider: providerById('groq'), key: 'k', model: 'm', summary, topic: 'spending' });

    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.messages[0].content).toMatch(/guidance on someone's spending/);
    expect(body.messages[1].content).toContain('"caps"');
    expect(out.topic).toBe('spending');
    expect(out.advice.rows).toEqual([{ label: 'Food & Dining', value: 300, why: 'Just above habit' }]);
  });

  it('send no key at all to a local model', async () => {
    fetchMock.mockReturnValueOnce(reply({ choices: [{ message: { content: JSON.stringify(advice) } }] }));
    await requestAdvice({ provider: providerById('ollama'), key: '', model: 'llama3.2', summary });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('http://localhost:11434/v1/chat/completions');
    expect(init.headers).not.toHaveProperty('Authorization');
  });

  it('turn HTTP failures into messages a person can act on', async () => {
    const provider = providerById('openrouter');
    fetchMock.mockReturnValueOnce(reply({ error: { message: 'bad key' } }, { status: 401 }));
    await expect(requestAdvice({ provider, key: 'k', model: 'm', summary })).rejects.toMatchObject({ kind: 'auth', hint: expect.stringContaining('openrouter.ai/keys') });

    fetchMock.mockReturnValueOnce(reply({ error: { message: 'slow down' } }, { status: 429 }));
    await expect(requestAdvice({ provider, key: 'k', model: 'm', summary })).rejects.toMatchObject({ kind: 'rate', message: expect.stringContaining('slow down') });

    fetchMock.mockReturnValueOnce(reply({ error: { code: 502, message: 'upstream down' } }));
    await expect(requestAdvice({ provider, key: 'k', model: 'm', summary })).rejects.toMatchObject({ kind: 'http' });
  });

  it('explain an unreachable local model differently from a dropped connection', async () => {
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));
    await expect(requestAdvice({ provider: providerById('ollama'), model: 'x', summary }))
      .rejects.toMatchObject({ kind: 'network', hint: expect.stringContaining('running') });
    await expect(requestAdvice({ provider: providerById('groq'), key: 'k', model: 'x', summary }))
      .rejects.toMatchObject({ kind: 'network', hint: expect.stringContaining('connection') });
  });

  it('refuse to send without a key or a model', async () => {
    await expect(requestAdvice({ provider: providerById('groq'), key: '', model: 'm', summary })).rejects.toBeInstanceOf(AiError);
    await expect(requestAdvice({ provider: providerById('ollama'), model: '', summary })).rejects.toMatchObject({ kind: 'model' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('list OpenRouter free models first, and strip Gemini model prefixes', async () => {
    fetchMock.mockReturnValueOnce(reply({ data: [{ id: 'a/paid' }, { id: 'b/free:free' }] }));
    expect((await listModels(providerById('openrouter'))).map((m) => m.id)).toEqual(['b/free:free', 'a/paid']);

    fetchMock.mockReturnValueOnce(reply({ data: [{ id: 'models/gemini-x' }] }));
    expect((await listModels(providerById('gemini'), 'k')).map((m) => m.id)).toEqual(['gemini-x']);
  });
});

describe('streaming', () => {
  const provider = providerById('openrouter');

  it('asks for a stream, and reports the text as it arrives', async () => {
    const text = JSON.stringify(advice);
    fetchMock.mockReturnValueOnce(streamed(text));
    const seen = [];

    const out = await requestAdvice({ provider, key: 'k', model: 'm', summary, onChunk: (sofar) => seen.push(sofar) });

    expect(JSON.parse(fetchMock.mock.calls[0][1].body).stream).toBe(true);
    expect(seen.length).toBeGreaterThan(1);
    // Each call carries everything so far, ending with the whole answer.
    expect(seen[0].length).toBeLessThan(seen.at(-1).length);
    expect(seen.at(-1)).toBe(text);
    expect(out.advice.summary).toBe('Keep going.');
  });

  it('reads an answer split mid-token across chunks', async () => {
    fetchMock.mockReturnValueOnce(streamed(JSON.stringify(advice), { size: 3 }));
    const out = await requestAdvice({ provider, key: 'k', model: 'm', summary });
    expect(out.advice.actions[0].title).toBe('Build a cushion');
  });

  it('falls back to a plain response when a provider ignores the stream flag', async () => {
    fetchMock.mockReturnValueOnce(reply({ choices: [{ message: { content: JSON.stringify(advice) } }] }));
    const out = await requestAdvice({ provider, key: 'k', model: 'm', summary, onChunk: () => {} });
    expect(out.advice.summary).toBe('Keep going.');
  });

  it('reports an error sent inside the stream', async () => {
    const body = new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode(`data: ${JSON.stringify({ error: { message: 'upstream exploded', code: 502 } })}\n\n`));
        controller.close();
      },
    });
    fetchMock.mockReturnValueOnce(Promise.resolve(new Response(body, { status: 200, headers: { 'Content-Type': 'text/event-stream' } })));
    await expect(requestAdvice({ provider, key: 'k', model: 'm', summary })).rejects.toMatchObject({ kind: 'http', message: expect.stringContaining('upstream exploded') });
  });

  it('still maps a failed request, stream or not', async () => {
    fetchMock.mockReturnValueOnce(reply({ error: { message: 'bad key' } }, { status: 401 }));
    await expect(requestAdvice({ provider, key: 'k', model: 'm', summary })).rejects.toMatchObject({ kind: 'auth' });
  });
});

describe('Claude', () => {
  const provider = providerById('anthropic');
  const ok = () => ({ stop_reason: 'end_turn', content: [{ type: 'text', text: JSON.stringify(advice) }] });

  it('uses structured output and server-side fallbacks on Opus 5, with the key only in the client', async () => {
    nextResponse = ok;
    const out = await requestAdvice({ provider, key: 'sk-ant-1', model: 'claude-opus-5', summary });
    expect(sdkCalls.beta).toHaveLength(1);
    const { params, options } = sdkCalls.beta[0];
    expect(options.opts).toEqual(expect.objectContaining({ apiKey: 'sk-ant-1', dangerouslyAllowBrowser: true }));
    expect(params.betas).toEqual(['server-side-fallback-2026-07-01']);
    expect(params.fallbacks).toBe('default');
    expect(params.output_config.format.type).toBe('json_schema');
    expect(params.output_config.format.schema.required).toContain('allocation');
    expect(params.system).toMatch(/General guidance only/);
    expect(out.advice.summary).toBe('Keep going.');
  });

  it('uses the plain endpoint for other Claude models', async () => {
    nextResponse = ok;
    await requestAdvice({ provider, key: 'k', model: 'claude-sonnet-5', summary });
    expect(sdkCalls.create).toHaveLength(1);
    expect(sdkCalls.create[0].params).not.toHaveProperty('fallbacks');
  });

  it('asks for the topic own schema', async () => {
    nextResponse = () => ({ stop_reason: 'end_turn', content: [{ type: 'text', text: JSON.stringify(spendingAdvice) }] });
    await requestAdvice({ provider, key: 'k', model: 'claude-sonnet-5', summary, topic: 'spending' });
    expect(sdkCalls.create[0].params.output_config.format.schema.required).toContain('caps');
  });

  it('hands back Claude text as it arrives', async () => {
    nextResponse = ok;
    const seen = [];
    await requestAdvice({ provider, key: 'k', model: 'claude-sonnet-5', summary, onChunk: (sofar) => seen.push(sofar) });
    expect(seen.length).toBeGreaterThan(1);
    expect(seen.at(-1)).toBe(JSON.stringify(advice));
  });

  it('reports a refusal instead of reading empty content', async () => {
    nextResponse = () => ({ stop_reason: 'refusal', content: [] });
    await expect(requestAdvice({ provider, key: 'k', model: 'claude-opus-5', summary })).rejects.toMatchObject({ kind: 'refusal' });
  });

  it('offers known model ids before a key is entered', async () => {
    expect((await listModels(provider, '')).map((m) => m.id)).toEqual(['claude-opus-5', 'claude-sonnet-5', 'claude-haiku-4-5']);
  });
});

describe('the provider list', () => {
  it('has unique ids and a host for every provider', () => {
    expect(new Set(PROVIDERS.map((p) => p.id)).size).toBe(PROVIDERS.length);
    for (const p of PROVIDERS) expect(() => new URL(p.base)).not.toThrow();
  });
});
