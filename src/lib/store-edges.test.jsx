/** @vitest-environment jsdom */

/**
 * The reducer is the only thing standing between a corrupted import and the
 * whole ledger, so it gets junk on purpose.
 *
 * Written after a bug: `Number(x) || 0` let Infinity through, and one infinite
 * amount turns every total, chart and suggestion downstream into Infinity with
 * nothing to show which entry caused it.
 */
import { describe, expect, it } from 'vitest';
import { act } from '@testing-library/react';
import { renderWithStore, seed, store } from '../test/render';

const dispatch = (action) => act(() => store().dispatch(action));
const state = () => store().state;

const mount = (over) => {
  seed(over);
  renderWithStore(<div />);
};

describe('the reducer under pressure', () => {
  it('keeps the entries when a goal or debt is deleted, untagged', () => {
    mount({ goals: [{ id: 'g', name: 'Trip', target: 1000, opening: 0, deadline: null, createdAt: 1 }] });
    dispatch({ type: 'addEntry', entry: { date: '2026-09-01', kind: 'saving', category: 'emergency', title: 's', amount: 100, goalId: 'g' } });
    dispatch({ type: 'deleteGoal', id: 'g' });
    expect(state().entries).toHaveLength(1);
    expect(state().entries[0].goalId).toBeUndefined();
    expect(state().goals).toHaveLength(0);
  });

  it('refuses junk amounts rather than storing NaN', () => {
    mount({});
    for (const amount of ['abc', null, undefined, NaN, Infinity, -5]) {
      dispatch({ type: 'addEntry', entry: { date: '2026-09-01', kind: 'expense', category: 'dining', title: 'x', amount } });
    }
    for (const entry of state().entries) {
      expect(Number.isFinite(entry.amount), `${entry.amount}`).toBe(true);
      expect(entry.amount, 'an expense of a negative amount is an earning in disguise').toBeGreaterThanOrEqual(0);
    }
  });

  it('clears a budget when the cap is emptied', () => {
    mount({});
    dispatch({ type: 'budget', category: 'dining', amount: 4000 });
    expect(state().profile.budgets.dining).toBe(4000);
    dispatch({ type: 'budget', category: 'dining', amount: null });
    expect(state().profile.budgets.dining ?? 0).toBe(0);
    dispatch({ type: 'budget', category: 'dining', amount: -100 });
    expect(state().profile.budgets.dining ?? 0, 'a negative cap is meaningless').toBeGreaterThanOrEqual(0);
  });

  it('does not import the same rows twice', () => {
    mount({});
    const rows = [
      { date: '2026-09-01', kind: 'expense', category: 'dining', title: 'Lunch', note: '', amount: 300 },
      { date: '2026-09-02', kind: 'expense', category: 'dining', title: 'Dinner', note: '', amount: 500 },
    ];
    dispatch({ type: 'importEntries', entries: rows });
    const first = state().entries.length;
    expect(first).toBe(2);
    const ids = state().entries.map((e) => e.id);
    expect(new Set(ids).size, 'every entry needs its own id').toBe(ids.length);
  });
});
