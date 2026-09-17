/**
 * What an AI model is allowed to see.
 *
 * Three topics — investing, spending, saving — because the same ledger answers
 * three different questions, and sending the whole lot every time would be both
 * noisier for the model and more than the question needs.
 *
 * The rest of the app never sends anything anywhere, so the one place that
 * does has to be narrow on purpose: aggregates only — what came in, what went
 * out, what is held by asset class, what is owed by debt type, what goals
 * need. No entry titles, no notes, no holding, debt or goal names, no dates
 * finer than a month. The person sees this exact object before anything is
 * sent, which is the other half of the promise.
 *
 * Whole numbers throughout: pence and paise add nothing to general guidance
 * and make the preview harder to read.
 */

import { debtsFor, financeFor, investmentsFor, netWorthOf } from '../useFinance';
import { goalsWithProgress } from '../goals';
import { addMonthKeys, monthKey, todayKey } from '../calc';

const round = (v) => Math.round(Number(v) || 0);
const avg = (list) => (list.length ? list.reduce((s, x) => s + x, 0) / list.length : 0);

export const AGE_BANDS = ['Under 25', '25–34', '35–44', '45–54', '55–64', '65 or over'];

export const HOUSEHOLDS = ['Just me', 'Two adults', 'Family with children', 'Sharing with others'];

export const HORIZONS = [
  { value: 'short', label: 'Under 3 years' },
  { value: 'medium', label: '3–10 years' },
  { value: 'long', label: '10+ years' },
];

export const RISK_LEVELS = [
  { value: 'cautious', label: 'Cautious', blurb: 'A fall in value would worry me a lot' },
  { value: 'balanced', label: 'Balanced', blurb: 'I can ride out some ups and downs' },
  { value: 'growth', label: 'Growth', blurb: 'I accept big swings for long-term growth' },
];

export const FOCUSES = {
  investing: [
    { value: 'not-sure', label: 'Not sure — look at everything' },
    { value: 'cushion', label: 'Build an emergency cushion' },
    { value: 'debt', label: 'Pay down debt' },
    { value: 'goal', label: 'Reach a savings goal' },
    { value: 'grow', label: 'Grow money over the long term' },
  ],
  spending: [
    { value: 'not-sure', label: 'Not sure — look at everything' },
    { value: 'understand', label: 'Understand where it goes' },
    { value: 'cut', label: 'Bring the total down' },
    { value: 'free-up', label: 'Free up money for saving' },
    { value: 'steady', label: 'Stop running out before month end' },
  ],
  saving: [
    { value: 'not-sure', label: 'Not sure — look at everything' },
    { value: 'cushion', label: 'Build an emergency cushion' },
    { value: 'more', label: 'Keep more each month' },
    { value: 'goal', label: 'Reach a goal on time' },
    { value: 'where', label: 'Decide where savings should sit' },
  ],
  budgets: [
    { value: 'not-sure', label: 'Not sure — look at everything' },
    { value: 'first', label: 'Set my first budgets' },
    { value: 'realistic', label: 'Make the ones I have realistic' },
    { value: 'overspend', label: 'Stop blowing them mid-month' },
    { value: 'free-up', label: 'Free up money for saving' },
  ],
  debt: [
    { value: 'not-sure', label: 'Not sure — look at everything' },
    { value: 'order', label: 'Decide what to clear first' },
    { value: 'fastest', label: 'Clear it as fast as I can' },
    { value: 'payments', label: 'Make the monthly payments manageable' },
    { value: 'balance', label: 'Balance paying debt against saving' },
  ],
};

/** Which questions each topic actually needs. Age and risk say nothing about groceries. */
export const QUESTIONS = {
  investing: ['ageBand', 'horizon', 'risk', 'focus', 'region', 'note'],
  spending: ['household', 'focus', 'region', 'note'],
  saving: ['horizon', 'household', 'focus', 'region', 'note'],
  budgets: ['household', 'focus', 'region', 'note'],
  debt: ['household', 'focus', 'region', 'note'],
};

export const TOPIC_META = {
  investing: { label: 'investing', question: 'What should I do with what I have?' },
  spending: { label: 'spending', question: 'Where is my money going, and what should change?' },
  saving: { label: 'saving', question: 'What should happen to what I keep?' },
  budgets: { label: 'budgets', question: 'What should each month\'s limits be?' },
  debt: { label: 'what you owe', question: 'What should I pay, and in what order?' },
};

export const TOPICS = Object.keys(TOPIC_META);

export const defaultAnswers = () => ({
  ageBand: '25–34',
  horizon: 'long',
  risk: 'balanced',
  household: 'Just me',
  focus: { investing: 'not-sure', spending: 'not-sure', saving: 'not-sure' },
  region: '',
  note: '',
});

const optionLabel = (options, value, fallback) =>
  options.find((o) => o.value === value)?.label || options.find((o) => o.value === fallback).label;

