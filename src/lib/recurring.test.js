/**
 * Recurring schedules.
 *
 * The cases that matter are the ones that are wrong silently: a monthly rule
 * anchored on the 31st drifting to the 28th forever, a skipped occurrence
 * coming back, and a rule left dormant for a year producing an unbounded queue.
 */

import { describe, expect, it } from 'vitest';
import {
  describeRule, dueList, dueOccurrences, dueTotals, entryFromRule,
  MAX_PENDING, nextOccurrence, nthOccurrence,
} from './recurring';

const rule = (over = {}) => ({
  id: 'r1', kind: 'expense', category: 'housing', title: 'Rent', note: '',
  amount: 1000, frequency: 'monthly', anchorDate: '2026-01-03',
  lastResolved: null, active: true, createdAt: 1, ...over,
});

describe('nthOccurrence', () => {
  it('steps monthly from the anchor', () => {
    const r = rule();
    expect(nthOccurrence(r, 0)).toBe('2026-01-03');
    expect(nthOccurrence(r, 1)).toBe('2026-02-03');
    expect(nthOccurrence(r, 13)).toBe('2027-02-03');
  });

  it('does not let a month-end anchor drift', () => {
    // Stepping one month at a time, the 31st becomes 28 Feb and then stays
    // there forever. Measuring from the anchor clamps only for the short month.
    const r = rule({ anchorDate: '2026-01-31' });
    expect(nthOccurrence(r, 1)).toBe('2026-02-28');
    expect(nthOccurrence(r, 2)).toBe('2026-03-31');
    expect(nthOccurrence(r, 3)).toBe('2026-04-30');
    expect(nthOccurrence(r, 4)).toBe('2026-05-31');
  });

  it('handles a leap year', () => {
    const r = rule({ anchorDate: '2028-01-31' });
    expect(nthOccurrence(r, 1)).toBe('2028-02-29');
  });

  it('steps weekly, staying on the same weekday', () => {
    const r = rule({ frequency: 'weekly', anchorDate: '2026-01-05' }); // a Monday
    expect(nthOccurrence(r, 1)).toBe('2026-01-12');
    expect(nthOccurrence(r, 5)).toBe('2026-02-09');
  });

  it('steps yearly', () => {
    const r = rule({ frequency: 'yearly', anchorDate: '2026-03-03' });
    expect(nthOccurrence(r, 1)).toBe('2027-03-03');
    expect(nthOccurrence(r, 2)).toBe('2028-03-03');
  });
});

describe('dueOccurrences', () => {
  it('lists every occurrence up to today when nothing has been resolved', () => {
    expect(dueOccurrences(rule(), '2026-03-10')).toEqual(['2026-01-03', '2026-02-03', '2026-03-03']);
  });

  it('includes an occurrence falling exactly on today', () => {
    expect(dueOccurrences(rule(), '2026-01-03')).toEqual(['2026-01-03']);
  });

  it('returns nothing before the anchor', () => {
    expect(dueOccurrences(rule(), '2025-12-31')).toEqual([]);
  });

  it('excludes anything already posted or skipped', () => {
    // lastResolved is the guarantee that a skipped month does not come back.
    expect(dueOccurrences(rule({ lastResolved: '2026-02-03' }), '2026-04-10'))
      .toEqual(['2026-03-03', '2026-04-03']);
  });

  it('returns nothing when everything is resolved', () => {
    expect(dueOccurrences(rule({ lastResolved: '2026-03-03' }), '2026-03-10')).toEqual([]);
  });

  it('ignores a paused rule', () => {
    expect(dueOccurrences(rule({ active: false }), '2026-06-01')).toEqual([]);
  });

  it('caps a long-dormant rule instead of producing hundreds of rows', () => {
    const weekly = rule({ frequency: 'weekly', anchorDate: '2020-01-06' });
    const due = dueOccurrences(weekly, '2026-01-06');
    expect(due).toHaveLength(MAX_PENDING);
    expect(due[0]).toBe('2020-01-06');
  });

  it('is fast for a rule running for years', () => {
    const weekly = rule({ frequency: 'weekly', anchorDate: '2015-01-05', lastResolved: '2025-12-29' });
    const started = performance.now();
    const due = dueOccurrences(weekly, '2026-02-02');
    expect(due).toEqual(['2026-01-05', '2026-01-12', '2026-01-19', '2026-01-26', '2026-02-02']);
    expect(performance.now() - started).toBeLessThan(50);
  });
});

