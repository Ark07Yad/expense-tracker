/**
 * The aggregation engine.
 *
 * These are the numbers every screen and the advisor read, so the tests lean on
 * *properties* rather than golden values where they can: the buckets must sum to
 * the headline, a category that vanished must still count as a movement, and a
 * holding nobody revalued must not drag net worth to zero.
 *
 * Ledger fixtures are anchored in 2020 so the period is always in the past and
 * `periodProgress` is a settled 1 — otherwise the expected numbers would drift
 * with the real clock. Investment fixtures are anchored relative to the current
 * month, because carry-forward is defined against "now".
 */

import { describe, expect, it } from 'vitest';
import {
  budgetForPeriod, budgetLines, byCategory, computeFinance, computeInvestments,
  entriesInRange, movers, seriesOf, totalsOf,
} from './useFinance';
import { addMonthKeys, monthKey, todayKey } from './calc';

let seq = 0;
const entry = (date, kind, category, amount, title = 't') => ({
  id: `e${seq++}`, date, kind, category, title, note: '', amount, createdAt: seq,
});

const baseState = (over = {}) => ({
  version: 1, onboarded: true, theme: 'dark',
  profile: {
    name: '', currency: 'INR', weekStart: 1, monthlyIncome: 0,
    savingsTargetPct: 20, budgets: {}, ...over.profile,
  },
  entries: over.entries || [],
  assets: over.assets || [],
  notes: [], dismissed: [],
});

describe('totalsOf', () => {
  it('splits the three kinds and treats savings as money that has left', () => {
    const t = totalsOf([
      entry('2020-06-01', 'earning', 'salary', 1000),
      entry('2020-06-02', 'expense', 'dining', 300),
      entry('2020-06-03', 'saving', 'emergency', 200),
    ]);
    expect(t.earning).toBe(1000);
    expect(t.expense).toBe(300);
    expect(t.saving).toBe(200);
    // Net is what is genuinely unallocated: savings are committed, not spare.
    expect(t.net).toBe(500);
    expect(t.outflow).toBe(500);
    expect(t.count).toBe(3);
  });

  it('counts both deliberate savings and the leftover in the savings rate', () => {
    const t = totalsOf([
      entry('2020-06-01', 'earning', 'salary', 1000),
      entry('2020-06-02', 'expense', 'dining', 300),
      entry('2020-06-03', 'saving', 'emergency', 200),
    ]);
    expect(t.savingsRate).toBe(70); // (200 saved + 500 left) / 1000
  });

  it('does not divide by zero when nothing came in', () => {
    const t = totalsOf([entry('2020-06-02', 'expense', 'dining', 300)]);
    expect(t.savingsRate).toBe(0);
    expect(t.net).toBe(-300);
  });

  it('takes the magnitude of an amount, whatever sign it was stored with', () => {
    expect(totalsOf([entry('2020-06-01', 'expense', 'dining', -50)]).expense).toBe(50);
  });

  it('is empty-safe', () => {
    expect(totalsOf([])).toMatchObject({ earning: 0, expense: 0, saving: 0, net: 0, count: 0 });
  });
});

describe('entriesInRange', () => {
  const entries = [
    entry('2020-05-31', 'expense', 'dining', 1),
    entry('2020-06-01', 'expense', 'dining', 2),
    entry('2020-06-30', 'expense', 'dining', 3),
    entry('2020-07-01', 'expense', 'dining', 4),
  ];
  it('includes both boundary days and excludes the neighbours', () => {
    const got = entriesInRange(entries, { start: '2020-06-01', end: '2020-06-30' });
    expect(got.map((e) => e.amount)).toEqual([2, 3]);
  });
});

describe('byCategory', () => {
  const entries = [
    entry('2020-06-01', 'expense', 'dining', 100),
    entry('2020-06-02', 'expense', 'dining', 300),
    entry('2020-06-03', 'expense', 'housing', 600),
    entry('2020-06-04', 'earning', 'salary', 5000),
  ];

  it('groups, totals and sorts largest first', () => {
    const rows = byCategory(entries, 'expense');
    expect(rows.map((r) => r.id)).toEqual(['housing', 'dining']);
    expect(rows[0].total).toBe(600);
    expect(rows[1].total).toBe(400);
  });

  it('computes share against the kind total, not the whole ledger', () => {
    const rows = byCategory(entries, 'expense');
    // 1000 of expense; the 5000 salary must not dilute the shares.
    expect(rows[0].share).toBe(60);
    expect(rows[1].share).toBe(40);
  });

  it('averages per entry', () => {
    const dining = byCategory(entries, 'expense').find((r) => r.id === 'dining');
    expect(dining.count).toBe(2);
    expect(dining.avg).toBe(200);
  });

  it('labels an unknown category rather than returning undefined', () => {
    const rows = byCategory([entry('2020-06-01', 'expense', 'no-such-cat', 10)], 'expense');
    expect(rows[0].label).toBe('Uncategorised');
    expect(rows[0].color).toBeTruthy();
  });
});

