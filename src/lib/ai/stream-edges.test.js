/**
 * How real event streams misbehave.
 *
 * Written after a bug: a stream whose last event ended with a single newline
 * lost its final chunk, so the answer arrived truncated and the user was told
 * the model had answered in the wrong format.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { providerById, requestAdvice } from './providers';

const advice = {
  summary: 'Café costs 300 € — naïve budgeting won’t fix it.',
  allocation: [{ assetClass: 'Index funds', targetPct: 100, why: 'Long horizon' }],
  actions: [{ title: 'Build a cushion', detail: 'Three months', priority: 'now' }],
  risks: [], assumptions: [],
};
const summary = { currency: 'EUR' };
const provider = providerById('openrouter');

/** Deliver raw SSE bytes, split at the given byte offsets. */
const rawStream = (sse, cuts) => {
  const bytes = new TextEncoder().encode(sse);
  const pieces = [];
  let at = 0;
  for (const cut of [...cuts, bytes.length]) {
    pieces.push(bytes.slice(at, cut));
    at = cut;
  }
  const body = new ReadableStream({
    start(c) { for (const p of pieces) c.enqueue(p); c.close(); },
  });
  return Promise.resolve(new Response(body, { status: 200, headers: { 'Content-Type': 'text/event-stream' } }));
};

const events = (text, size) => {
  let out = '';
  for (let i = 0; i < text.length; i += size) {
    out += `data: ${JSON.stringify({ choices: [{ delta: { content: text.slice(i, i + size) } }] })}\n\n`;
  }
  return out;
};

let fetchMock;
beforeEach(() => { fetchMock = vi.fn(); vi.stubGlobal('fetch', fetchMock); });
afterEach(() => vi.unstubAllGlobals());

describe('event stream edge cases', () => {
  it('handles a stream that ends without a trailing blank line', async () => {
    const text = JSON.stringify(advice);
    // Last event terminated by a single newline, as some proxies send it.
    const sse = events(text.slice(0, 40), 20) + `data: ${JSON.stringify({ choices: [{ delta: { content: text.slice(40) } }] })}\n`;
    fetchMock.mockReturnValueOnce(rawStream(sse, []));
    const out = await requestAdvice({ provider, key: 'k', model: 'm', summary });
    expect(out.advice.actions[0].title).toBe('Build a cushion');
  });

  it('handles a multi-byte character split across two chunks', async () => {
    const sse = events(JSON.stringify(advice), 12);
    const bytes = new TextEncoder().encode(sse);
    // Cut in the middle of the file, wherever that lands — often mid-character
    // for é / ’ / €.
    const cuts = [];
    for (let i = 17; i < bytes.length; i += 23) cuts.push(i);
    fetchMock.mockReturnValueOnce(rawStream(sse, cuts));
    const out = await requestAdvice({ provider, key: 'k', model: 'm', summary });
    expect(out.advice.summary).toBe(advice.summary);
  });

  it('ignores keep-alive comments and data lines with no space', async () => {
    const text = JSON.stringify(advice);
    const sse = `: ping\n\ndata:${JSON.stringify({ choices: [{ delta: { content: text } }] })}\n\n: ping\n\ndata: [DONE]\n\n`;
    fetchMock.mockReturnValueOnce(rawStream(sse, []));
    const out = await requestAdvice({ provider, key: 'k', model: 'm', summary });
    expect(out.advice.summary).toBe(advice.summary);
  });

  it('reports a stream that ends with nothing in it', async () => {
    fetchMock.mockReturnValueOnce(rawStream('data: [DONE]\n\n', []));
    await expect(requestAdvice({ provider, key: 'k', model: 'm', summary })).rejects.toMatchObject({ kind: 'empty' });
  });
});
