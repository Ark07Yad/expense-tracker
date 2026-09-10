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
  balanceAt, budgetForPeriod, budgetLines, byCategory, computeDebts,
  computeFinance, computeInvestments, entriesInRange, monthlyBreakdown, movers,
  netWorthOf, payoffOf, seriesOf, totalsOf, amortisationOf, amortisationByYear,
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
  debts: over.debts || [],
  recurring: over.recurring || [],
  goals: over.goals || [],
  notes: [], dismissed: [],
});

describe('totalsOf', () => {
  it('treats money set aside as a transfer, not a loss', () => {
    // The correction at the heart of this model. Moving money into a savings
    // pot changes where it sits, not how much of it there is — counting it as
    // an outflow made every month restart from zero and made a month of
    // diligent saving look like a month of loss.
    const t = totalsOf([
      entry('2020-06-01', 'earning', 'salary', 1000),
      entry('2020-06-02', 'expense', 'dining', 300),
      entry('2020-06-03', 'saving', 'emergency', 200),
    ]);
    expect(t.earning).toBe(1000);
    expect(t.expense).toBe(300);
    expect(t.saving).toBe(200);
    // Kept = in − spent. The 200 is still yours, so it does not appear here.
    expect(t.saved).toBe(700);
    expect(t.net).toBe(700);
    expect(t.outflow).toBe(300);
    expect(t.count).toBe(3);
  });

  it('nets withdrawals against what was set aside', () => {
    const t = totalsOf([
      entry('2020-06-01', 'earning', 'salary', 1000),
      entry('2020-06-02', 'saving', 'emergency', 300),
      entry('2020-06-03', 'withdrawal', 'emergency', 100),
    ]);
    expect(t.setAside).toBe(200);
    // Taking money back out of your own pot is not income.
    expect(t.saved).toBe(1000);
    expect(t.earning).toBe(1000);
  });

  it('measures the rate against what was not spent', () => {
    const t = totalsOf([
      entry('2020-06-01', 'earning', 'salary', 1000),
      entry('2020-06-02', 'expense', 'dining', 300),
    ]);
    expect(t.savingsRate).toBe(70);
  });

  it('never claims you kept more than you earned', () => {
    // Setting aside more than arrived is possible — the surplus comes from an
    // earlier balance — and must not read as keeping over 100% of income.
    const t = totalsOf([
      entry('2020-06-01', 'earning', 'salary', 502),
      entry('2020-06-02', 'saving', 'emergency', 687),
    ]);
    expect(t.savingsRate).toBe(100);
    // Nothing was spent, so nothing was lost and the month is not in the red.
    expect(t.saved).toBe(502);
    expect(t.beyondIncome).toBe(0);
    expect(t.overspent).toBe(false);
  });

  it('reports a shortfall only when spending causes it', () => {
    const spent = totalsOf([
      entry('2020-06-01', 'earning', 'salary', 500),
      entry('2020-06-02', 'expense', 'dining', 900),
    ]);
    expect(spent.overspent).toBe(true);
    expect(spent.beyondIncome).toBe(400);
    expect(spent.saved).toBe(-400);
  });

  it('does not divide by zero when nothing came in', () => {
    const t = totalsOf([entry('2020-06-02', 'expense', 'dining', 300)]);
    expect(t.savingsRate).toBe(0);
    expect(t.saved).toBe(-300);
  });

  it('takes the magnitude of an amount, whatever sign it was stored with', () => {
    expect(totalsOf([entry('2020-06-01', 'expense', 'dining', -50)]).expense).toBe(50);
  });

  it('is empty-safe', () => {
    expect(totalsOf([])).toMatchObject({ earning: 0, expense: 0, saving: 0, saved: 0, count: 0 });
  });
});