describe('seriesOf', () => {
  const range = { start: '2020-06-01', end: '2020-06-30' };
  const entries = [
    entry('2020-06-01', 'earning', 'salary', 1000),
    entry('2020-06-01', 'expense', 'dining', 100),
    entry('2020-06-15', 'expense', 'dining', 200),
    entry('2020-06-30', 'saving', 'emergency', 50),
  ];

  it('sums to the same totals as the period headline', () => {
    // The property that matters: bars and headline must never disagree.
    const s = seriesOf('month', range, entries);
    const t = totalsOf(entries);
    expect(s.reduce((n, r) => n + r.earning, 0)).toBe(t.earning);
    expect(s.reduce((n, r) => n + r.expense, 0)).toBe(t.expense);
    expect(s.reduce((n, r) => n + r.saving, 0)).toBe(t.saving);
  });

  it('accumulates a running expense total', () => {
    const s = seriesOf('month', range, entries);
    expect(s[0].cumExpense).toBe(100);
    expect(s[14].cumExpense).toBe(300);
    expect(s[29].cumExpense).toBe(300);
  });

  it('mirrors outgoing amounts below the axis', () => {
    const s = seriesOf('month', range, entries);
    expect(s[0].expenseNeg).toBe(-100);
    expect(s[29].savingNeg).toBe(-50);
  });

  it('sums to the headline for a clipped quarter too', () => {
    const qRange = { start: '2020-07-01', end: '2020-09-30' };
    const qEntries = [
      entry('2020-07-01', 'expense', 'dining', 10),  // first, partial week
      entry('2020-08-15', 'expense', 'dining', 20),
      entry('2020-09-30', 'expense', 'dining', 30),  // last, partial week
    ];
    const s = seriesOf('quarter', qRange, qEntries);
    expect(s.reduce((n, r) => n + r.expense, 0)).toBe(60);
  });
});

describe('budgetForPeriod', () => {
  const month = { start: '2020-06-01', end: '2020-06-30' };
  const week = { start: '2020-06-01', end: '2020-06-07' };

  it('passes a monthly cap through unchanged for a month', () => {
    expect(budgetForPeriod(1000, 'month', month)).toBe(1000);
  });

  it('multiplies exactly for quarter and year', () => {
    expect(budgetForPeriod(1000, 'quarter', month)).toBe(3000);
    expect(budgetForPeriod(1000, 'year', month)).toBe(12000);
  });

  it('pro-rates a week', () => {
    expect(budgetForPeriod(1000, 'week', week)).toBeCloseTo((1000 * 7) / 30.4375, 5);
  });

  it('treats an absent cap as no cap', () => {
    expect(budgetForPeriod(undefined, 'month', month)).toBe(0);
    expect(budgetForPeriod(0, 'month', month)).toBe(0);
  });
});

describe('budgetLines', () => {
  const range = { start: '2020-06-01', end: '2020-06-30' };
  const build = (budgets, entries) =>
    budgetLines(baseState({ profile: { budgets } }), 'month', range, entries);

  it('flags a blown budget', () => {
    const lines = build({ dining: 100 }, [entry('2020-06-01', 'expense', 'dining', 150)]);
    const dining = lines.find((l) => l.id === 'dining');
    expect(dining.status).toBe('over');
    expect(dining.left).toBe(-50);
    expect(dining.pct).toBe(150);
  });

  it('flags a tight budget before it is blown', () => {
    const lines = build({ dining: 100 }, [entry('2020-06-01', 'expense', 'dining', 95)]);
    expect(lines.find((l) => l.id === 'dining').status).toBe('tight');
  });

  it('leaves a comfortable budget alone', () => {
    const lines = build({ dining: 100 }, [entry('2020-06-01', 'expense', 'dining', 20)]);
    expect(lines.find((l) => l.id === 'dining').status).toBe('ok');
  });

  it('marks spending with no cap as untracked rather than hiding it', () => {
    const lines = build({}, [entry('2020-06-01', 'expense', 'dining', 20)]);
    expect(lines.find((l) => l.id === 'dining').status).toBe('untracked');
  });

  it('omits categories with neither a cap nor any spending', () => {
    const lines = build({ dining: 100 }, []);
    expect(lines.some((l) => l.id === 'travel')).toBe(false);
  });

  it('sorts the ones needing attention to the top', () => {
    const lines = build(
      { dining: 100, housing: 1000, travel: 100 },
      [
        entry('2020-06-01', 'expense', 'dining', 150),   // over
        entry('2020-06-01', 'expense', 'housing', 100),  // ok
        entry('2020-06-01', 'expense', 'travel', 95),    // tight
      ]
    );
    expect(lines.map((l) => l.status).slice(0, 3)).toEqual(['over', 'tight', 'ok']);
  });
});

