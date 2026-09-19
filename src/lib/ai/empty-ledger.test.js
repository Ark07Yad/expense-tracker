/**
 * @vitest-environment jsdom
 */
import { describe, expect, it } from 'vitest';
import { TOPICS, buildAdviceSummary, defaultAnswers } from './summary';
import { seedState } from '../../test/render';
import { addMonths, todayKey } from '../calc';

const badNumbers = (value, path = '') => {
  const out = [];
  if (typeof value === 'number' && !Number.isFinite(value)) out.push(`${path} = ${value}`);
  else if (Array.isArray(value)) value.forEach((v, i) => out.push(...badNumbers(v, `${path}[${i}]`)));
  else if (value && typeof value === 'object') {
    for (const [k, v] of Object.entries(value)) out.push(...badNumbers(v, path ? `${path}.${k}` : k));
  }
  return out;
};

describe('a brand-new ledger', () => {
  it('produces a sendable summary for every topic, with no NaN or Infinity', () => {
    const state = seedState({});
    for (const topic of TOPICS) {
      const summary = buildAdviceSummary(state, defaultAnswers(), topic);
      expect(badNumbers(summary), topic).toEqual([]);
      expect(() => JSON.stringify(summary), topic).not.toThrow();
      expect(summary.cashFlow.finishedMonthsMeasured, topic).toBe(0);
    }
  });

  it('survives a ledger where everything is dated in the future', () => {
    const later = addMonths(todayKey(), 2);
    const state = seedState({
      entries: [
        { id: 'a', date: later, kind: 'earning', category: 'salary', title: 'x', note: '', amount: 5000, createdAt: 1 },
        { id: 'b', date: later, kind: 'expense', category: 'dining', title: 'y', note: '', amount: 500, createdAt: 2 },
      ],
    });
    for (const topic of TOPICS) {
      const summary = buildAdviceSummary(state, defaultAnswers(), topic);
      expect(badNumbers(summary), topic).toEqual([]);
    }
  });

  it('survives holdings and debts with no history at all', () => {
    const state = seedState({
      assets: [{ id: 'a', name: 'Fund', class: 'fund', note: '', createdAt: 1, history: {} }],
      debts: [{ id: 'd', name: 'Card', class: 'card', rate: null, note: '', createdAt: 1, history: {} }],
      goals: [{ id: 'g', name: 'Trip', target: 0, opening: 0, deadline: null, createdAt: 1 }],
    });
    for (const topic of TOPICS) {
      const summary = buildAdviceSummary(state, defaultAnswers(), topic);
      expect(badNumbers(summary), topic).toEqual([]);
    }
  });
});