describe('balanceAt', () => {
  // The carry-forward the app was missing. A month's saving only means
  // something as part of a total that survives the 1st.
  const ledger = [
    entry('2020-05-01', 'earning', 'salary', 1000),
    entry('2020-05-10', 'expense', 'dining', 200),
    entry('2020-05-15', 'saving', 'emergency', 500),
    entry('2020-06-01', 'earning', 'salary', 1000),
    entry('2020-06-10', 'expense', 'dining', 300),
  ];

  it('accumulates across months instead of restarting', () => {
    expect(balanceAt(ledger, '2020-05-31').balance).toBe(800);
    expect(balanceAt(ledger, '2020-06-30').balance).toBe(1500);
  });

  it('tracks the savings pot separately from the total', () => {
    const at = balanceAt(ledger, '2020-06-30');
    expect(at.balance).toBe(1500);
    expect(at.pot).toBe(500);
    // What is left to spend without dipping into savings.
    expect(at.spendable).toBe(1000);
  });

  it('lets a withdrawal move money back out of the pot', () => {
    const withDraw = [...ledger, entry('2020-06-20', 'withdrawal', 'emergency', 200)];
    const at = balanceAt(withDraw, '2020-06-30');
    // The total is untouched — the money simply stopped being earmarked.
    expect(at.balance).toBe(1500);
    expect(at.pot).toBe(300);
    expect(at.spendable).toBe(1200);
  });

  it('counts only up to the date asked for', () => {
    expect(balanceAt(ledger, '2020-05-09').balance).toBe(1000);
    expect(balanceAt(ledger, '2020-04-30').balance).toBe(0);
  });

  it('is empty-safe', () => {
    expect(balanceAt([], '2020-06-30')).toMatchObject({ balance: 0, pot: 0, spendable: 0 });
  });

  it('starts from what you already had', () => {
    // Otherwise the balance is not your money, only the part this app watched.
    const at = balanceAt(ledger, '2020-06-30', { balance: 5000, savings: 2000 });
    expect(at.balance).toBe(6500);
    expect(at.pot).toBe(2500);
    expect(at.spendable).toBe(4000);
  });

  it('ignores a negative opening balance rather than subtracting it', () => {
    expect(balanceAt([], '2020-06-30', { balance: -100 }).balance).toBe(0);
  });

  it('tracks what was sent to investments separately', () => {
    // The one figure that lives in two ledgers: it left the bank and reappears
    // as a holding, so anything summing the two has to know about it.
    const withInvest = [...ledger, entry('2020-06-15', 'saving', 'invest-transfer', 300)];
    const at = balanceAt(withInvest, '2020-06-30');
    expect(at.pot).toBe(800);
    expect(at.toInvestments).toBe(300);
  });
});

describe('netWorthOf', () => {
  const asset = (invested, value) => ({
    id: 'f', name: 'Fund', class: 'fund', note: '', createdAt: 1,
    history: { [monthKey(todayKey())]: { contributed: invested, value } },
  });

  it('counts money sent to investments once, not twice', () => {
    // Earn 1000, send 500 to investments, the holding is worth 600.
    // Cash 500 + holdings 600 = 1100 — not 1000 + 600.
    const state = baseState({
      entries: [
        entry(todayKey(), 'earning', 'salary', 1000),
        entry(todayKey(), 'saving', 'invest-transfer', 500),
      ],
      assets: [asset(500, 600)],
    });
    const w = netWorthOf(state);
    expect(w.cash).toBe(500);
    expect(w.investments).toBe(600);
    expect(w.netWorth).toBe(1100);
    expect(w.untracked).toBe(0);
  });

  it('adds a holding funded before tracking began, without subtracting anything', () => {
    const state = baseState({
      entries: [entry(todayKey(), 'earning', 'salary', 1000)],
      assets: [asset(500, 600)],
    });
    const w = netWorthOf(state);
    expect(w.cash).toBe(1000);
    expect(w.netWorth).toBe(1600);
  });

  it('flags money sent to investments with no holding recorded', () => {
    // Not an error, but the one case where the total understates what you own.
    const state = baseState({
      entries: [
        entry(todayKey(), 'earning', 'salary', 1000),
        entry(todayKey(), 'saving', 'invest-transfer', 400),
      ],
    });
    const w = netWorthOf(state);
    expect(w.untracked).toBe(400);
    expect(w.hasInvestments).toBe(false);
  });

  it('includes the opening balance', () => {
    const state = baseState({ profile: { openingBalance: 2000, openingSavings: 800 } });
    const w = netWorthOf(state);
    expect(w.netWorth).toBe(2000);
    expect(w.pot).toBe(800);
    expect(w.spendable).toBe(1200);
  });

  it('is empty-safe', () => {
    expect(netWorthOf(baseState())).toMatchObject({ netWorth: 0, cash: 0, investments: 0 });
  });
});

