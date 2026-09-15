/**
 * What an AI model is allowed to see.
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

export const FOCUSES = [
  { value: 'not-sure', label: 'Not sure — look at everything' },
  { value: 'cushion', label: 'Build an emergency cushion' },
  { value: 'debt', label: 'Pay down debt' },
  { value: 'goal', label: 'Reach a savings goal' },
  { value: 'grow', label: 'Grow money over the long term' },
];

export const defaultAnswers = () => ({
  ageBand: '25–34',
  horizon: 'long',
  risk: 'balanced',
  focus: 'not-sure',
  region: '',
});

const pick = (value, options, fallback) =>
  options.some((o) => (o.value ?? o) === value) ? value : fallback;

export function buildAdviceSummary(state, answers = defaultAnswers(), today = todayKey()) {
  const a = { ...defaultAnswers(), ...answers };

  // Finished months only: a half-done month makes spending look small and the
  // cushion look large.
  const months = [];
  for (let i = 1; i <= 6; i++) {
    const t = financeFor(state, 'month', -i).totals;
    if (t.earning > 0 || t.expense > 0) months.push(t);
  }
  const income = avg(months.map((t) => t.earning));
  const spending = avg(months.map((t) => t.expense));
  const now = financeFor(state, 'month', 0).totals;

  const worth = netWorthOf(state);
  const inv = investmentsFor(state, 12);
  const debts = debtsFor(state, 12);

  const liquid = inv.byClass
    .filter((c) => c.id === 'cash' || c.id === 'bond')
    .reduce((s, c) => s + c.value, 0);
  const cushion = Math.max(0, worth.pot) + liquid;

  const nowM = monthKey(today);
  const paidIn = [1, 2, 3].map((i) => {
    const m = addMonthKeys(nowM, -i);
    return (state.assets || []).reduce((s, x) => s + (Number(x.history?.[m]?.contributed) || 0), 0);
  });

  return {
    currency: state.profile?.currency || 'INR',
    asOfMonth: nowM,
    aboutMe: {
      ageBand: pick(a.ageBand, AGE_BANDS, defaultAnswers().ageBand),
      investmentHorizon: HORIZONS.find((h) => h.value === a.horizon)?.label || HORIZONS[2].label,
      riskTolerance: RISK_LEVELS.find((r) => r.value === a.risk)?.label || RISK_LEVELS[1].label,
      mainFocus: FOCUSES.find((f) => f.value === a.focus)?.label || FOCUSES[0].label,
      countryOrRegion: String(a.region || '').trim().slice(0, 40) || 'Not given',
    },
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
      emergencyCushionMonths: spending > 0 ? Math.round((cushion / spending) * 10) / 10 : null,
    },
    holdingsByAssetClass: inv.byClass.map((c) => ({
      assetClass: c.label,
      riskOnFiveStepScale: c.risk,
      value: round(c.value),
      paidIn: round(c.invested),
      sharePct: round(c.share),
    })),
    averageMonthlyContributionLast3Months: round(avg(paidIn)),
    debts: debts.empty
      ? []
      : debts.rows
          .filter((d) => d.balance > 0)
          .map((d) => ({
            type: d.meta?.label || 'Other',
            balance: round(d.balance),
            annualInterestPct: d.rate ?? null,
            typicalMonthlyPayment: round(d.typicalPayment),
            monthsToClearAtThatPayment: d.payoff?.neverClears ? 'never' : d.payoff?.months ?? null,
          })),
    goals: goalsWithProgress(state, today)
      .filter((g) => !g.complete)
      .map((g, i) => ({
        goal: `Goal ${i + 1}`,
        target: round(g.target),
        saved: round(g.saved),
        monthsLeft: g.monthsLeft === null ? null : Math.max(0, Math.round(g.monthsLeft)),
        neededPerMonth: g.requiredPerMonth === null ? null : round(g.requiredPerMonth),
        recentlySavingPerMonth: round(g.perMonthRecent),
      })),
  };
}
