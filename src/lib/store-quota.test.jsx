/**
 * @vitest-environment jsdom
 */

/**
 * A ledger bigger than localStorage.
 *
 * Safari allows about 5MB, counted in UTF-16, so somewhere around 15,000
 * entries the mirror write starts failing. It used to fail silently and leave
 * the last copy that fit, which every start-up then read as current: an edit
 * made before IndexedDB answered was stamped newer than everything logged since
 * and overwrote it. Now the mirror becomes a marker and the app waits.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, screen } from '@testing-library/react';
import { IDBFactory } from 'fake-indexeddb';

const LS_KEY = 'cointrack.v1';
const LIMIT = 2000; // characters; anything longer "exceeds the quota"
const wait = (ms) => act(() => new Promise((resolve) => setTimeout(resolve, ms)));

let persist;

/** localStorage with a quota: any value longer than LIMIT is refused, as Safari does. */
function quotaStorage() {
  const data = new Map();
  return {
    getItem: (k) => (data.has(k) ? data.get(k) : null),
    setItem: (k, v) => {
      if (String(v).length > LIMIT) throw new DOMException('The quota has been exceeded.', 'QuotaExceededError');
      data.set(k, String(v));
    },
    removeItem: (k) => data.delete(k),
    clear: () => data.clear(),
    key: (i) => [...data.keys()][i] ?? null,
    get length() { return data.size; },
  };
}

const bigState = (savedAt) => ({
  version: 1, onboarded: true, theme: 'dark',
  profile: { name: '', currency: 'INR', weekStart: 1, monthlyIncome: 85000, savingsTargetPct: 20, budgets: {} },
  entries: Array.from({ length: 40 }, (_, i) => ({
    id: `e${i}`, date: '2026-10-01', kind: 'expense', category: 'dining', title: `Entry number ${i}`, note: '', amount: 100 + i, createdAt: i,
  })),
  assets: [], recurring: [], goals: [], debts: [], notes: [], dismissed: [], savedAt,
});

const realStorage = Object.getOwnPropertyDescriptor(window, 'localStorage');

beforeEach(async () => {
  vi.resetModules();
  globalThis.indexedDB = new IDBFactory();
  Object.defineProperty(window, 'localStorage', { value: quotaStorage(), configurable: true });
  persist = await import('./persist');
});

afterEach(() => {
  if (realStorage) Object.defineProperty(window, 'localStorage', realStorage);
  else delete window.localStorage;
});

/** Save the way the app does, and let the IndexedDB write land. */
async function saveTooBig(state) {
  persist.save(state, { immediate: true });
  await new Promise((resolve) => setTimeout(resolve, 50));
}

describe('when the ledger outgrows localStorage', () => {
  it('replaces the mirror with a marker instead of leaving a stale copy', async () => {
    localStorage.setItem(LS_KEY, JSON.stringify({ entries: [], savedAt: 1 })); // an old copy that fit
    await saveTooBig(bigState(5000));

    const mirror = JSON.parse(localStorage.getItem(LS_KEY));
    expect(persist.isMirrorMarker(mirror)).toBe(true);
    // Stamped like any save, and the same stamp as the IndexedDB copy.
    expect(mirror.theme).toBe('dark');
    expect(mirror.savedAt).toBe((await persist.load()).savedAt);
    expect(mirror.entries, 'the stale copy is still there').toBeUndefined();
  });

  it('reads the IndexedDB copy, and never the marker, as the ledger', async () => {
    await saveTooBig(bigState(5000));
    const loaded = await persist.load();
    expect(loaded.entries).toHaveLength(40);
  });

  it('renders nothing until IndexedDB answers, then the real ledger, without writing', async () => {
    await saveTooBig(bigState(5000));
    const stampedAt = JSON.parse(localStorage.getItem(LS_KEY)).savedAt;
    vi.resetModules();
    const { renderWithStore, store } = await import('../test/render');

    renderWithStore(<div>the app</div>);
    // Nothing a person could type into while the real copy is still loading.
    expect(screen.queryByText('the app')).toBeNull();

    await wait(100);
    expect(screen.getByText('the app')).toBeInTheDocument();
    expect(store().state.entries).toHaveLength(40);
    expect(store().state.theme).toBe('dark');

    // Opening it changed nothing, so nothing was written back.
    await wait(600);
    expect(JSON.parse(localStorage.getItem(LS_KEY)).savedAt).toBe(stampedAt);
  });

  it('still saves normally while the ledger fits', async () => {
    const small = { ...bigState(7000), entries: [] };
    persist.save(small, { immediate: true });
    const mirror = JSON.parse(localStorage.getItem(LS_KEY));
    expect(persist.isMirrorMarker(mirror)).toBe(false);
    expect(mirror.savedAt).toBeGreaterThan(0);
  });
});