describe('computeDebts', () => {
  const nowM = monthKey(todayKey());
  const mk = (n) => addMonthKeys(nowM, n);
  const debt = (id, cls, history) => ({ id, name: id, class: cls, note: '', createdAt: 1, history });

  it('reports nothing owed when nothing is recorded', () => {
    const d = computeDebts(baseState(), 12);
    expect(d.empty).toBe(true);
    expect(d.owed).toBe(0);
  });

  it('totals what is outstanding', () => {
    const state = baseState({
      debts: [
        debt('card', 'card', { [mk(0)]: { paid: 200, balance: 800 } }),
        debt('loan', 'personal', { [mk(0)]: { paid: 300, balance: 4000 } }),
      ],
    });
    const d = computeDebts(state, 12);
    expect(d.owed).toBe(4800);
    expect(d.paidThisMonth).toBe(500);
    // Largest first, so the one that matters is at the top.
    expect(d.rows.map((r) => r.id)).toEqual(['loan', 'card']);
  });

  it('carries an un-updated balance forward instead of clearing it', () => {
    // Nobody re-reads every statement every month. Without carry-forward a
    // month where only the card was updated would show the mortgage vanishing
    // — and net worth leaping by the size of a house.
    const state = baseState({
      debts: [
        debt('mortgage', 'mortgage', { [mk(-3)]: { paid: 0, balance: 200000 } }),
        debt('card', 'card', { [mk(0)]: { paid: 100, balance: 500 } }),
      ],
    });
    const d = computeDebts(state, 12);
    expect(d.owed).toBe(200500);
    expect(d.staleDebts.map((r) => r.id)).toEqual(['mortgage']);
  });

  it('tracks how much has been cleared since it was first recorded', () => {
    const state = baseState({
      debts: [debt('loan', 'personal', {
        [mk(-2)]: { paid: 0, balance: 5000 },
        [mk(0)]: { paid: 400, balance: 4200 },
      })],
    });
    const row = computeDebts(state, 12).rows[0];
    expect(row.opening).toBe(5000);
    expect(row.balance).toBe(4200);
    expect(row.clearedSoFar).toBe(800);
  });
});

describe('payoffOf', () => {
  it('works out how long a debt takes to clear', () => {
    // 1,000 at 12% a year, paying 100 a month: about eleven months.
    const p = payoffOf({ balance: 1000, rate: 12, monthlyPayment: 100 });
    expect(p.months).toBe(11);
    expect(p.interest).toBeGreaterThan(0);
    expect(p.neverClears).toBe(false);
  });

  it('handles an interest-free debt as simple division', () => {
    const p = payoffOf({ balance: 1000, rate: 0, monthlyPayment: 250 });
    expect(p.months).toBe(4);
    expect(p.interest).toBe(0);
  });

  it('says a payment that does not cover the interest never clears', () => {
    // The one case where the arithmetic has no answer, and precisely the case
    // someone most needs to be told about — a plausible-looking number here
    // would be worse than none.
    const p = payoffOf({ balance: 5000, rate: 24, monthlyPayment: 80 });
    expect(p.neverClears).toBe(true);
    expect(p.months).toBeNull();
    expect(p.monthlyInterest).toBe(100);
  });

  it('reports a cleared debt as cleared', () => {
    expect(payoffOf({ balance: 0, rate: 20, monthlyPayment: 0 })).toMatchObject({
      months: 0,
      cleared: true,
    });
  });

  it('declines to guess when nothing is being paid', () => {
    const p = payoffOf({ balance: 1000, rate: 10, monthlyPayment: 0 });
    expect(p.months).toBeNull();
    expect(p.neverClears).toBe(false);
  });

  it('treats a missing rate as interest-free rather than throwing', () => {
    expect(payoffOf({ balance: 600, rate: null, monthlyPayment: 200 }).months).toBe(3);
  });
});

