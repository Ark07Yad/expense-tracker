/**
 * The date and period engine.
 *
 * Every screen resolves its range through these functions, so a boundary bug
 * here shows up as four views quietly disagreeing about the same month. The
 * cases that earn their place are the ones that are easy to get wrong and
 * silent when wrong: month-end clamping, quarter clipping, DST, and the
 * divide-by-zero paths in the comparison helpers.
 */

import { describe, expect, it } from 'vitest';
import {
  addDays, addMonthKeys, addMonths, bucketsOf, clamp, dayLabel, daysBetween,
  daysInMonth, formatMoney, formatPercent, keyOf, monthKey, parseKey,
  pctChange, periodLabel, periodProgress, periodRange, rangeContains,
  rangeDays, startOfWeek, sum,
} from './calc';

describe('day keys', () => {
  it('round-trips a key through parse and back', () => {
    expect(keyOf(parseKey('2026-08-30'))).toBe('2026-08-30');
  });

  it('parses at local noon, so a DST shift cannot roll the date back', () => {
    // Constructed at midnight, a date in a DST-transition week can land on the
    // previous day once the clock moves. Noon leaves 12 hours of headroom.
    expect(parseKey('2026-03-29').getHours()).toBe(12);
    expect(parseKey('2026-10-25').getHours()).toBe(12);
  });

  it('crosses a spring-forward boundary without losing a day', () => {
    // Europe/Dublin springs forward on 29 March 2026.
    const days = [];
    for (let k = '2026-03-27'; k <= '2026-03-31'; k = addDays(k, 1)) days.push(k);
    expect(days).toEqual(['2026-03-27', '2026-03-28', '2026-03-29', '2026-03-30', '2026-03-31']);
  });

  it('crosses a fall-back boundary without repeating a day', () => {
    const days = [];
    for (let k = '2026-10-24'; k <= '2026-10-27'; k = addDays(k, 1)) days.push(k);
    expect(days).toEqual(['2026-10-24', '2026-10-25', '2026-10-26', '2026-10-27']);
  });

  it('adds days across a year boundary', () => {
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2027-01-01', -1)).toBe('2026-12-31');
  });

  it('counts days between, signed', () => {
    expect(daysBetween('2026-08-01', '2026-08-31')).toBe(30);
    expect(daysBetween('2026-08-31', '2026-08-01')).toBe(-30);
    expect(daysBetween('2026-08-01', '2026-08-01')).toBe(0);
  });

  it('clamps a month-end date rather than overflowing into the next month', () => {
    // The classic: 31 Jan + 1 month must be 28/29 Feb, not 2/3 March.
    expect(addMonths('2026-01-31', 1)).toBe('2026-02-28');
    expect(addMonths('2028-01-31', 1)).toBe('2028-02-29'); // leap year
    expect(addMonths('2026-03-31', -1)).toBe('2026-02-28');
    expect(addMonths('2026-05-31', 1)).toBe('2026-06-30');
  });

  it('knows how long each month is', () => {
    expect(daysInMonth(2026, 1)).toBe(28); // Feb 2026
    expect(daysInMonth(2028, 1)).toBe(29); // Feb 2028, leap
    expect(daysInMonth(2026, 3)).toBe(30); // April
  });

  it('steps month keys across a year boundary', () => {
    expect(addMonthKeys('2026-01', -1)).toBe('2025-12');
    expect(addMonthKeys('2026-12', 1)).toBe('2027-01');
    expect(monthKey('2026-08-30')).toBe('2026-08');
  });
});

describe('startOfWeek', () => {
  it('honours a Monday start', () => {
    // 2026-08-30 is a Sunday.
    expect(startOfWeek('2026-08-30', 1)).toBe('2026-08-24');
    expect(startOfWeek('2026-08-24', 1)).toBe('2026-08-24');
  });

  it('honours a Sunday start', () => {
    expect(startOfWeek('2026-08-30', 0)).toBe('2026-08-30');
    expect(startOfWeek('2026-08-29', 0)).toBe('2026-08-23');
  });
});