describe('movers', () => {
  it('reports growth and shrinkage against the previous period', () => {
    const now = byCategory([entry('2020-06-01', 'expense', 'dining', 300)], 'expense');
    const before = byCategory([entry('2020-05-01', 'expense', 'dining', 100)], 'expense');
    const [m] = movers(now, before);
    expect(m.id).toBe('dining');
    expect(m.delta).toBe(200);
    expect(m.change.pct).toBe(200);
  });

  it('still reports a category that disappeared entirely', () => {
    // A cost that stopped is a real movement, and usually the encouraging one.
    // Iterating only the current period would silently drop it.
    const now = byCategory([entry('2020-06-01', 'expense', 'dining', 100)], 'expense');
    const before = byCategory(
      [entry('2020-05-01', 'expense', 'dining', 100), entry('2020-05-02', 'expense', 'travel', 900)],
      'expense'
    );
    const rows = movers(now, before);
    const travel = rows.find((r) => r.id === 'travel');
    expect(travel).toBeDefined();
    expect(travel.total).toBe(0);
    expect(travel.delta).toBe(-900);
  });

  it('sorts by absolute movement and respects the limit', () => {
    const now = byCategory(
      [entry('2020-06-01', 'expense', 'dining', 200), entry('2020-06-01', 'expense', 'housing', 1000)],
      'expense'
    );
    const before = byCategory(
      [entry('2020-05-01', 'expense', 'dining', 100), entry('2020-05-01', 'expense', 'housing', 100)],
      'expense'
    );
    expect(movers(now, before, 1).map((r) => r.id)).toEqual(['housing']);
  });

  it('ignores noise', () => {
    const now = byCategory([entry('2020-06-01', 'expense', 'dining', 100)], 'expense');
    const before = byCategory([entry('2020-05-01', 'expense', 'dining', 100)], 'expense');
    expect(movers(now, before)).toHaveLength(0);
  });
});

describe('computeFinance', () => {
  const state = baseState({
    profile: { budgets: { dining: 500 } },
    entries: [
      entry('2020-06-01', 'earning', 'salary', 5000),
      entry('2020-06-10', 'expense', 'dining', 400),
      entry('2020-06-20', 'expense', 'housing', 1500),
      entry('2020-06-25', 'saving', 'emergency', 1000),
      entry('2020-05-10', 'expense', 'dining', 200),   // previous month
      entry('2020-07-01', 'expense', 'dining', 999),   // next month, must be excluded
    ],
  });
  const f = computeFinance(state, 'month', 0, '2020-06-15');

  it('confines itself to the period', () => {
    expect(f.range).toEqual({ start: '2020-06-01', end: '2020-06-30' });
    expect(f.totals.count).toBe(4);
    expect(f.totals.expense).toBe(1900);
  });

  it('compares against the equivalent previous period', () => {
    expect(f.prevRange).toEqual({ start: '2020-05-01', end: '2020-05-31' });
    expect(f.prevTotals.expense).toBe(200);
    expect(f.delta.expense.pct).toBe(850);
  });

  it('sorts entries newest first', () => {
    expect(f.entries[0].date).toBe('2020-06-25');
    expect(f.entries[f.entries.length - 1].date).toBe('2020-06-01');
  });

  it('finds the biggest single expense, ignoring larger income', () => {
    expect(f.biggest.amount).toBe(1500);
    expect(f.biggest.category).toBe('housing');
  });

  it('knows a past period is not the current one', () => {
    expect(f.isCurrent).toBe(false);
    expect(f.isFuture).toBe(false);
    expect(f.progress).toBe(1);
  });

  it('marks a future period as future', () => {
    const future = computeFinance(state, 'month', 12, todayKey());
    expect(future.isFuture).toBe(true);
    expect(future.totals.count).toBe(0);
  });

  it('survives a completely empty ledger', () => {
    const empty = computeFinance(baseState(), 'month', 0, '2020-06-15');
    expect(empty.totals.count).toBe(0);
    expect(empty.expenseCats).toEqual([]);
    expect(empty.movers).toEqual([]);
    expect(empty.biggest).toBeNull();
    expect(Number.isFinite(empty.dailyBurn)).toBe(true);
  });
});

