/**
 * Cancelling mid-stream must read as cancelled, not as a network failure —
 * the difference decides whether the sheet shows an error or goes back.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { providerById, requestAdvice } from './providers';

const provider = providerById('openrouter');
const summary = { currency: 'EUR' };

/** A stream that keeps sending until the request is aborted. */
const endless = (signal) => {
  const body = new ReadableStream({
    async pull(c) {
      if (signal.aborted) { c.error(Object.assign(new Error('aborted'), { name: 'AbortError' })); return; }
      c.enqueue(new TextEncoder().encode(`data: ${JSON.stringify({ choices: [{ delta: { content: 'x' } }] })}\n\n`));
      await new Promise((r) => setTimeout(r, 5));
    },
  });
  return Promise.resolve(new Response(body, { status: 200, headers: { 'Content-Type': 'text/event-stream' } }));
};

let fetchMock;
beforeEach(() => { fetchMock = vi.fn(); vi.stubGlobal('fetch', fetchMock); });
afterEach(() => vi.unstubAllGlobals());

describe('cancelling mid-stream', () => {
  it('reports it as cancelled, not as a network failure', async () => {
    const controller = new AbortController();
    fetchMock.mockImplementation((_url, init) => endless(init.signal));

    const pending = requestAdvice({
      provider, key: 'k', model: 'm', summary,
      signal: controller.signal,
      onChunk: (sofar) => { if (sofar.length > 3) controller.abort(); },
    });

    await expect(pending).rejects.toMatchObject({ kind: 'aborted' });
  });
});
