/**
 * The advisor.
 *
 * Two things are worth locking down here. First, the rules must stay quiet
 * until there is enough logged to support them — confident nonsense in week one
 * is how people stop trusting a tracker. Second, the investing section must
 * keep describing rather than recommending; that boundary is deliberate and
 * easy to erode while adding a rule.
 */

import { describe, expect, it } from 'vitest';
import { SECTIONS, buildSuggestions, headlineSuggestions, liveSuggestions } from './insights';
import { addMonthKeys, monthKey, todayKey } from './calc';

let seq = 0;
const entry = (date, kind, category, amount, title = 't') => ({
  id: `i${seq++}`, date, kind, category, title, note: '', amount, createdAt: seq,
});

const state = (over = {}) => ({
  version: 1, onboarded: true, theme: 'dark',
  profile: {
    name: '', currency: 'INR', weekStart: 1, monthlyIncome: 0,
    savingsTargetPct: 20, budgets: {}, ...over.profile,
  },
  entries: over.entries || [],
  assets: over.assets || [],
  debts: over.debts || [],
  recurring: [], goals: [],
  notes: [], dismissed: over.dismissed || [],
});

/** A day inside the current month, so month-scoped rules see the fixture. */
const thisMonth = (day) => `${monthKey(todayKey())}-${String(day).padStart(2, '0')}`;

describe('every section runs', () => {
  // A smoke test across all of them, because a section nothing calls is a
  // section where a bad reference sits until a user finds it. This caught
  // exactly that: `computeInvestments` left behind after an import change,
  // reachable only from the savings and income sections.
  const populated = state({
    profile: { monthlyIncome: 5000, budgets: { dining: 400, housing: 1500 } },
    entries: [
      entry(thisMonth(1), 'earning', 'salary', 5000),
      entry(thisMonth(2), 'expense', 'housing', 1500),
      entry(thisMonth(3), 'expense', 'dining', 500),
      entry(thisMonth(4), 'saving', 'emergency', 400),
    ],
    assets: [{
      id: 'fd', name: 'Fixed deposit', class: 'bond', note: '', createdAt: 1,
      history: { [monthKey(todayKey())]: { contributed: 100, value: 9000 } },
    }],
  });

  for (const section of SECTIONS) {
    it(`${section.id} produces usable suggestions`, () => {
      const out = buildSuggestions(populated, section.id);
      expect(Array.isArray(out)).toBe(true);
      for (const s of out) {
        expect(s.id, `${section.id} suggestion needs an id`).toBeTruthy();
        expect(s.title, `${s.id} needs a title`).toBeTruthy();
        expect(s.body, `${s.id} needs a body`).toBeTruthy();
        expect(['bad', 'warn', 'info', 'good']).toContain(s.tone);
        expect(typeof s.priority).toBe('number');
      }
    });
  }

  it('runs a category deep dive for every expense category', () => {
    for (const id of ['dining', 'housing', 'travel', 'subscriptions']) {
      expect(() => buildSuggestions(populated, id)).not.toThrow();
    }
  });
});

describe('silence without data', () => {
  it('says so plainly rather than inventing something', () => {
    const out = buildSuggestions(state(), 'overall');
    expect(out).toHaveLength(1);
    expect(out[0].id).toBe('empty');
  });

  it('offers a starting point rather than a verdict when only budgets are missing', () => {
    const out = buildSuggestions(
      state({ entries: [entry(thisMonth(2), 'expense', 'dining', 100)] }),
      'budgets'
    );
    expect(out.map((s) => s.id)).toContain('no-budgets');
  });
});