describe('nextOccurrence', () => {
  it('finds the next future date', () => {
    expect(nextOccurrence(rule(), '2026-03-10')).toBe('2026-04-03');
  });

  it('looks past an already-resolved occurrence', () => {
    expect(nextOccurrence(rule({ lastResolved: '2026-04-03' }), '2026-03-10')).toBe('2026-05-03');
  });

  it('returns nothing for a paused rule', () => {
    expect(nextOccurrence(rule({ active: false }), '2026-03-10')).toBeNull();
  });
});

describe('dueList', () => {
  it('flattens every rule into one row per occurrence, oldest first', () => {
    const state = {
      recurring: [
        rule({ id: 'rent', anchorDate: '2026-01-03' }),
        rule({ id: 'phone', anchorDate: '2026-01-20', amount: 50, category: 'subscriptions' }),
      ],
    };
    const list = dueList(state, '2026-02-10');
    expect(list.map((i) => i.date)).toEqual(['2026-01-03', '2026-01-20', '2026-02-03']);
    expect(list.map((i) => i.rule.id)).toEqual(['rent', 'phone', 'rent']);
    // Keys must be unique so React and the resolve action can address each row.
    expect(new Set(list.map((i) => i.key)).size).toBe(3);
  });

  it('is empty-safe', () => {
    expect(dueList({}, '2026-02-10')).toEqual([]);
    expect(dueList({ recurring: [] }, '2026-02-10')).toEqual([]);
  });
});

describe('dueTotals', () => {
  it('splits pending value by kind', () => {
    const items = [
      { rule: rule({ kind: 'expense', amount: 1000 }) },
      { rule: rule({ kind: 'earning', amount: 5000 }) },
      { rule: rule({ kind: 'saving', amount: 500 }) },
    ];
    expect(dueTotals(items)).toEqual({ earning: 5000, expense: 1000, saving: 500, count: 3 });
  });
});

describe('describeRule', () => {
  it('describes each frequency in words', () => {
    expect(describeRule(rule({ anchorDate: '2026-01-03' }))).toBe('Monthly on the 3rd');
    expect(describeRule(rule({ anchorDate: '2026-01-01' }))).toBe('Monthly on the 1st');
    expect(describeRule(rule({ anchorDate: '2026-01-02' }))).toBe('Monthly on the 2nd');
    expect(describeRule(rule({ anchorDate: '2026-01-22' }))).toBe('Monthly on the 22nd');
    expect(describeRule(rule({ frequency: 'weekly', anchorDate: '2026-01-05' }))).toMatch(/^Weekly on/);
    expect(describeRule(rule({ frequency: 'yearly', anchorDate: '2026-03-03' }))).toMatch(/^Yearly on/);
  });

  it('gets the 11th to 13th right', () => {
    // The naive last-digit rule produces "11st", "12nd", "13rd".
    expect(describeRule(rule({ anchorDate: '2026-01-11' }))).toBe('Monthly on the 11th');
    expect(describeRule(rule({ anchorDate: '2026-01-12' }))).toBe('Monthly on the 12th');
    expect(describeRule(rule({ anchorDate: '2026-01-13' }))).toBe('Monthly on the 13th');
  });
});

describe('entryFromRule', () => {
  it('carries the template onto the chosen date', () => {
    expect(entryFromRule(rule({ note: 'Flat' }), '2026-05-03')).toEqual({
      date: '2026-05-03', kind: 'expense', category: 'housing',
      title: 'Rent', note: 'Flat', amount: 1000,
    });
  });
});
