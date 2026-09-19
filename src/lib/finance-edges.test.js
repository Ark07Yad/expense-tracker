/**
 * The engine on awkward input.
 *
 * Written after a bug: withdrawing more from savings than was ever recorded
 * going in drove the pot negative, and since "free to spend" is balance minus
 * pot, the app reported more spendable money than the ledger contained.
 */
import { describe, expect, it } from 'vitest';
import { balanceAt, budgetForPeriod, computeFinance, netWorthOf, totalsOf } from './useFinance';
import { periodRange } from './calc';
import { seedState } from '../test/render';

let n = 0;
const e = (date, kind, amount, category = 'dining') => ({
  id: `p${n++}`, date, kind, category, title: 't', note: '', amount, createdAt: n,
});

describe('the finance engine under pressure', () => {
  it('counts an entry that falls exactly on a period edge, once', () => {
    const range = periodRange('month', 0, { anchor: '2026-09-20' });
    const state = seedState({ entries: [e(range.start, 'expense', 100), e(range.end, 'expense', 200)] });
    const f = computeFinance(state, 'month', 0, '2026-09-20');
    expect(f.totals.expense).toBe(300);
    expect(f.totals.count).toBe(2);
  });

  it('never loses money between the day series and the totals', () => {
    const state = seedState({
      entries: ['2026-09-01', '2026-09-15', '2026-09-20'].flatMap((d) => [e(d, 'expense', 111), e(d, 'earning', 222)]),
    });
    for (const period of ['week', 'month', 'quarter', 'year']) {
      const f = computeFinance(state, period, 0, '2026-09-20');
      const fromSeries = f.series.reduce((s, row) => s + (row.expense || 0), 0);
      expect(fromSeries, period).toBe(f.totals.expense);
    }
  });

  it('scales a monthly cap to the period without inventing money', () => {
    const month = periodRange('month', 0, { anchor: '2026-09-20' });
    const week = periodRange('week', 0, { anchor: '2026-09-20' });
    const year = periodRange('year', 0, { anchor: '2026-09-20' });
    expect(budgetForPeriod(3000, 'month', month)).toBe(3000);
    expect(budgetForPeriod(3000, 'year', year)).toBeCloseTo(36000, 0);
    const weekly = budgetForPeriod(3000, 'week', week);
    expect(weekly).toBeGreaterThan(0);
    expect(weekly).toBeLessThan(3000);
  });

  it('keeps the savings pot from going negative when more is taken out than put in', () => {
    const entries = [
      e('2026-09-01', 'earning', 5000),
      e('2026-09-02', 'saving', 500),
      e('2026-09-03', 'withdrawal', 900),
    ];
    const led = balanceAt(entries, '2026-09-20', { balance: 0, savings: 0 });
    expect(led.pot).toBeGreaterThanOrEqual(0);
    expect(led.balance).toBe(5000);
    expect(led.spendable).toBeLessThanOrEqual(led.balance);
    expect(Number.isFinite(led.spendable)).toBe(true);
  });

  it('values net worth at the month asked for, not always today', () => {
    const state = seedState({
      entries: [e('2026-07-01', 'earning', 1000)],
      assets: [{ id: 'a', name: 'F', class: 'fund', note: '', createdAt: 1, history: { '2026-07': { contributed: 0, value: 100 }, '2026-09': { contributed: 0, value: 900 } } }],
    });
    const july = netWorthOf(state, '2026-07-31');
    const sept = netWorthOf(state, '2026-09-30');
    expect(july.investments).toBe(100);
    expect(sept.investments).toBe(900);
    expect(july.netWorth).toBeLessThan(sept.netWorth);
  });

  it('does not produce NaN from junk amounts', () => {
    const junk = [
      { id: 'x1', date: '2026-09-02', kind: 'expense', category: 'dining', title: '', note: '', amount: '120.50', createdAt: 1 },
      { id: 'x2', date: '2026-09-03', kind: 'expense', category: 'dining', title: '', note: '', amount: null, createdAt: 2 },
      { id: 'x3', date: '2026-09-04', kind: 'earning', category: 'salary', title: '', note: '', amount: 'abc', createdAt: 3 },
      { id: 'x4', date: '2026-09-05', kind: 'expense', category: 'dining', title: '', note: '', amount: -50, createdAt: 4 },
    ];
    const t = totalsOf(junk);
    for (const [k, v] of Object.entries(t)) {
      if (typeof v === 'number') expect(Number.isFinite(v), `${k} = ${v}`).toBe(true);
    }
    const f = computeFinance(seedState({ entries: junk }), 'month', 0, '2026-09-20');
    expect(Number.isFinite(f.totals.expense)).toBe(true);
    expect(Number.isFinite(f.dailyBurn)).toBe(true);
    expect(Number.isFinite(f.projectedExpense)).toBe(true);
  });
});
