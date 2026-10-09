/**
 * @vitest-environment jsdom
 */

/**
 * Two tabs, one ledger.
 *
 * Written after a real loss: every tab saved the state it had just loaded as
 * soon as it opened, stamped with a fresh time. A tab opened in the moment
 * before another tab's pending save landed therefore wrote *old* data with a
 * *newer* stamp, and the newer stamp won — the other tab adopted it and its own
 * entry vanished, with no error anywhere. It surfaced in Firefox, which slows
 * timers in a tab that is not in front and so widens the moment to a second.
 *
 * The rule these pin down: a tab that has changed nothing writes nothing.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { act } from '@testing-library/react';
import { LS_KEY, renderWithStore, seedState, store } from '../test/render';

const wait = (ms) => act(() => new Promise((resolve) => setTimeout(resolve, ms)));
const stored = () => JSON.parse(localStorage.getItem(LS_KEY));

const entryA = { id: 'a1', date: '2026-10-01', kind: 'expense', category: 'dining', title: 'From tab A', note: '', amount: 111, createdAt: 1 };

beforeEach(() => localStorage.clear());
afterEach(() => localStorage.clear());

describe('a tab that has changed nothing', () => {
  it('does not write when it opens', async () => {
    localStorage.setItem(LS_KEY, JSON.stringify({ ...seedState({}), savedAt: 1000 }));
    renderWithStore(<div />);

    // Well past the 400ms save debounce.
    await wait(700);
    expect(stored().savedAt, 'opening the app re-stamped data it never changed').toBe(1000);
  });

  it('leaves another tab\'s newer write alone', async () => {
    // This tab opens on the ledger as it was...
    localStorage.setItem(LS_KEY, JSON.stringify({ ...seedState({}), savedAt: 1000 }));
    renderWithStore(<div />);
    expect(store().state.entries).toHaveLength(0);

    // ...and a moment later the other tab's save lands.
    localStorage.setItem(LS_KEY, JSON.stringify({ ...seedState({ entries: [entryA] }), savedAt: 2000 }));

    await wait(700);
    expect(stored().entries.map((e) => e.title), 'the other tab\'s entry was overwritten').toEqual(['From tab A']);
    expect(stored().savedAt).toBe(2000);
  });
});

describe('a tab that did change something', () => {
  it('still saves', async () => {
    localStorage.setItem(LS_KEY, JSON.stringify({ ...seedState({}), savedAt: 1000 }));
    renderWithStore(<div />);

    await act(async () => {
      store().dispatch({ type: 'addEntry', entry: { date: '2026-10-02', kind: 'expense', category: 'dining', title: 'Mine', amount: 50 } });
    });
    await wait(700);

    expect(stored().entries.map((e) => e.title)).toEqual(['Mine']);
    expect(stored().savedAt).toBeGreaterThan(1000);
  });
});