describe('amortisationOf', () => {
  it('splits every payment into interest and principal', () => {
    const a = amortisationOf({ balance: 1000, rate: 12, monthlyPayment: 100 });
    const first = a.rows[0];
    // 1% of 1000 for the first month.
    expect(first.interest).toBeCloseTo(10, 5);
    expect(first.principal).toBeCloseTo(90, 5);
    expect(first.balance).toBeCloseTo(910, 5);
  });

  it('shrinks the interest share as the balance falls', () => {
    // The reason a schedule exists: early payments barely touch the balance.
    const a = amortisationOf({ balance: 10000, rate: 18, monthlyPayment: 300 });
    expect(a.rows[0].interest).toBeGreaterThan(a.rows[10].interest);
    expect(a.rows[0].principal).toBeLessThan(a.rows[10].principal);
  });

  it('ends exactly at zero, with a smaller final instalment', () => {
    const a = amortisationOf({ balance: 1000, rate: 12, monthlyPayment: 100 });
    const last = a.rows[a.rows.length - 1];
    expect(last.balance).toBe(0);
    expect(last.payment).toBeLessThanOrEqual(100);
    expect(a.months).toBe(11);
  });

  it('agrees with the payoff estimate', () => {
    const args = { balance: 4200, rate: 22.9, monthlyPayment: 400 };
    expect(amortisationOf(args).months).toBe(payoffOf(args).months);
  });

  it('handles an interest-free debt', () => {
    const a = amortisationOf({ balance: 900, rate: 0, monthlyPayment: 300 });
    expect(a.months).toBe(3);
    expect(a.totalInterest).toBe(0);
  });

  it('refuses to schedule a debt the payment cannot clear', () => {
    const a = amortisationOf({ balance: 5000, rate: 24, monthlyPayment: 80 });
    expect(a.neverClears).toBe(true);
    expect(a.rows).toEqual([]);
  });

  it('returns nothing when no payment is being made', () => {
    expect(amortisationOf({ balance: 500, rate: 5, monthlyPayment: 0 }).rows).toEqual([]);
  });

  it('stops at the cap rather than looping', () => {
    const a = amortisationOf({ balance: 200000, rate: 2, monthlyPayment: 400, maxMonths: 24 });
    expect(a.rows).toHaveLength(24);
    expect(a.truncated).toBe(true);
  });
});

describe('amortisationByYear', () => {
  it('collapses the schedule into years', () => {
    const a = amortisationOf({ balance: 12000, rate: 6, monthlyPayment: 400 });
    const years = amortisationByYear(a, '2026-01-15');
    expect(years.length).toBeGreaterThan(1);
    expect(years[0].label).toBe('2026');
    // Every payment is accounted for in one bucket or another.
    const totalPrincipal = years.reduce((n, y) => n + y.principal, 0);
    expect(totalPrincipal).toBeCloseTo(12000, 0);
  });

  it('is empty-safe', () => {
    expect(amortisationByYear({ rows: [] }, '2026-01-15')).toEqual([]);
  });
});