describe('rules fire on real numbers', () => {
  it('notices spending beyond what came in', () => {
    const out = buildSuggestions(state({
      entries: [
        entry(thisMonth(1), 'earning', 'salary', 1000),
        entry(thisMonth(2), 'expense', 'housing', 1500),
      ],
    }), 'overall');
    expect(out.map((s) => s.id)).toContain('net-negative');
    expect(out.find((s) => s.id === 'net-negative').tone).toBe('bad');
  });

  it('notices spending with no income logged at all', () => {
    const out = buildSuggestions(state({
      entries: [entry(thisMonth(2), 'expense', 'dining', 500)],
    }), 'overall');
    expect(out.map((s) => s.id)).toContain('no-income');
  });

  it('flags a dominant category and names the figure', () => {
    const out = buildSuggestions(state({
      entries: [
        entry(thisMonth(1), 'expense', 'housing', 800),
        entry(thisMonth(2), 'expense', 'dining', 100),
        entry(thisMonth(3), 'expense', 'transport', 100),
      ],
    }), 'spending');
    const conc = out.find((s) => s.id === 'concentration-housing');
    expect(conc).toBeDefined();
    // Every card has to name something checkable.
    expect(conc.title).toMatch(/80%/);
  });

  it('flags a blown budget', () => {
    const out = buildSuggestions(state({
      profile: { budgets: { dining: 100 } },
      entries: [entry(thisMonth(2), 'expense', 'dining', 250)],
    }), 'budgets');
    expect(out.map((s) => s.id)).toContain('budgets-over');
  });

  it('congratulates rather than nags when everything is on track', () => {
    const out = buildSuggestions(state({
      profile: { budgets: { dining: 1000 } },
      entries: [entry(thisMonth(2), 'expense', 'dining', 50)],
    }), 'budgets');
    expect(out.map((s) => s.id)).toContain('budgets-healthy');
    expect(out.find((s) => s.id === 'budgets-healthy').tone).toBe('good');
  });

  it('warns when the budgets cannot be met even in a perfect month', () => {
    const out = buildSuggestions(state({
      profile: { monthlyIncome: 1000, budgets: { housing: 900, dining: 400 } },
      entries: [entry(thisMonth(2), 'expense', 'dining', 10)],
    }), 'budgets');
    expect(out.map((s) => s.id)).toContain('budgets-exceed-income');
  });
});

describe('the category deep dive', () => {
  it('summarises a category with its own numbers', () => {
    const out = buildSuggestions(state({
      entries: [
        entry(thisMonth(1), 'expense', 'dining', 100),
        entry(thisMonth(2), 'expense', 'dining', 300),
      ],
    }), 'dining');
    const summary = out.find((s) => s.id === 'cat-dining-summary');
    expect(summary).toBeDefined();
    expect(summary.body).toMatch(/2 entries/);
  });

  it('says so when a category is genuinely quiet', () => {
    const out = buildSuggestions(state({
      entries: [entry(thisMonth(1), 'expense', 'housing', 100)],
    }), 'travel');
    expect(out.map((s) => s.id)).toContain('cat-travel-quiet');
  });

  it('offers a cap when a category has spending but no budget', () => {
    const out = buildSuggestions(state({
      entries: [entry(thisMonth(1), 'expense', 'dining', 100)],
    }), 'dining');
    expect(out.map((s) => s.id)).toContain('cat-dining-nobudget');
  });
});

describe('the investing boundary', () => {
  const nowM = monthKey(todayKey());
  const withHolding = () => state({
    assets: [{
      id: 'a', name: 'Fund', class: 'fund', note: '', createdAt: 1,
      history: { [addMonthKeys(nowM, -1)]: { contributed: 1000, value: 1200 } },
    }],
    entries: [entry(thisMonth(1), 'expense', 'dining', 10)],
  });

  it('describes the portfolio without recommending anything', () => {
    const out = buildSuggestions(withHolding(), 'investing');
    const text = out.map((s) => `${s.title} ${s.body}`).join(' ').toLowerCase();
    // No instruction to trade, and no target allocation.
    expect(text).not.toMatch(/\byou should (buy|sell|invest in|move into)\b/);
    expect(text).not.toMatch(/\brecommend(ed|s)?\b/);
    expect(text).not.toMatch(/\b\d+\/\d+ (split|allocation)\b/);
  });

  it('always carries the disclaimer', () => {
    const out = buildSuggestions(withHolding(), 'investing');
    const disclaimer = out.find((s) => s.id === 'inv-disclaimer');
    expect(disclaimer).toBeDefined();
    expect(disclaimer.body).toMatch(/not tell you what to buy or sell/i);
  });

  it('nags about stale values, which is a data problem not an advice problem', () => {
    const out = buildSuggestions(withHolding(), 'investing');
    expect(out.map((s) => s.id)).toContain('inv-no-contribution');
  });

  it('invites the user to record holdings when there are none', () => {
    const out = buildSuggestions(state({ entries: [entry(thisMonth(1), 'expense', 'dining', 10)] }), 'investing');
    expect(out.map((s) => s.id)).toContain('inv-empty');
  });
});

