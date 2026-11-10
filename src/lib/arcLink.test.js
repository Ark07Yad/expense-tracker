import { describe, it, expect, vi, beforeEach } from 'vitest';
import { arcPayload, scheduleArcSync, setArcLink, isArcLinkOn, onArcLink } from './arcLink';

const store = new Map();
globalThis.localStorage = { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k) };

const state = {
  version: 1,
  profile: { currency: 'EUR', monthlyIncome: 3000, savingsTargetPct: 20, budgets: { dining: 100 }, name: 'Private Name' },
  entries: [{ id: 'e1', date: '2026-11-10', kind: 'expense', category: 'dining', title: 'Pizza', amount: 12, note: 'secret note', attachments: [{ id: 'att_x' }], fx: { currency: 'USD' } }],
  assets: [{ name: 'ETF', class: 'fund', history: {}, note: 'n' }],
  debts: [],
  goals: [{ id: 'g', name: 'Laptop', target: 1500, opening: 0, deadline: null, note: 'n' }],
  recurring: [{ id: 'r' }],
  ai: { key: 'sk-x' },
};

describe('Link to ARC', () => {
  beforeEach(() => {
    store.clear();
    vi.useFakeTimers();
  });

  it('sends only what ARC uses', () => {
    const json = JSON.stringify(arcPayload(state));
    for (const secret of ['secret note', 'att_x', 'USD', 'Private Name', 'sk-x', '"recurring"']) expect(json).not.toContain(secret);
    expect(arcPayload(state).state.entries[0]).toEqual({ id: 'e1', date: '2026-11-10', kind: 'expense', category: 'dining', title: 'Pizza', amount: 12, goalId: undefined });
  });

  it('is off by default and debounces when on', async () => {
    const fetchImpl = vi.fn(async () => ({ ok: true }));
    scheduleArcSync(state, fetchImpl);
    vi.advanceTimersByTime(5000);
    expect(fetchImpl).not.toHaveBeenCalled();

    setArcLink(true);
    expect(isArcLinkOn()).toBe(true);
    scheduleArcSync(state, fetchImpl);
    scheduleArcSync(state, fetchImpl);
    vi.advanceTimersByTime(2100);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe('http://127.0.0.1:8795/api/bridge/push/cointrack');
    expect(init.headers['x-arc-bridge']).toBe('1');
    setArcLink(false);
    expect(isArcLinkOn()).toBe(false);
  });

  it('reports ARC being offline without throwing', async () => {
    const seen = [];
    const off = onArcLink((s) => seen.push(s.state));
    setArcLink(true);
    scheduleArcSync(state, async () => {
      throw new Error('ECONNREFUSED');
    });
    await vi.advanceTimersByTimeAsync(2100);
    expect(seen).toContain('offline');
    off();
  });
});
