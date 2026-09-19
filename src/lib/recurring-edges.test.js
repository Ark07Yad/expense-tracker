/**
 * Schedules across month ends, leap days and DST — the cases where "add a
 * month" quietly means something different from what a person expects.
 */
import { describe, expect, it } from 'vitest';
import { MAX_PENDING, dueOccurrences, entryFromRule, nextOccurrence, nthOccurrence } from './recurring';

const rule = (over = {}) => ({
  id: 'r', kind: 'expense', category: 'housing', title: 'Rent', note: '', amount: 1000,
  frequency: 'monthly', anchorDate: '2026-01-31', lastResolved: null, active: true, createdAt: 1, ...over,
});

describe('recurring rules under pressure', () => {
  it('never skips a month for a rule anchored on the 31st', () => {
    const months = [];
    for (let i = 0; i < 14; i++) months.push(nthOccurrence(rule(), i));
    const keys = months.map((d) => d.slice(0, 7));
    expect(new Set(keys).size, `one per month, got ${keys.join(',')}`).toBe(14);
    expect(keys[1]).toBe('2026-02');
    expect(months[1]).toBe('2026-02-28');
  });

  it('handles a yearly rule anchored on 29 February', () => {
    const leap = rule({ frequency: 'yearly', anchorDate: '2024-02-29' });
    expect(nthOccurrence(leap, 1)).toBe('2025-02-28');
    expect(nthOccurrence(leap, 4)).toBe('2028-02-29');
  });

  it('keeps weekly rules exactly seven days apart across a DST change', () => {
    const weekly = rule({ frequency: 'weekly', anchorDate: '2026-03-22' });
    expect(nthOccurrence(weekly, 1)).toBe('2026-03-29');
    expect(nthOccurrence(weekly, 2)).toBe('2026-04-05');
  });

  it('caps how many occurrences can pile up, and never returns a future one', () => {
    const old = rule({ frequency: 'weekly', anchorDate: '2020-01-01' });
    const due = dueOccurrences(old, '2026-09-20');
    expect(due.length).toBeLessThanOrEqual(MAX_PENDING);
    for (const date of due) expect(date <= '2026-09-20', date).toBe(true);
  });

  it('offers nothing before the anchor, and the anchor itself on the day', () => {
    const future = rule({ anchorDate: '2026-12-01' });
    expect(dueOccurrences(future, '2026-09-20')).toEqual([]);
    expect(nextOccurrence(future, '2026-09-20')).toBe('2026-12-01');
    expect(dueOccurrences(rule({ anchorDate: '2026-09-20' }), '2026-09-20')).toEqual(['2026-09-20']);
  });

  it('does not re-offer what was already resolved', () => {
    const resolved = rule({ anchorDate: '2026-06-15', lastResolved: '2026-08-15' });
    const due = dueOccurrences(resolved, '2026-09-20');
    for (const date of due) expect(date > '2026-08-15', date).toBe(true);
  });

  it('builds the entry template for a date', () => {
    // Deliberately no id and no debt/goal tag: this is the preview shape, and
    // the reducer is what mints the id and carries the tags through.
    expect(entryFromRule(rule(), '2026-09-01')).toEqual({
      date: '2026-09-01', kind: 'expense', category: 'housing', title: 'Rent', note: '', amount: 1000,
    });
  });
});