describe('periodRange', () => {
  const at = (anchor) => ({ anchor, weekStart: 1 });

  it('resolves a week Monday to Sunday', () => {
    expect(periodRange('week', 0, at('2026-08-30'))).toEqual({ start: '2026-08-24', end: '2026-08-30' });
  });

  it('resolves a month to its real first and last day', () => {
    expect(periodRange('month', 0, at('2026-02-15'))).toEqual({ start: '2026-02-01', end: '2026-02-28' });
    expect(periodRange('month', 0, at('2028-02-15'))).toEqual({ start: '2028-02-01', end: '2028-02-29' });
  });

  it('resolves a quarter', () => {
    expect(periodRange('quarter', 0, at('2026-08-30'))).toEqual({ start: '2026-07-01', end: '2026-09-30' });
    expect(periodRange('quarter', 0, at('2026-01-05'))).toEqual({ start: '2026-01-01', end: '2026-03-31' });
  });

  it('resolves a year', () => {
    expect(periodRange('year', 0, at('2026-08-30'))).toEqual({ start: '2026-01-01', end: '2026-12-31' });
  });

  it('steps backwards across year boundaries', () => {
    expect(periodRange('month', -8, at('2026-08-30'))).toEqual({ start: '2025-12-01', end: '2025-12-31' });
    expect(periodRange('quarter', -3, at('2026-08-30'))).toEqual({ start: '2025-10-01', end: '2025-12-31' });
    expect(periodRange('year', -1, at('2026-08-30'))).toEqual({ start: '2025-01-01', end: '2025-12-31' });
  });

  it('steps a month back from the 31st without skipping February', () => {
    // Anchored on a 31st, naive month arithmetic skips short months entirely.
    expect(periodRange('month', -1, at('2026-03-31'))).toEqual({ start: '2026-02-01', end: '2026-02-28' });
  });
});

describe('bucketsOf', () => {
  const opts = { weekStart: 1 };

  it('buckets a week into seven days', () => {
    const range = periodRange('week', 0, { anchor: '2026-08-30', weekStart: 1 });
    const b = bucketsOf('week', range, opts);
    expect(b).toHaveLength(7);
    expect(b[0].start).toBe('2026-08-24');
    expect(b[6].end).toBe('2026-08-30');
  });

  it('buckets a month into one bucket per real day', () => {
    expect(bucketsOf('month', periodRange('month', 0, { anchor: '2026-02-10' }), opts)).toHaveLength(28);
    expect(bucketsOf('month', periodRange('month', 0, { anchor: '2026-08-10' }), opts)).toHaveLength(31);
  });

  it('buckets a year into twelve months', () => {
    const b = bucketsOf('year', periodRange('year', 0, { anchor: '2026-08-30' }), opts);
    expect(b).toHaveLength(12);
    expect(b[0].start).toBe('2026-01-01');
    expect(b[11].end).toBe('2026-12-31');
  });

  it('clips quarter weeks to the quarter so the bars sum to the total', () => {
    // This is the property that matters: if the first and last weeks spilled
    // outside the quarter, the sum of the bars would not equal the headline.
    const range = periodRange('quarter', 0, { anchor: '2026-08-30' });
    const b = bucketsOf('quarter', range, opts);
    expect(b[0].start).toBe(range.start);
    expect(b[b.length - 1].end).toBe(range.end);

    // Contiguous, non-overlapping, and covering exactly the range.
    for (let i = 1; i < b.length; i++) expect(b[i].start).toBe(addDays(b[i - 1].end, 1));
    const covered = b.reduce((n, x) => n + daysBetween(x.start, x.end) + 1, 0);
    expect(covered).toBe(rangeDays(range));
  });

  it('covers every day exactly once for all four periods', () => {
    for (const period of ['week', 'month', 'quarter', 'year']) {
      const range = periodRange(period, 0, { anchor: '2026-08-30', weekStart: 1 });
      const b = bucketsOf(period, range, opts);
      const covered = b.reduce((n, x) => n + daysBetween(x.start, x.end) + 1, 0);
      expect(covered, `${period} bucket coverage`).toBe(rangeDays(range));
    }
  });
});

describe('periodProgress', () => {
  const range = { start: '2026-08-01', end: '2026-08-31' };

  it('is 0 before the range and 1 after it', () => {
    expect(periodProgress(range, '2026-07-31')).toBe(0);
    expect(periodProgress(range, '2026-09-01')).toBe(1);
  });

  it('counts the current day as elapsed', () => {
    // On the 1st of a 31-day month, one day of 31 has begun.
    expect(periodProgress(range, '2026-08-01')).toBeCloseTo(1 / 31, 5);
    expect(periodProgress(range, '2026-08-31')).toBe(1);
    expect(periodProgress(range, '2026-08-16')).toBeCloseTo(16 / 31, 5);
  });
});