describe('debt payments linked to the ledger', () => {
  const nowM = monthKey(todayKey());
  const mk = (n) => addMonthKeys(nowM, n);

  const withPayment = (over = {}) =>
    baseState({
      entries: [
        { id: 'p1', date: todayKey(), kind: 'expense', category: 'debt', title: 'Card payment',
          note: '', amount: 400, createdAt: 1, debtId: 'card' },
        ...(over.entries || []),
      ],
      debts: [{
        id: 'card', name: 'Visa', class: 'card', note: '', rate: 24, createdAt: 1,
        history: { [mk(-1)]: { paid: 0, balance: 1200 }, [nowM]: { paid: 400, balance: 950 } },
        ...over.debt,
      }],
    });

  it('counts tagged expenses as payments toward that debt', () => {
    const row = computeDebts(withPayment(), 12).rows[0];
    expect(row.loggedThisMonth).toBe(400);
    expect(row.loggedTotal).toBe(400);
  });

  it('works out the interest from what was paid against what came off', () => {
    // Paid 400, balance fell 1200 → 950, so 150 of it was interest. This is
    // the number that explains a debt paid diligently that barely moves.
    const row = computeDebts(withPayment(), 12).rows[0];
    expect(row.interestThisMonth).toBe(150);
  });

  it('flags when the ledger and the statement disagree', () => {
    const state = withPayment({ debt: { history: { [mk(-1)]: { paid: 0, balance: 1200 }, [nowM]: { paid: 900, balance: 950 } } } });
    expect(computeDebts(state, 12).mismatched.map((r) => r.id)).toEqual(['card']);
  });

  it('does not flag a small rounding difference', () => {
    const state = withPayment({ debt: { history: { [mk(-1)]: { paid: 0, balance: 1200 }, [nowM]: { paid: 401, balance: 950 } } } });
    expect(computeDebts(state, 12).mismatched).toHaveLength(0);
  });

  it('notices a statement payment with nothing logged against it', () => {
    const state = baseState({
      debts: [{
        id: 'loan', name: 'Loan', class: 'personal', note: '', rate: null, createdAt: 1,
        history: { [nowM]: { paid: 300, balance: 2000 } },
      }],
    });
    expect(computeDebts(state, 12).untagged.map((r) => r.id)).toEqual(['loan']);
  });

  it('projects a payoff from recent payments', () => {
    const row = computeDebts(withPayment(), 12).rows[0];
    expect(row.typicalPayment).toBe(400);
    expect(row.payoff.months).toBeGreaterThan(0);
    expect(row.payoff.neverClears).toBe(false);
  });

  it('totals the interest accruing across every debt', () => {
    const d = computeDebts(withPayment(), 12);
    // 950 at 24% a year is 19 a month.
    expect(d.monthlyInterest).toBeCloseTo(19, 5);
  });

  it('totals the same figures the rows show, and says what they are', () => {
    // The header used to sum estimates while the rows showed measurements, so
    // the two disagreed at a glance and neither explained the other.
    const d = computeDebts(withPayment(), 12);
    expect(d.interestTotal.amount).toBe(150);
    expect(d.interestTotal.basis).toBe('observed');
  });

  it('calls the total mixed when the rows are not all the same kind', () => {
    const state = withPayment({
      entries: [],
    });
    state.debts.push({
      id: 'loan', name: 'Loan', class: 'personal', note: '', rate: 12, createdAt: 2,
      history: { [nowM]: { paid: 0, balance: 1200 } },
    });
    const d = computeDebts(state, 12);
    expect(d.interestTotal.basis).toBe('mixed');
    expect(d.interestTotal.count).toBe(2);
  });
});

