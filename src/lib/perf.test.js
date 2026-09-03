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
 * would be testing itself.
 */
const coldState = () => ({ ...state, entries: state.entries.slice() });

describe('advisor cost', () => {
  it('has a fixture big enough to be worth measuring', () => {
    expect(state.entries.length).toBeGreaterThan(1000);
  });

  /**
   * Budgets expressed as multiples of one period derivation, not in
   * milliseconds.
   *
   * An absolute threshold measures the machine as much as the code: the same
   * suite that takes 4ms on a laptop takes 25ms on a shared CI runner, and a
   * build that fails only on a busy afternoon teaches people to ignore it.
   *
   * The ratio is also the thing actually worth protecting. `computeFinance` is
   * the unit of work the advisor is built from, so "how many of those does a
   * dashboard cost?" is precisely the question memoisation exists to answer —
   * it was around forty before, and is under ten now.
   */
  it('costs a bounded number of period derivations, cold', () => {
    const unit = median(() => computeFinance(coldState(), 'month', 0));
    const whole = median(() => headlineSuggestions(coldState(), 3));
    const ratio = whole / unit;

    console.log(
      `  computeFinance: ${unit.toFixed(2)}ms · headlineSuggestions cold: ` +
      `${whole.toFixed(2)}ms (${ratio.toFixed(1)}× one derivation)`
    );

    // Four advisor sections sharing their month and history derivations. Without
    // the shared cache this was roughly forty.
    expect(ratio, `dashboard cost ${ratio.toFixed(1)} derivations`).toBeLessThan(14);
  });

  it('is free on every render after the first', () => {
    // Identity-keyed memoisation: the same state object costs nothing twice,
    // which is what makes a re-render cheap.
    const unit = median(() => computeFinance(coldState(), 'month', 0));
    const fixed = coldState();
    headlineSuggestions(fixed, 3);
    const warm = median(() => headlineSuggestions(fixed, 3));

    console.log(`  headlineSuggestions warm: ${warm.toFixed(3)}ms (${(warm / unit).toFixed(3)}× one derivation)`);
    expect(warm / unit, 'warm call should be a rounding error').toBeLessThan(0.05);
  });

  it('answers a single section in a fraction of a dashboard', () => {
    const whole = median(() => headlineSuggestions(coldState(), 3));
    const one = median(() => buildSuggestions(coldState(), 'overall'));

    console.log(`  buildSuggestions cold: ${one.toFixed(2)}ms (${(one / whole).toFixed(2)}× a dashboard)`);
    expect(one / whole, 'one section should cost less than a whole dashboard').toBeLessThan(1.1);
  });
});