describe('dismissal', () => {
  // Built once: some ids are keyed to the entry they are about — "largest
  // single expense" is a fact about one specific entry — so rebuilding the
  // fixture would hand out fresh entry ids and test nothing.
  const populated = state({
    entries: [
      entry(thisMonth(1), 'earning', 'salary', 1000),
      entry(thisMonth(2), 'expense', 'housing', 1500),
    ],
  });

  it('hides what the user dismissed and counts it', () => {
    const all = liveSuggestions(populated, 'overall');
    expect(all.shown.length).toBeGreaterThan(0);

    const after = liveSuggestions({ ...populated, dismissed: ['net-negative'] }, 'overall');
    expect(after.shown.map((s) => s.id)).not.toContain('net-negative');
    expect(after.hidden).toBe(1);
  });

  it('keeps ids stable across runs, so a dismissal sticks', () => {
    const a = buildSuggestions(populated, 'overall').map((s) => s.id);
    const b = buildSuggestions(populated, 'overall').map((s) => s.id);
    expect(a).toEqual(b);
  });

  it('keys a suggestion to its subject, not to a random value', () => {
    // Rule-and-subject ids are what make a dismissal outlive a re-render.
    const ids = buildSuggestions(populated, 'overall').map((s) => s.id);
    expect(ids).toContain('net-negative');    // rule alone
    expect(ids).toContain('housing-heavy');   // rule + category
  });
});

describe('headlineSuggestions', () => {
  it('surfaces only urgent items, deduplicated, within the limit', () => {
    const out = headlineSuggestions(state({
      profile: { budgets: { dining: 10 } },
      entries: [
        entry(thisMonth(1), 'earning', 'salary', 1000),
        entry(thisMonth(2), 'expense', 'housing', 1500),
        entry(thisMonth(3), 'expense', 'dining', 500),
      ],
    }), 3);
    expect(out.length).toBeLessThanOrEqual(3);
    expect(new Set(out.map((s) => s.id)).size).toBe(out.length);
    expect(out.every((s) => s.priority <= 2)).toBe(true);
  });

  it('respects dismissals', () => {
    const base = {
      profile: { budgets: {} },
      entries: [
        entry(thisMonth(1), 'earning', 'salary', 1000),
        entry(thisMonth(2), 'expense', 'housing', 1500),
      ],
    };
    const before = headlineSuggestions(state(base), 5).map((s) => s.id);
    expect(before).toContain('net-negative');
    const after = headlineSuggestions(state({ ...base, dismissed: ['net-negative'] }), 5).map((s) => s.id);
    expect(after).not.toContain('net-negative');
  });
});