describe('netWorthOf with debt', () => {
  const nowM = monthKey(todayKey());

  it('takes what is owed off what is owned', () => {
    // Net worth that counts everything you own and nothing you owe is not a
    // net anything.
    const state = baseState({
      profile: { openingBalance: 10000 },
      debts: [{
        id: 'm', name: 'Mortgage', class: 'mortgage', note: '', createdAt: 1,
        history: { [nowM]: { paid: 0, balance: 4000 } },
      }],
    });
    const w = netWorthOf(state);
    expect(w.assets).toBe(10000);
    expect(w.owed).toBe(4000);
    expect(w.netWorth).toBe(6000);
    expect(w.hasDebts).toBe(true);
  });

  it('can be negative when the debts are bigger', () => {
    const state = baseState({
      profile: { openingBalance: 1000 },
      debts: [{
        id: 'm', name: 'Mortgage', class: 'mortgage', note: '', createdAt: 1,
        history: { [nowM]: { paid: 0, balance: 9000 } },
      }],
    });
    expect(netWorthOf(state).netWorth).toBe(-8000);
  });

  it('leaves net worth untouched when there are no debts', () => {
    const state = baseState({ profile: { openingBalance: 1000 } });
    const w = netWorthOf(state);
    expect(w.owed).toBe(0);
    expect(w.hasDebts).toBe(false);
    expect(w.netWorth).toBe(1000);
  });
});

describe('monthlyBreakdown', () => {
  it('separates salary from anything else that came in', () => {
    // One combined "earned" figure cannot tell a changed salary from a bonus.
    const state = baseState({
      entries: [
        entry(todayKey(), 'earning', 'salary', 2000),
        entry(todayKey(), 'earning', 'freelance', 500),
        entry(todayKey(), 'expense', 'dining', 300),
      ],
    });
    const rows = monthlyBreakdown(state, 3);
    const now = rows[rows.length - 1];
    expect(now.salary).toBe(2000);
    expect(now.otherIncome).toBe(500);
    expect(now.expense).toBe(300);
    expect(now.saved).toBe(2200);
    expect(now.isCurrent).toBe(true);
  });

  it('carries the running balance on each row', () => {
    const state = baseState({
      entries: [entry(todayKey(), 'earning', 'salary', 1000)],
      profile: { openingBalance: 500 },
    });
    const rows = monthlyBreakdown(state, 3);
    expect(rows[rows.length - 1].balance).toBe(1500);
  });

  it('drops the empty months before anything was logged', () => {
    const state = baseState({ entries: [entry(todayKey(), 'earning', 'salary', 100)] });
    expect(monthlyBreakdown(state, 12)).toHaveLength(1);
  });

  it('is empty-safe', () => {
    expect(monthlyBreakdown(baseState(), 6).length).toBeGreaterThanOrEqual(0);
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

  it('carries a balance in and out of the period', () => {
    // May's 200 of spending is still there on 1 June — which is the whole
    // point. The old model reset to zero every month and lost it.
    expect(f.opening.balance).toBe(-200);
    expect(f.closing.balance).toBe(-200 + 5000 - 1900);
    // The 1,000 set aside is part of the balance, earmarked rather than gone.
    expect(f.closing.pot).toBe(1000);
    expect(f.closing.spendable).toBe(f.closing.balance - 1000);
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

  it('narrows the whole computation when a category filter is given', () => {
    // Totals, the previous-period comparison and the buckets must all describe
    // the same slice — filtering at render time is how a chart ends up showing
    // one category against a headline for all of them.
    const only = computeFinance(state, 'month', 0, '2020-06-15', 'dining');
    expect(only.categoryFilter).toBe('dining');
    expect(only.totals.expense).toBe(400);
    expect(only.totals.count).toBe(1);
    expect(only.prevTotals.expense).toBe(200);
    expect(only.series.reduce((n, r) => n + r.expense, 0)).toBe(400);
  });

  it('keeps anchor before the filter, so old positional calls still work', () => {
    const anchored = computeFinance(state, 'month', 0, '2020-06-15');
    expect(anchored.range.start).toBe('2020-06-01');
    expect(anchored.categoryFilter).toBeNull();
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
