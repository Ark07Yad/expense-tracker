/**
 * Performance budgets.
 *
 * The advisor is the expensive thing in this app: it re-derives whole months to
 * answer questions the charts have already answered, and the dashboard asks it
 * for four sections on every render. That is fine at two hundred entries and
 * not obviously fine at several thousand, which is where a few years of a
 * CSV-imported statement lands.
 *
 * These are budgets, not benchmarks — deliberately loose, so they fail on an
 * order-of-magnitude regression rather than on a noisy machine.
 */

import { describe, expect, it } from 'vitest';
import { buildDemo } from './demo';
import { buildSuggestions, headlineSuggestions } from './insights';
import { computeFinance } from './useFinance';

const demo = buildDemo({ income: 85000, months: 24 });
const state = {
  version: 1, onboarded: true, theme: 'dark',
  profile: {
    name: '', currency: 'INR', weekStart: 1, monthlyIncome: 85000,
    savingsTargetPct: 20, budgets: demo.budgets,
  },
  entries: demo.entries,
  assets: demo.assets,
  notes: [], dismissed: [], recurring: [], goals: [],
};

const median = (fn, runs = 15) => {
  fn(); // warm
  const times = [];
  for (let i = 0; i < runs; i++) {
    const t0 = performance.now();
    fn();
    times.push(performance.now() - t0);
  }
  return times.sort((a, b) => a - b)[Math.floor(runs / 2)];
};

/**
 * A fresh state object, so the identity-keyed cache misses.
 *
 * Measuring only warm calls would report 0ms and guard nothing — the cache
 * would be testing itself. The cold figure is the real work, paid once per
 * state change; the warm figure is what every subsequent render costs.
 */
const coldState = () => ({ ...state, entries: state.entries.slice() });

describe('advisor cost', () => {
  it('has a fixture big enough to be worth measuring', () => {
    expect(state.entries.length).toBeGreaterThan(1000);
  });

  it('answers a whole dashboard in a frame, cold', () => {
    // The call on the dashboard's render path, with nothing cached: four
    // sections, each re-deriving several months.
    const ms = median(() => headlineSuggestions(coldState(), 3));
    console.log(`  headlineSuggestions cold: ${ms.toFixed(2)}ms`);
    expect(ms, `cold headlineSuggestions took ${ms.toFixed(1)}ms`).toBeLessThan(16);
  });

  it('is free on every render after the first', () => {
    // Identity-keyed memoisation: the same state object costs nothing twice,
    // which is what makes a re-render cheap.
    const fixed = coldState();
    headlineSuggestions(fixed, 3);
    const ms = median(() => headlineSuggestions(fixed, 3));
    console.log(`  headlineSuggestions warm: ${ms.toFixed(3)}ms`);
    expect(ms, `warm headlineSuggestions took ${ms.toFixed(2)}ms`).toBeLessThan(0.5);
  });

  it('answers a single section quickly, cold', () => {
    const ms = median(() => buildSuggestions(coldState(), 'overall'));
    console.log(`  buildSuggestions cold:    ${ms.toFixed(2)}ms`);
    expect(ms, `cold buildSuggestions took ${ms.toFixed(1)}ms`).toBeLessThan(12);
  });

  it('derives one period cheaply', () => {
    const ms = median(() => computeFinance(coldState(), 'month', 0));
    console.log(`  computeFinance:           ${ms.toFixed(2)}ms`);
    expect(ms, `computeFinance took ${ms.toFixed(1)}ms`).toBeLessThan(4);
  });
});
