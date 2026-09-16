/**
 * The AI summary is the only thing in the app that leaves the device, so the
 * test that matters most is what is *not* in it.
 */

import { describe, expect, it } from 'vitest';
import { buildAdviceSummary, defaultAnswers } from './summary';
import { addMonthKeys, monthKey, todayKey } from '../calc';

const nowM = monthKey(todayKey());
const m = (i) => addMonthKeys(nowM, i);
let seq = 0;
const thisMonth = (day) => `${nowM}-${String(day).padStart(2, '0')}`;
const entry = (date, kind, category, amount, title, note = '') => ({
  id: `s${seq++}`, date, kind, category, title, note, amount, createdAt: seq,
});

const secretState = () => ({
  version: 1, onboarded: true,
  profile: { name: 'Priya Sharma', currency: 'EUR', weekStart: 1, monthlyIncome: 4000, savingsTargetPct: 20, budgets: {}, openingBalance: 0, openingSavings: 3000 },
  entries: [-3, -2, -1].flatMap((i) => [
    entry(`${m(i)}-01`, 'earning', 'salary', 4000, 'Salary from Acme Corp', 'employee id 88231'),
    entry(`${m(i)}-04`, 'expense', 'housing', 1500, 'Rent to Mr Kelly', 'flat 4B, Rathmines'),
    entry(`${m(i)}-09`, 'expense', 'dining', 300, 'Dinner at Chez Secret'),
  ]),
  assets: [
    { id: 'a', name: 'Vanguard secret account', class: 'fund', note: 'acct 12345678', createdAt: 1,
      history: { [m(-3)]: { contributed: 300, value: 9000 }, [m(-2)]: { contributed: 300, value: 9400 }, [m(-1)]: { contributed: 300, value: 9900 }, [nowM]: { contributed: 0, value: 10000 } } },
    { id: 'b', name: 'Emergency pot at AIB', class: 'cash', note: '', createdAt: 1, history: { [nowM]: { contributed: 0, value: 2000 } } },
  ],
  debts: [{ id: 'd', name: 'Revolut card ending 4421', class: 'card', rate: 21.9, note: 'secret', createdAt: 1, history: { [nowM]: { paid: 150, balance: 2400 } } }],
  goals: [{ id: 'g', name: 'Wedding in Udaipur', target: 12000, opening: 1000, deadline: `${addMonthKeys(nowM, 18)}-01`, createdAt: 1 }],
  recurring: [], notes: [{ id: 'n', section: 'investing', text: 'Ask Dad about the house', at: 1 }], dismissed: [],
});