describe('investing observations', () => {
  const nowM = monthKey(todayKey());
  const m = (i) => addMonthKeys(nowM, i);
  const ids = (st) => buildSuggestions(st, 'investing').map((x) => x.id);
  const find = (st, id) => buildSuggestions(st, 'investing').find((x) => x.id === id);
  const spend = [entry(thisMonth(1), 'expense', 'dining', 10)];

  /** A holding recorded every month from `from` to now. */
  const monthly = (id, cls, from, valueAt, paid = 100, over = {}) => {
    const history = {};
    for (let i = from; i <= 0; i++) history[m(i)] = { contributed: paid, value: valueAt(i) };
    return { id, name: id, class: cls, note: '', createdAt: 1, history, ...over };
  };

  it('names a single holding carrying most of the portfolio', () => {
    const st = state({
      entries: spend,
      assets: [
        { id: 'big', name: 'Big fund', class: 'fund', note: '', createdAt: 1, history: { [nowM]: { contributed: 0, value: 9000 } } },
        { id: 'fd', name: 'FD', class: 'fund', note: '', createdAt: 1, history: { [nowM]: { contributed: 0, value: 1000 } } },
      ],
    });
    expect(find(st, 'inv-top-holding-big').title).toMatch(/Big fund is 90%/);
  });

  it('does not repeat the class figure when one holding is the whole class', () => {
    const st = state({
      entries: spend,
      assets: [
        { id: 'big', name: 'Big fund', class: 'fund', note: '', createdAt: 1, history: { [nowM]: { contributed: 0, value: 9000 } } },
        { id: 'g', name: 'Gold', class: 'gold', note: '', createdAt: 1, history: { [nowM]: { contributed: 0, value: 1000 } } },
      ],
    });
    expect(ids(st)).toContain('inv-concentration-fund');
    expect(ids(st)).not.toContain('inv-top-holding-big');
  });

  it('flags holdings worth well under what went in', () => {
    const st = state({
      entries: spend,
      assets: [{ id: 'x', name: 'Crypto', class: 'crypto', note: '', createdAt: 1, history: { [nowM]: { contributed: 1000, value: 800 } } }],
    });
    expect(find(st, 'inv-below-paid-in').title).toMatch(/Crypto is worth 20\.0% less/);
  });

  it('splits growth into contributions and movement', () => {
    // 1000 six months ago, 600 paid in since, 2000 now: 400 is movement.
    const st = state({ entries: spend, assets: [monthly('f', 'fund', -6, (i) => (i === 0 ? 2000 : 1000 + (i + 6) * 100))] });
    const s = find(st, 'inv-growth-split');
    expect(s.title).toMatch(/400 of growth beyond/);
    expect(s.body).toMatch(/600 of that change was your own contributions/);
  });

  it('does not count a holding added mid-window as growth', () => {
    const st = state({
      entries: spend,
      assets: [
        monthly('old', 'fund', -6, () => 1000, 0),
        { id: 'new', name: 'new', class: 'fund', note: '', createdAt: 1, history: { [nowM]: { contributed: 0, value: 50000 } } },
      ],
    });
    expect(ids(st)).not.toContain('inv-growth-split');
  });

  it('keeps quiet about growth while a value is stale', () => {
    const a = monthly('f', 'fund', -6, (i) => 1000 + (i + 6) * 300);
    delete a.history[m(0)];
    delete a.history[m(-1)];
    expect(ids(state({ entries: spend, assets: [a] }))).not.toContain('inv-growth-split');
  });

  it('describes the contribution rhythm, steady or gapped', () => {
    const steady = state({ entries: spend, assets: [monthly('f', 'fund', -6, () => 1000)] });
    expect(find(steady, 'inv-rhythm-steady').title).toMatch(/each of the last 6 months/);

    const gapped = monthly('f', 'fund', -6, () => 1000);
    gapped.history[m(-2)].contributed = 0;
    gapped.history[m(-4)].contributed = 0;
    expect(find(state({ entries: spend, assets: [gapped] }), 'inv-rhythm-gaps').title)
      .toMatch(/in 4 of the last 6 months/);
  });

  it('puts contributions against income over finished months', () => {
    const entries = [-3, -2, -1].map((i) => entry(`${m(i)}-05`, 'earning', 'salary', 1000));
    const st = state({ entries: [...entries, ...spend], assets: [monthly('f', 'fund', -3, () => 1000, 100)] });
    expect(find(st, 'inv-share-of-income').title).toMatch(/About 10% of income/);
  });

  it('sets a thin cushion beside the holdings that move', () => {
    const entries = [-3, -2, -1].map((i) => entry(`${m(i)}-05`, 'expense', 'housing', 1000));
    const risky = { id: 'f', name: 'Fund', class: 'fund', note: '', createdAt: 1, history: { [nowM]: { contributed: 0, value: 10000 } } };
    expect(ids(state({ entries, assets: [risky] }))).toContain('inv-thin-cushion');

    const cash = { id: 'c', name: 'Liquid', class: 'cash', note: '', createdAt: 1, history: { [nowM]: { contributed: 0, value: 5000 } } };
    expect(ids(state({ entries, assets: [risky, cash] }))).not.toContain('inv-thin-cushion');
  });

  it('shows expensive debt alongside contributions', () => {
    const st = state({
      entries: spend,
      assets: [{ id: 'f', name: 'Fund', class: 'fund', note: '', createdAt: 1, history: { [nowM]: { contributed: 200, value: 5000 } } }],
      debts: [{ id: 'card', name: 'Card', class: 'card', rate: 22, note: '', createdAt: 1, history: { [nowM]: { paid: 100, balance: 4000 } } }],
    });
    expect(find(st, 'inv-costly-debt-card').title).toMatch(/Card charges 22\.0%/);
  });

  it('stays descriptive across every new rule', () => {
    const entries = [-3, -2, -1].flatMap((i) => [
      entry(`${m(i)}-05`, 'earning', 'salary', 1000),
      entry(`${m(i)}-06`, 'expense', 'housing', 900),
    ]);
    const gapped = monthly('big', 'fund', -6, (i) => (i === 0 ? 9000 : 5000));
    gapped.history[m(-2)].contributed = 0;
    const st = state({
      entries,
      assets: [
        gapped,
        // A second fund, so the big one is not its class's only member and the
        // top-holding rule is not folded into the class rule.
        { id: 'small', name: 'Small fund', class: 'fund', note: '', createdAt: 1, history: { [nowM]: { contributed: 0, value: 300 } } },
        { id: 'x', name: 'Coin', class: 'crypto', note: '', createdAt: 1, history: { [nowM]: { contributed: 1000, value: 500 } } },
      ],
      debts: [{ id: 'card', name: 'Card', class: 'card', rate: 22, note: '', createdAt: 1, history: { [nowM]: { paid: 100, balance: 4000 } } }],
    });
    const out = buildSuggestions(st, 'investing');
    const got = out.map((x) => x.id);
    for (const id of ['inv-top-holding-big', 'inv-below-paid-in', 'inv-growth-split', 'inv-rhythm-gaps', 'inv-share-of-income', 'inv-thin-cushion', 'inv-costly-debt-card']) {
      expect(got, id).toContain(id);
    }
    const text = out.map((x) => `${x.title} ${x.body}`).join(' ').toLowerCase();
    expect(text).not.toMatch(/\byou should\b/);
    expect(text).not.toMatch(/\brecommend(ed|s)?\b/);
    expect(text).not.toMatch(/\b(buy|sell) (more|now)\b/);
  });
});