describe('range helpers', () => {
  const range = { start: '2026-08-01', end: '2026-08-31' };

  it('tests containment on the boundaries', () => {
    expect(rangeContains(range, '2026-08-01')).toBe(true);
    expect(rangeContains(range, '2026-08-31')).toBe(true);
    expect(rangeContains(range, '2026-07-31')).toBe(false);
    expect(rangeContains(range, '2026-09-01')).toBe(false);
  });

  it('counts days inclusively', () => {
    expect(rangeDays(range)).toBe(31);
    expect(rangeDays({ start: '2026-08-01', end: '2026-08-01' })).toBe(1);
  });
});

describe('pctChange', () => {
  it('reports a normal ratio', () => {
    expect(pctChange(150, 100)).toEqual({ pct: 50, kind: 'ratio' });
    expect(pctChange(50, 100)).toEqual({ pct: -50, kind: 'ratio' });
  });

  it('calls something-from-nothing "new" rather than infinity', () => {
    // The whole point: 0 -> 500 is not "infinity percent", it is new.
    expect(pctChange(500, 0)).toEqual({ pct: null, kind: 'new' });
  });

  it('calls nothing-from-nothing flat', () => {
    expect(pctChange(0, 0)).toEqual({ pct: 0, kind: 'flat' });
  });

  it('uses the magnitude of the previous value, so a negative base behaves', () => {
    expect(pctChange(-50, -100).pct).toBe(50);
  });
});

describe('formatMoney', () => {
  it('formats each currency in its own locale', () => {
    expect(formatMoney(1204, 'INR')).toBe('₹1,204');
    expect(formatMoney(1204, 'USD')).toBe('$1,204');
    expect(formatMoney(1204, 'GBP')).toBe('£1,204');
  });

  it('groups Indian amounts in lakhs, not thousands', () => {
    expect(formatMoney(125000, 'INR')).toBe('₹1,25,000');
  });

  it('abbreviates compactly in the local convention', () => {
    expect(formatMoney(125000, 'INR', { compact: true })).toBe('₹1.3L');
    expect(formatMoney(2500000, 'INR', { compact: true })).toBe('₹25L');
    expect(formatMoney(125000, 'USD', { compact: true })).toBe('$125K');
  });

  it('shows decimals only below 100, where they carry real precision', () => {
    expect(formatMoney(45.5, 'USD')).toBe('$45.50');
    expect(formatMoney(1204.5, 'USD')).toBe('$1,205');
  });

  it('renders a negative with a real minus sign, not a hyphen', () => {
    expect(formatMoney(-45.5, 'USD')).toBe('−$45.50');
  });

  it('signs a positive only when asked', () => {
    expect(formatMoney(100, 'USD', { sign: true })).toBe('+$100');
    expect(formatMoney(-100, 'USD', { sign: true })).toBe('−$100');
    expect(formatMoney(0, 'USD', { sign: true })).toBe('$0');
  });

  it('falls back rather than throwing on an unknown currency', () => {
    expect(() => formatMoney(100, 'NOPE')).not.toThrow();
  });

  it('treats junk as zero', () => {
    expect(formatMoney(undefined, 'USD')).toBe('$0');
    expect(formatMoney(NaN, 'USD')).toBe('$0');
    expect(formatMoney(null, 'USD')).toBe('$0');
  });
});

describe('misc helpers', () => {
  it('labels today, yesterday and tomorrow by name', () => {
    expect(dayLabel('2026-08-30', '2026-08-30')).toBe('Today');
    expect(dayLabel('2026-08-29', '2026-08-30')).toBe('Yesterday');
    expect(dayLabel('2026-08-31', '2026-08-30')).toBe('Tomorrow');
    expect(dayLabel('2026-08-20', '2026-08-30')).not.toMatch(/Today|Yesterday/);
  });

  it('formats percentages', () => {
    expect(formatPercent(12.34)).toBe('12%');
    expect(formatPercent(12.34, 1)).toBe('12.3%');
  });

  it('clamps', () => {
    expect(clamp(5, 0, 10)).toBe(5);
    expect(clamp(-5, 0, 10)).toBe(0);
    expect(clamp(50, 0, 10)).toBe(10);
  });

  it('sums with a picker and ignores junk', () => {
    expect(sum([1, 2, 3])).toBe(6);
    expect(sum([{ v: 1 }, { v: 2 }], (x) => x.v)).toBe(3);
    expect(sum([{ v: 'x' }, { v: 2 }], (x) => x.v)).toBe(2);
  });

  it('labels a period readably', () => {
    const q = periodRange('quarter', 0, { anchor: '2026-08-30' });
    expect(periodLabel('quarter', q)).toContain('Q3 2026');
    expect(periodLabel('year', periodRange('year', 0, { anchor: '2026-08-30' }))).toBe('2026');
  });
});
