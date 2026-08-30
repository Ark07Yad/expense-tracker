/**
 * Sample data.
 *
 * A tracker is almost impossible to evaluate empty — every chart is a flat line
 * and every suggestion says "log something first". This generates four months
 * of plausible history so the app can be judged on what it actually does.
 *
 * The generator is seeded, so the same demo comes out every time and a chart
 * that looked wrong can be looked at again. It is also deliberately imperfect:
 * one overspent month, a couple of gaps, an uneven freelance income and a
 * holding nobody revalued. A demo where everything is tidy exercises none of
 * the advice.
 */

import { addDays, addMonthKeys, monthKey, todayKey } from './calc';
import { uid } from './store';

/** Mulberry32 — small, fast, and identical across runs. */
function rng(seed) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function buildDemo({ income = 85000, months = 5 } = {}) {
  const r = rng(20260830);
  const entries = [];
  const today = todayKey();
  /**
   * Start on the 1st of a month, not `today - N*30`.
   *
   * Salary fires on the 1st, so a window opening mid-month produced a first
   * month with a full set of expenses and no income — which then dragged the
   * year headline to "spent more than you earned" purely as an artefact of
   * where the window happened to begin.
   */
  const start = `${addMonthKeys(monthKey(today), -(months - 1))}-01`;

  const push = (date, kind, category, title, amount, note = '') => {
    if (date > today || date < start) return;
    entries.push({
      id: uid(),
      date,
      kind,
      category,
      title,
      note,
      amount: Math.max(1, Math.round(amount)),
      createdAt: Date.now() - (new Date(`${today}T12:00:00`) - new Date(`${date}T12:00:00`)),
    });
  };

  const jitter = (base, spread) => base * (1 + (r() - 0.5) * spread);

  // Walk every day once; monthly items fire on their day of month.
  for (let d = start; d <= today; d = addDays(d, 1)) {
    const day = new Date(`${d}T12:00:00`);
    const dom = day.getDate();
    const dow = day.getDay();
    const weekend = dow === 0 || dow === 6;
    const monthIndex = day.getMonth();

    /* Income */
    if (dom === 1) push(d, 'earning', 'salary', 'Monthly salary', income, 'Net of tax');
    // Freelance is deliberately lumpy — it is what makes the income-variability
    // rule fire, and it is how a lot of people are actually paid.
    if (dom === 18 && r() > 0.45) push(d, 'earning', 'freelance', 'Freelance project', jitter(income * 0.22, 0.8));
    if (dom === 25 && r() > 0.75) push(d, 'earning', 'interest', 'Savings interest', jitter(income * 0.012, 0.4));

    /* Fixed costs */
    if (dom === 3) push(d, 'expense', 'housing', 'Rent', income * 0.3, 'Flat');
    if (dom === 7) push(d, 'expense', 'utilities', 'Electricity & water', jitter(income * 0.035, 0.5));
    if (dom === 9) push(d, 'expense', 'utilities', 'Internet', income * 0.012);
    if (dom === 5) push(d, 'expense', 'subscriptions', 'Phone plan', income * 0.008);
    if (dom === 12) push(d, 'expense', 'subscriptions', 'Streaming', income * 0.006);
    if (dom === 14) push(d, 'expense', 'subscriptions', 'Cloud storage', income * 0.003);
    if (dom === 6) push(d, 'expense', 'health', 'Gym membership', income * 0.018);

    /* Savings — skipped in one month, which is the point. */
    if (dom === 2 && monthIndex % 4 !== 2) {
      push(d, 'saving', 'emergency', 'Emergency fund', income * 0.07);
      push(d, 'saving', 'invest-transfer', 'Monthly SIP', income * 0.09, 'Index fund');
    }

    /* Groceries — a big shop plus a top-up. */
    if (dow === 6) push(d, 'expense', 'groceries', 'Weekly shop', jitter(income * 0.03, 0.4));
    if (dow === 3 && r() > 0.4) push(d, 'expense', 'groceries', 'Top-up shop', jitter(income * 0.012, 0.6));

    /* Dining — the drip. */
    const meals = weekend ? (r() > 0.35 ? 2 : 1) : r() > 0.55 ? 1 : 0;
    for (let i = 0; i < meals; i++) {
      const isBig = weekend && r() > 0.6;
      push(
        d,
        'expense',
        'dining',
        isBig ? 'Dinner out' : r() > 0.5 ? 'Lunch' : 'Coffee',
        isBig ? jitter(income * 0.011, 0.5) : jitter(income * 0.0032, 0.7)
      );
    }

    /* Transport */
    if (!weekend && r() > 0.55) push(d, 'expense', 'transport', r() > 0.5 ? 'Cab' : 'Metro top-up', jitter(income * 0.005, 0.7));
    if (dom === 20) push(d, 'expense', 'transport', 'Fuel', jitter(income * 0.02, 0.35));

    /* Discretionary */
    if (weekend && r() > 0.72) push(d, 'expense', 'entertainment', r() > 0.5 ? 'Cinema' : 'Concert tickets', jitter(income * 0.012, 0.6));
    if (r() > 0.95) push(d, 'expense', 'shopping', r() > 0.5 ? 'Clothes' : 'Household', jitter(income * 0.03, 0.9));
    if (r() > 0.97) push(d, 'expense', 'health', 'Pharmacy', jitter(income * 0.008, 0.5));
    if (r() > 0.985) push(d, 'expense', 'family', 'Gift', jitter(income * 0.02, 0.6));
    if (r() > 0.99) push(d, 'expense', 'education', 'Online course', jitter(income * 0.05, 0.4));
  }

  // One expensive month — a trip — so the year view has a real spike in it and
  // the "your months vary a lot" rule has something true to say.
  const tripStart = addDays(today, -52);
  push(tripStart, 'expense', 'travel', 'Flights', income * 0.28, 'Trip home');
  push(addDays(tripStart, 1), 'expense', 'travel', 'Hotel', income * 0.16);
  push(addDays(tripStart, 3), 'expense', 'travel', 'Food & getting around', income * 0.07);

  /* ── Investments ── */

  const nowM = monthKey(today);
  const mk = (n) => addMonthKeys(nowM, n);

  const asset = (name, cls, note, seedValue, monthly, growth) => {
    const history = {};
    let value = seedValue;
    let paid = seedValue;
    for (let i = -7; i <= 0; i++) {
      const contributed = i === -7 ? seedValue : monthly;
      if (i > -7) {
        value = value * (1 + growth * (0.6 + r() * 0.8)) + monthly;
        paid += monthly;
      }
      history[mk(i)] = { contributed: Math.round(contributed), value: Math.round(value) };
    }
    return { id: uid(), name, class: cls, note, createdAt: Date.now(), history };
  };

  const assets = [
    asset('Nifty 50 index fund', 'fund', 'Monthly SIP', income * 2.4, income * 0.12, 0.012),
    asset('Retirement account', 'retire', 'Employer + own contribution', income * 3.1, income * 0.09, 0.007),
    asset('Fixed deposit', 'bond', '3-year, matures 2028', income * 1.8, 0, 0.005),
    asset('Sovereign gold bonds', 'gold', '', income * 0.9, 0, 0.008),
  ];

  // Two holdings that make the advisor earn its keep: one high-risk, and one
  // nobody has revalued in months.
  const crypto = asset('Crypto wallet', 'crypto', 'Speculative — small position', income * 0.5, 0, 0.03);
  assets.push(crypto);

  const stale = asset('Employer stock', 'equity', 'Vested RSUs', income * 1.4, 0, 0.01);
  for (const m of Object.keys(stale.history)) {
    if (m > mk(-3)) delete stale.history[m];
  }
  assets.push(stale);

  const sorted = entries.sort((a, b) => (a.date < b.date ? 1 : -1));
  return { entries: sorted, assets, budgets: demoBudgets(sorted) };
}