describe('savings follow the kept model', () => {
  // Saved = earned − spent. Transfers into the pot are where kept money sits,
  // not the definition of having kept it.
  const nowM = monthKey(todayKey());
  const m = (i) => addMonthKeys(nowM, i);
  const flow = (months) => months.flatMap(([i, earned, spent]) => [
    entry(`${m(i)}-02`, 'earning', 'salary', earned),
    entry(`${m(i)}-03`, 'expense', 'housing', spent),
  ]);
  const find = (st, section, id) => buildSuggestions(st, section).find((x) => x.id === id);

  it('does not call a month of kept salary a month without saving', () => {
    const st = state({ entries: flow([[-3, 1000, 600], [-2, 1000, 600], [-1, 1000, 600], [0, 1000, 600]]) });
    expect(find(st, 'saving', 'savings-inconsistent')).toBeUndefined();
    const summary = find(st, 'saving', 'savings-summary');
    expect(summary.title).toMatch(/^Kept .*400 of .*1,000 this month$/);
    expect(summary.body).toMatch(/None of it has been moved into savings yet/);
  });

  it('counts months where spending met or passed income', () => {
    const st = state({ entries: flow([[-3, 1000, 500], [-2, 1000, 1200], [-1, 1000, 1200], [0, 1000, 1200]]) });
    expect(find(st, 'saving', 'savings-inconsistent').title).toBe('You kept money in 1 of the last 4 months');
    expect(find(st, 'saving', 'savings-summary').title).toMatch(/^Spent .*200 more than came in/);
  });

  it('gives the same cushion in the savings and investing sections', () => {
    const st = state({
      profile: { openingBalance: 2000, openingSavings: 2000 },
      entries: flow([[-3, 1500, 1000], [-2, 1500, 1000], [-1, 1500, 1000]]),
      assets: [{ id: 'f', name: 'Fund', class: 'fund', note: '', createdAt: 1, history: { [nowM]: { contributed: 0, value: 10000 } } }],
    });
    expect(find(st, 'saving', 'savings-runway').title).toBe('Your cushion: 2.0 months');
    expect(find(st, 'investing', 'inv-thin-cushion').title).toMatch(/cover 2\.0 months/);
  });
});
