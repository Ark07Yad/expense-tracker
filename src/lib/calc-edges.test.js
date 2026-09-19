/**
 * Dates where date libraries usually go wrong: month ends, DST, week starts,
 * year boundaries. All of this was already correct — kept so it stays that way.
 */
import { describe, expect, it } from 'vitest';
import {
  addDays, addMonthKeys, addMonths, daysBetween, formatMoney, parseKey, periodProgress,
  periodRange, previousRange, rangeDays, startOfWeek,
} from './calc';

describe('dates under pressure', () => {
  it('clamps a month-end date rather than overflowing into the next month', () => {
    expect(addMonths('2026-01-31', 1)).toBe('2026-02-28');
    expect(addMonths('2024-01-31', 1)).toBe('2024-02-29');
    expect(addMonths('2026-03-31', -1)).toBe('2026-02-28');
    expect(addMonths('2026-08-31', 1)).toBe('2026-09-30');
  });

  it('keeps one day meaning one day across a DST change', () => {
    // Europe/Dublin springs forward 29 Mar 2026 and falls back 25 Oct 2026.
    for (const [from, to] of [['2026-03-28', '2026-03-29'], ['2026-03-29', '2026-03-30'], ['2026-10-24', '2026-10-25'], ['2026-10-25', '2026-10-26']]) {
      expect(addDays(from, 1), `${from} + 1`).toBe(to);
      expect(daysBetween(from, to), `${from} → ${to}`).toBe(1);
    }
  });

  it('rolls month keys across a year boundary', () => {
    expect(addMonthKeys('2026-01', -1)).toBe('2025-12');
    expect(addMonthKeys('2026-12', 1)).toBe('2027-01');
    expect(addMonthKeys('2026-06', -18)).toBe('2024-12');
  });

  it('starts the week on the day the profile asks for', () => {
    // 2026-09-20 is a Sunday.
    expect(startOfWeek('2026-09-20', 1)).toBe('2026-09-14');
    expect(startOfWeek('2026-09-20', 0)).toBe('2026-09-20');
    expect(startOfWeek('2026-09-19', 0)).toBe('2026-09-13');
  });

  it('gives every period a sane range, and a previous one of the same length', () => {
    for (const period of ['week', 'month', 'quarter', 'year']) {
      for (const offset of [0, -1, -5, 1]) {
        const range = periodRange(period, offset, { anchor: '2026-09-20', weekStart: 1 });
        expect(range.start <= range.end, `${period} ${offset}`).toBe(true);
        expect(rangeDays(range), `${period} ${offset}`).toBeGreaterThan(0);
        expect(parseKey(range.start), `${period} ${offset}`).toBeInstanceOf(Date);

        const prev = previousRange(period, offset, { anchor: '2026-09-20', weekStart: 1 });
        expect(prev.end < range.start, `${period} ${offset} previous must not overlap`).toBe(true);
        // Only week and month are fixed-length; quarters and years vary by days.
        if (period === 'week') expect(rangeDays(prev)).toBe(rangeDays(range));
      }
    }
  });

  it('keeps progress between 0 and 1, including a future period', () => {
    for (const period of ['week', 'month', 'quarter', 'year']) {
      for (const offset of [-3, 0, 3]) {
        const p = periodProgress(periodRange(period, offset, { anchor: '2026-09-20' }), '2026-09-20');
        expect(p, `${period} ${offset}`).toBeGreaterThanOrEqual(0);
        expect(p, `${period} ${offset}`).toBeLessThanOrEqual(1);
      }
    }
  });

  it('formats money without lying about the amount', () => {
    expect(formatMoney(0, 'EUR')).toMatch(/0/);
    expect(formatMoney(-1234.56, 'INR')).toMatch(/1,235|1,234/);
    expect(formatMoney(1e12, 'USD', { compact: true })).toMatch(/T|1,000,000,000,000/);
    for (const bad of [NaN, Infinity, -Infinity, null, undefined, 'abc']) {
      expect(formatMoney(bad, 'EUR'), String(bad)).not.toMatch(/NaN|Infinity/);
    }
  });
});