describe('buildAdviceSummary', () => {
  const answers = { ...defaultAnswers(), region: 'Ireland', risk: 'growth' };
  const summary = buildAdviceSummary(secretState(), answers);

  const SECRETS = [
    'Priya', 'Acme', '88231', 'Kelly', 'Rathmines', 'Chez Secret', 'Vanguard', '12345678',
    'AIB', 'Revolut', '4421', 'Wedding', 'Udaipur', 'Dad', 'secret',
  ];

  it('carries no names, titles, notes or account details, whatever the topic', () => {
    for (const topic of ['investing', 'spending', 'saving']) {
      const dump = JSON.stringify(buildAdviceSummary(secretState(), answers, topic));
      for (const secret of SECRETS) {
        expect(dump, `${topic} leaked "${secret}"`).not.toContain(secret);
      }
    }
  });

  it('carries the figures general guidance needs', () => {
    expect(summary.currency).toBe('EUR');
    expect(summary.topic).toBe('investing');
    expect(summary.cashFlow.finishedMonthsMeasured).toBe(3);
    expect(summary.cashFlow.typicalMonthlyIncome).toBe(4000);
    expect(summary.cashFlow.typicalMonthlySpending).toBe(1800);
    expect(summary.cashFlow.keptRatePct).toBe(55);
    expect(summary.holdingsByAssetClass.map((h) => h.assetClass).sort()).toEqual(['Cash & liquid', 'Mutual funds']);
    expect(summary.debts).toEqual([
      expect.objectContaining({ type: 'Credit card', balance: 2400, annualInterestPct: 21.9 }),
    ]);
    expect(summary.goals[0]).toEqual(expect.objectContaining({ goal: 'Goal 1', target: 12000 }));
    expect(summary.averageMonthlyContributionLast3Months).toBe(300);
    expect(summary.aboutMe).toEqual(expect.objectContaining({ riskTolerance: 'Growth', countryOrRegion: 'Ireland' }));
  });

  it('asks only the questions a topic needs', () => {
    const spending = buildAdviceSummary(secretState(), { ...answers, household: 'Family with children' }, 'spending').aboutMe;
    expect(spending.household).toBe('Family with children');
    expect(spending).not.toHaveProperty('riskTolerance');
    expect(spending).not.toHaveProperty('ageBand');

    const investing = buildAdviceSummary(secretState(), answers, 'investing').aboutMe;
    expect(investing).not.toHaveProperty('household');
  });

  it('describes spending by category, against the typical month', () => {
    const s = buildAdviceSummary(secretState(), answers, 'spending');
    expect(s.spendingThisMonth.byCategory.map((c) => c.category)).toEqual([]);
    expect(s).not.toHaveProperty('holdingsByAssetClass');

    // A month with entries in it: categories, budgets and commitments appear.
    const withThisMonth = secretState();
    withThisMonth.entries.push(entry(thisMonth(3), 'expense', 'dining', 220, 'Lunch with Ravi'));
    withThisMonth.profile.budgets = { dining: 300 };
    withThisMonth.recurring = [
      { id: 'r1', kind: 'expense', category: 'bills', title: 'Netflix for Priya', amount: 15, frequency: 'monthly', active: true },
      { id: 'r2', kind: 'expense', category: 'bills', title: 'Insurance', amount: 600, frequency: 'yearly', active: true },
    ];
    const s2 = buildAdviceSummary(withThisMonth, answers, 'spending');
    expect(s2.spendingThisMonth.byCategory[0]).toEqual(expect.objectContaining({ category: 'Food & Dining', spent: 220, typicalMonth: 300 }));
    expect(s2.budgets).toEqual([expect.objectContaining({ category: 'Food & Dining', monthlyCap: 300, spentThisMonth: 220 })]);
    expect(s2.recurringCommitments).toEqual({ count: 2, monthlyTotal: 65 });
    expect(JSON.stringify(s2)).not.toContain('Ravi');
    expect(JSON.stringify(s2)).not.toContain('Netflix');
  });

  it('describes saving month by month, with the cushion and the goals', () => {
    const s = buildAdviceSummary(secretState(), answers, 'saving');
    expect(s.keptByMonth).toHaveLength(3);
    expect(s.keptByMonth[0]).toEqual(expect.objectContaining({ income: 4000, spending: 1800, kept: 2200 }));
    expect(s.keptByMonth[0].month < s.keptByMonth[2].month).toBe(true);
    expect(s.cushion).toEqual(expect.objectContaining({ savingsPot: 3000, cashLikeHoldings: 2000 }));
    expect(s.goals[0].goal).toBe('Goal 1');
    expect(s).not.toHaveProperty('spendingThisMonth');
  });

  it('refuses answers outside the offered options, and caps the free text', () => {
    const s = buildAdviceSummary(secretState(), {
      ageBand: '<script>', horizon: 'forever', risk: 'yolo', household: 'x',
      focus: { investing: 'x' }, region: 'a'.repeat(200), note: 'b'.repeat(500),
    });
    expect(s.aboutMe.ageBand).toBe(defaultAnswers().ageBand);
    expect(s.aboutMe.riskTolerance).toBe('Balanced');
    expect(s.aboutMe.mainFocus).toBe('Not sure — look at everything');
    expect(s.aboutMe.countryOrRegion).toHaveLength(40);
    expect(s.aboutMe.anythingElse).toHaveLength(200);
  });
});
