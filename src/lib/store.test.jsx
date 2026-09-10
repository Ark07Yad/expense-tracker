/**
 * @vitest-environment jsdom
 */

/**
 * Reducer behaviour that no pure module covers.
 *
 * Specifically the tags. A schedule that posts an untagged entry looks entirely
 * correct — the money is in the ledger, the totals are right — while the debt
 * it was paying and the goal it was feeding never hear about it. That failure
 * is silent by construction, so it is worth pinning at the level where the
 * copying actually happens.
 */

import { describe, expect, it } from 'vitest';
import { act } from '@testing-library/react';
import { renderWithStore, seed, store } from '../test/render';
import { addMonths, todayKey } from './calc';

const overdueRule = (over = {}) => ({
  id: 'r1',
  kind: 'expense',
  category: 'debt',
  title: 'Loan payment',
  note: '',
  amount: 400,
  frequency: 'monthly',
  anchorDate: addMonths(todayKey(), -1),
  lastResolved: null,
  active: true,
  createdAt: 1,
  ...over,
});

const mount = (state) => {
  seed(state);
  renderWithStore(<div />);
};

describe('addRecurring', () => {
  it('keeps a debt tag on an expense rule', () => {
    mount();
    act(() => {
      store().dispatch({
        type: 'addRecurring',
        rule: { kind: 'expense', category: 'debt', title: 'Loan', amount: 400, debtId: 'loan1' },
      });
    });
    expect(store().state.recurring[0].debtId).toBe('loan1');
  });

  it('keeps a goal tag on a saving rule', () => {
    mount();
    act(() => {
      store().dispatch({
        type: 'addRecurring',
        rule: { kind: 'saving', category: 'goal', title: 'Transfer', amount: 200, goalId: 'trip' },
      });
    });
    expect(store().state.recurring[0].goalId).toBe('trip');
  });

  it('refuses a tag that does not belong to the kind', () => {
    // An expense cannot feed a goal, and a saving cannot pay a debt.
    mount();
    act(() => {
      store().dispatch({
        type: 'addRecurring',
        rule: { kind: 'expense', category: 'debt', title: 'Loan', amount: 400, goalId: 'trip' },
      });
    });
    expect(store().state.recurring[0].goalId).toBeUndefined();
  });
});

describe('resolveDue', () => {
  it('carries the debt tag onto every entry it posts', () => {
    // The whole point: a scheduled payment the debt can actually see.
    mount({ recurring: [overdueRule({ debtId: 'loan1' })] });
    const due = store().state.recurring[0];

    act(() => {
      store().dispatch({
        type: 'resolveDue',
        items: [{ ruleId: due.id, date: addMonths(todayKey(), -1), post: true }],
      });
    });

    const [entry] = store().state.entries;
    expect(entry).toMatchObject({ kind: 'expense', category: 'debt', amount: 400, debtId: 'loan1' });
    expect(entry.fromRule).toBe('r1');
  });

  it('carries the goal tag on a saving rule', () => {
    mount({
      recurring: [overdueRule({ kind: 'saving', category: 'goal', goalId: 'trip', debtId: undefined })],
    });
    act(() => {
      store().dispatch({
        type: 'resolveDue',
        items: [{ ruleId: 'r1', date: addMonths(todayKey(), -1), post: true }],
      });
    });
    expect(store().state.entries[0].goalId).toBe('trip');
  });

  it('writes nothing for a skipped occurrence but still advances the rule', () => {
    mount({ recurring: [overdueRule({ debtId: 'loan1' })] });
    const date = addMonths(todayKey(), -1);
    act(() => {
      store().dispatch({ type: 'resolveDue', items: [{ ruleId: 'r1', date, post: false }] });
    });
    expect(store().state.entries).toHaveLength(0);
    expect(store().state.recurring[0].lastResolved).toBe(date);
  });
});

describe('updateRecurring', () => {
  it('drops a tag that no longer belongs when the kind changes', () => {
    mount({ recurring: [overdueRule({ debtId: 'loan1' })] });
    act(() => {
      store().dispatch({
        type: 'updateRecurring',
        id: 'r1',
        patch: { kind: 'saving', category: 'goal' },
      });
    });
    expect(store().state.recurring[0].debtId).toBeUndefined();
  });

  it('leaves a tag alone when the kind is unchanged', () => {
    mount({ recurring: [overdueRule({ debtId: 'loan1' })] });
    act(() => {
      store().dispatch({ type: 'updateRecurring', id: 'r1', patch: { amount: 500 } });
    });
    expect(store().state.recurring[0].debtId).toBe('loan1');
    expect(store().state.recurring[0].amount).toBe(500);
  });
});

describe('deleteDebt', () => {
  it('untags the payments but keeps them', () => {
    // They were real expenses that really happened; removing them would change
    // every past month's spending.
    mount({
      entries: [{
        id: 'e1', date: todayKey(), kind: 'expense', category: 'debt',
        title: 'Payment', note: '', amount: 400, createdAt: 1, debtId: 'loan1',
      }],
      debts: [{ id: 'loan1', name: 'Loan', class: 'personal', note: '', rate: 10, createdAt: 1, history: {} }],
    });

    act(() => store().dispatch({ type: 'deleteDebt', id: 'loan1' }));

    expect(store().state.debts).toHaveLength(0);
    expect(store().state.entries).toHaveLength(1);
    expect(store().state.entries[0].debtId).toBeUndefined();
  });
});