describe('computeInvestments', () => {
  const nowM = monthKey(todayKey());
  const mk = (n) => addMonthKeys(nowM, n);

  const asset = (id, cls, history) => ({ id, name: id, class: cls, note: '', createdAt: 1, history });

  it('reports an empty portfolio without dividing by zero', () => {
    const inv = computeInvestments(baseState(), 12);
    expect(inv.empty).toBe(true);
    expect(inv.netWorth).toBe(0);
    expect(inv.gainPct).toBe(0);
  });

  it('separates what was paid in from what it is worth', () => {
    const state = baseState({
      assets: [asset('fund', 'fund', {
        [mk(-1)]: { contributed: 1000, value: 1000 },
        [mk(0)]: { contributed: 100, value: 1250 },
      })],
    });
    const inv = computeInvestments(state, 12);
    expect(inv.invested).toBe(1100);
    expect(inv.netWorth).toBe(1250);
    expect(inv.gain).toBe(150);
    expect(inv.contributedThisMonth).toBe(100);
  });

  it('carries a stale value forward instead of dropping it to zero', () => {
    // The alarming bug this prevents: a month where only one holding was
    // updated would otherwise show net worth collapsing to that holding.
    const state = baseState({
      assets: [
        asset('stale', 'equity', { [mk(-3)]: { contributed: 500, value: 500 } }),
        asset('fresh', 'fund', { [mk(0)]: { contributed: 200, value: 200 } }),
      ],
    });
    const inv = computeInvestments(state, 12);
    expect(inv.netWorth).toBe(700);
    const last = inv.series[inv.series.length - 1];
    expect(last.value).toBe(700);
  });

  it('flags holdings nobody has revalued', () => {
    const state = baseState({
      assets: [
        asset('stale', 'equity', { [mk(-3)]: { contributed: 500, value: 500 } }),
        asset('fresh', 'fund', { [mk(0)]: { contributed: 200, value: 200 } }),
      ],
    });
    const inv = computeInvestments(state, 12);
    expect(inv.staleAssets.map((a) => a.id)).toEqual(['stale']);
    expect(inv.rows.find((r) => r.id === 'stale').monthsStale).toBe(3);
  });

  it('treats a holding with no history at all as stale, not as a crash', () => {
    const inv = computeInvestments(baseState({ assets: [asset('empty', 'gold', {})] }), 12);
    expect(inv.rows[0].value).toBe(0);
    expect(inv.rows[0].lastMonth).toBeNull();
    expect(inv.staleAssets).toHaveLength(1);
  });

  it('breaks down allocation by class, summing to 100%', () => {
    const state = baseState({
      assets: [
        asset('a', 'fund', { [mk(0)]: { contributed: 0, value: 750 } }),
        asset('b', 'gold', { [mk(0)]: { contributed: 0, value: 250 } }),
      ],
    });
    const inv = computeInvestments(state, 12);
    expect(inv.byClass.map((c) => c.id)).toEqual(['fund', 'gold']);
    expect(inv.byClass[0].share).toBe(75);
    expect(inv.byClass.reduce((n, c) => n + c.share, 0)).toBe(100);
  });

  it('accumulates contributions over the series rather than restating them', () => {
    const state = baseState({
      assets: [asset('fund', 'fund', {
        [mk(-2)]: { contributed: 100, value: 100 },
        [mk(-1)]: { contributed: 100, value: 210 },
        [mk(0)]: { contributed: 100, value: 330 },
      })],
    });
    const inv = computeInvestments(state, 12);
    const invested = inv.series.map((s) => s.invested);
    expect(invested).toEqual([100, 200, 300]);
    expect(inv.series.map((s) => s.gain)).toEqual([0, 10, 30]);
  });
});