export function buildAdviceSummary(state, answers = defaultAnswers(), topic = 'investing', today = todayKey()) {
  const a = { ...defaultAnswers(), ...answers, focus: { ...defaultAnswers().focus, ...answers?.focus } };
  const asked = QUESTIONS[topic] || QUESTIONS.investing;
  const focuses = FOCUSES[topic] || FOCUSES.investing;

  // Finished months only: a half-done month makes spending look small and the
  // cushion look large.
  const months = [];
  for (let i = 1; i <= 6; i++) {
    const f = financeFor(state, 'month', -i);
    if (f.totals.earning > 0 || f.totals.expense > 0) months.push({ key: addMonthKeys(monthKey(today), -i), f });
  }
  const income0 = avg(months.map((m) => m.f.totals.earning));
  /** The measured average; `budgetTotals` prefers the income the person declared. */
  const income = income0;
  const spending = avg(months.map((m) => m.f.totals.expense));
  const current = financeFor(state, 'month', 0);
  const now = current.totals;

  const worth = netWorthOf(state);
  const inv = investmentsFor(state, 12);
  const debts = debtsFor(state, 12);

  const liquid = inv.byClass
    .filter((c) => c.id === 'cash' || c.id === 'bond')
    .reduce((s, c) => s + c.value, 0);
  const cushion = Math.max(0, worth.pot) + liquid;
  const cushionMonths = spending > 0 ? Math.round((cushion / spending) * 10) / 10 : null;

  const aboutMe = { mainFocus: optionLabel(focuses, a.focus[topic], 'not-sure') };
  if (asked.includes('ageBand')) aboutMe.ageBand = AGE_BANDS.includes(a.ageBand) ? a.ageBand : defaultAnswers().ageBand;
  if (asked.includes('horizon')) aboutMe.timeHorizon = optionLabel(HORIZONS, a.horizon, 'long');
  if (asked.includes('risk')) aboutMe.riskTolerance = optionLabel(RISK_LEVELS, a.risk, 'balanced');
  if (asked.includes('household')) aboutMe.household = HOUSEHOLDS.includes(a.household) ? a.household : HOUSEHOLDS[0];
  aboutMe.countryOrRegion = String(a.region || '').trim().slice(0, 40) || 'Not given';
  const note = String(a.note || '').trim().slice(0, 200);
  if (note) aboutMe.anythingElse = note;

  const summary = {
    topic,
    currency: state.profile?.currency || 'INR',
    asOfMonth: monthKey(today),
    aboutMe,
    cashFlow: {
      finishedMonthsMeasured: months.length,
      typicalMonthlyIncome: round(income),
      typicalMonthlySpending: round(spending),
      typicalMonthlyKept: round(income - spending),
      keptRatePct: income > 0 ? round(((income - spending) / income) * 100) : null,
      savingsTargetPct: round(state.profile?.savingsTargetPct),
      thisMonthSoFar: { income: round(now.earning), spending: round(now.expense) },
    },
    balances: {
      netWorth: round(worth.netWorth),
      freeToSpend: round(worth.spendable),
      savingsPot: round(Math.max(0, worth.pot)),
      invested: round(worth.investments),
      owed: round(worth.owed),
      emergencyCushionMonths: cushionMonths,
    },
  };

  if (topic === 'investing') {
    const nowM = monthKey(today);
    const paidIn = [1, 2, 3].map((i) => {
      const m = addMonthKeys(nowM, -i);
      return (state.assets || []).reduce((s, x) => s + (Number(x.history?.[m]?.contributed) || 0), 0);
    });
    summary.holdingsByAssetClass = inv.byClass.map((c) => ({
      assetClass: c.label,
      riskOnFiveStepScale: c.risk,
      value: round(c.value),
      paidIn: round(c.invested),
      sharePct: round(c.share),
    }));
    summary.averageMonthlyContributionLast3Months = round(avg(paidIn));
    summary.debts = debtRows(debts);
    summary.goals = goalRows(state, today);
    return summary;
  }

  // Typical per category across the finished months, so a cap can be judged
  // against habit rather than against one unusual month.
  const typicalByCategory = () => {
    const out = new Map();
    for (const m of months) {
      for (const c of m.f.expenseCats) {
        const row = out.get(c.id) || { label: c.label, total: 0 };
        row.total += c.total;
        out.set(c.id, row);
      }
    }
    return out;
  };
  const perMonth = (map, id) => round((map.get(id)?.total || 0) / (months.length || 1));

  if (topic === 'spending') {
    const typical = typicalByCategory();

    summary.spendingThisMonth = {
      total: round(now.expense),
      projectedByMonthEnd: round(current.projectedExpense),
      dailyBurn: round(current.dailyBurn),
      biggestSingleExpense: round(current.biggest?.amount || 0),
      byCategory: current.expenseCats.slice(0, 12).map((c) => ({
        category: c.label,
        spent: round(c.total),
        sharePct: round(c.share),
        entries: c.count,
        typicalMonth: perMonth(typical, c.id),
      })),
    };
    summary.budgets = current.budgets
      .filter((b) => b.cap > 0)
      .map((b) => ({ category: b.label, monthlyCap: round(b.cap), spentThisMonth: round(b.spent), status: b.status }));
    summary.biggestChangesVsLastMonth = current.movers.slice(0, 5).map((m) => ({
      category: m.label,
      changeVsLastMonth: round(m.delta),
    }));

    const rules = (state.recurring || []).filter((r) => r.active !== false && r.kind === 'expense');
    const MONTHLY_FACTOR = { weekly: 52 / 12, monthly: 1, yearly: 1 / 12 };
    summary.recurringCommitments = {
      count: rules.length,
      monthlyTotal: round(rules.reduce((s, r) => s + (Number(r.amount) || 0) * (MONTHLY_FACTOR[r.frequency] ?? 1), 0)),
    };
    summary.debts = debtRows(debts);
    return summary;
  }

  // Oldest first, so a trend reads left to right.
  if (topic === 'budgets') {
    const typical = typicalByCategory();
    const capped = new Set(Object.keys(state.profile?.budgets || {}).filter((id) => state.profile.budgets[id] > 0));
    const declaredIncome = round(state.profile?.monthlyIncome) || round(income0);
    const capsTotal = current.budgets.filter((b) => b.cap > 0).reduce((s, b) => s + b.cap, 0);
    const savingsTarget = (declaredIncome * (round(state.profile?.savingsTargetPct) || 0)) / 100;

    summary.budgets = current.budgets
      .filter((b) => b.cap > 0)
      .map((b) => ({
        category: b.label,
        monthlyCap: round(b.cap),
        spentThisMonth: round(b.spent),
        typicalMonth: perMonth(typical, b.id),
        status: b.status,
      }));
    summary.categoriesWithNoCap = [...typical.entries()]
      .filter(([id]) => !capped.has(id))
      .map(([id, row]) => ({ category: row.label, typicalMonth: perMonth(typical, id) }))
      .filter((c) => c.typicalMonth > 0)
      .sort((x, y) => y.typicalMonth - x.typicalMonth)
      .slice(0, 10);
    summary.budgetTotals = {
      declaredMonthlyIncome: declaredIncome,
      capsTotal: round(capsTotal),
      savingsTargetAmount: round(savingsTarget),
      unallocated: round(declaredIncome - capsTotal - savingsTarget),
      typicalTotalSpending: round(spending),
    };
    summary.progressThroughMonthPct = round(current.progress * 100);
    return summary;
  }

  if (topic === 'debt') {
    summary.debts = debtRows(debts);
    summary.debtTotals = debts.empty
      ? { owed: 0 }
      : {
          owed: round(debts.owed),
          paidThisMonth: round(debts.paidThisMonth),
          interestThisMonth: round(debts.interestTotal?.amount || 0),
          interestBasis: debts.interestTotal?.basis || 'none',
        };
    summary.cushion = {
      savingsPot: round(Math.max(0, worth.pot)),
      cashLikeHoldings: round(liquid),
      monthsOfTypicalSpending: cushionMonths,
    };
    summary.investedTotal = round(worth.investments);
    return summary;
  }

  summary.keptByMonth = months
    .toReversed()
    .map((m) => ({
      month: m.key,
      income: round(m.f.totals.earning),
      spending: round(m.f.totals.expense),
      kept: round(m.f.totals.saved),
      movedIntoSavings: round(m.f.totals.setAside),
    }));
  summary.movedIntoSavingsThisMonth = round(now.setAside);
  summary.cushion = {
    savingsPot: round(Math.max(0, worth.pot)),
    cashLikeHoldings: round(liquid),
    monthsOfTypicalSpending: cushionMonths,
  };
  summary.goals = goalRows(state, today);
  summary.debts = debtRows(debts);
  return summary;
}

function debtRows(debts) {
  return debts.empty
    ? []
    : debts.rows
        .filter((d) => d.balance > 0)
        .map((d) => ({
          type: d.meta?.label || 'Other',
          balance: round(d.balance),
          annualInterestPct: d.rate ?? null,
          typicalMonthlyPayment: round(d.typicalPayment),
          monthsToClearAtThatPayment: d.payoff?.neverClears ? 'never' : d.payoff?.months ?? null,
        }));
}

function goalRows(state, today) {
  return goalsWithProgress(state, today)
    .filter((g) => !g.complete)
    .map((g, i) => ({
      goal: `Goal ${i + 1}`,
      target: round(g.target),
      saved: round(g.saved),
      monthsLeft: g.monthsLeft === null ? null : Math.max(0, Math.round(g.monthsLeft)),
      neededPerMonth: g.requiredPerMonth === null ? null : round(g.requiredPerMonth),
      recentlySavingPerMonth: round(g.perMonthRecent),
    }));
}