/**
 * Budgets for the demo, derived from the demo's own spending.
 *
 * The generic income-share heuristic used at onboarding is the wrong tool here:
 * it produced a dining cap a third of what the sample data actually spends, so
 * the demo opened on four blown budgets and read as broken calibration rather
 * than as a normal month.
 *
 * Two rules make the derived version behave:
 *
 *   - **Only complete months count.** The current month is still running, and
 *     averaging a part-month in produces caps that are too tight for every
 *     category at once.
 *   - **Only categories that recur get a budget.** A single holiday would
 *     otherwise average out into a standing monthly travel allowance larger
 *     than the rent. A category has to appear in every complete month to get a
 *     cap — the rest are left uncapped, which is both realistic and gives the
 *     advisor its "sizeable categories with no budget" case to find.
 */
function demoBudgets(entries) {
  const current = monthKey(todayKey());
  // Every month in the window starts on the 1st, so the only incomplete one is
  // the month still running.
  const complete = [...new Set(entries.map((e) => e.date.slice(0, 7)))]
    .filter((m) => m !== current)
    .sort();
  if (!complete.length) return {};

  const totals = new Map();
  for (const e of entries) {
    if (e.kind !== 'expense') continue;
    const m = e.date.slice(0, 7);
    if (!complete.includes(m)) continue;
    if (!totals.has(e.category)) totals.set(e.category, new Map());
    const row = totals.get(e.category);
    row.set(m, (row.get(m) || 0) + e.amount);
  }

  const out = {};
  for (const [cat, row] of totals) {
    if (row.size < complete.length) continue; // not a recurring cost

    const values = [...row.values()];
    const low = Math.min(...values);
    const high = Math.max(...values);
    // Present every month but wildly different each time — a rare purchase that
    // happened to land in all of them. Averaging those gives a cap with no
    // relationship to a normal month, which is how the demo ended up budgeting
    // nine thousand a month for a course taken twice a year.
    if (low <= 0 || high > low * 2.5) continue;

    const mean = values.reduce((a, b) => a + b, 0) / complete.length;
    // A little headroom, so a normal month sits just inside the cap rather than
    // exactly on it.
    const cap = mean * 1.1;
    const step = cap > 20000 ? 1000 : cap > 2000 ? 500 : 100;
    out[cat] = Math.max(step, Math.round(cap / step) * step);
  }
  return out;
}
