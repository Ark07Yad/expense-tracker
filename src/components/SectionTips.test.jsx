/**
 * @vitest-environment jsdom
 */

/**
 * Suggestion boxes on Trends (spending) and Settings (budgets).
 *
 * The behaviour worth pinning: an action the screen can take in place is taken
 * in place, an action pointing at the current screen does nothing rather than
 * "navigating" to it, and a budget box speaks even before anything is logged —
 * "set a budget" is exactly the advice a new user needs.
 */

import { describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import SectionTips from './SectionTips';
import { entry, renderWithStore, seed } from '../test/render';
import { monthKey, todayKey } from '../lib/calc';

const day = (n) => `${monthKey(todayKey())}-${String(n).padStart(2, '0')}`;

describe('budget suggestions', () => {
  it('suggests setting budgets with an empty ledger, and scrolls in place', async () => {
    seed({});
    const budgets = vi.fn();
    const onNavigate = vi.fn();
    const { user } = renderWithStore(
      <SectionTips section="budgets" hide={['empty']} intents={{ budgets }} here="settings" onNavigate={onNavigate} />
    );

    expect(screen.getByText('No budgets set yet')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /set budgets/i }));
    expect(budgets).toHaveBeenCalledTimes(1);
    expect(onNavigate).not.toHaveBeenCalled();
  });

  it('names a blown budget', () => {
    seed({
      profile: { budgets: { dining: 4000 } },
      entries: [entry({ date: day(1), amount: 9000 })],
    });
    renderWithStore(<SectionTips section="budgets" hide={['empty']} here="settings" />);
    expect(screen.getByText('1 budget is blown')).toBeInTheDocument();
  });

  it('does not navigate to the screen it is already on', async () => {
    seed({ profile: { monthlyIncome: 1000, budgets: { dining: 4000 } } });
    const onNavigate = vi.fn();
    const { user } = renderWithStore(
      <SectionTips section="budgets" hide={['empty']} here="settings" onNavigate={onNavigate} />
    );
    await user.click(screen.getByRole('button', { name: /adjust budgets/i }));
    expect(onNavigate).not.toHaveBeenCalled();
  });
});

describe('spending suggestions', () => {
  it('hides the log-a-few-days card, which the screen already says', () => {
    seed({});
    renderWithStore(<SectionTips section="spending" hide={['empty']} quiet="Quiet month." />);
    expect(screen.queryByText(/Log a few days/)).toBeNull();
    expect(screen.getByText('Quiet month.')).toBeInTheDocument();
  });

  it('navigates elsewhere when the screen cannot act in place', async () => {
    // Trends has no budget editor, so "Set budgets" has to go to Settings.
    seed({
      entries: [
        entry({ date: day(1), kind: 'earning', category: 'salary', amount: 85000 }),
        entry({ date: day(2), category: 'dining', amount: 30000 }),
        entry({ date: day(3), category: 'transport', amount: 20000 }),
      ],
    });
    const onNavigate = vi.fn();
    const { user } = renderWithStore(
      <SectionTips section="spending" hide={['empty']} here="analytics" onNavigate={onNavigate} />
    );
    await user.click(screen.getByRole('button', { name: /set budgets/i }));
    expect(onNavigate).toHaveBeenCalledWith('settings');
  });
});

describe('one box, several sections', () => {
  const sections = [
    { value: 'spending', label: 'Spending suggestions', quiet: 'Spending is quiet.' },
    { value: 'income', label: 'Income suggestions' },
    { value: 'saving', label: 'Savings suggestions' },
  ];

  it('switches between spending, income and savings', async () => {
    seed({ entries: [entry({ date: day(2), category: 'dining', amount: 500 })] });
    const onNavigate = vi.fn();
    const { user } = renderWithStore(
      <SectionTips section="spending" sections={sections} hide={['empty']} here="analytics" onNavigate={onNavigate} />
    );

    expect(screen.getByRole('region', { name: 'Spending suggestions' })).toBeInTheDocument();

    await user.click(screen.getByRole('tab', { name: 'Income' }));
    expect(screen.getByRole('region', { name: 'Income suggestions' })).toBeInTheDocument();
    expect(screen.getByText('Nothing logged as income this month')).toBeInTheDocument();

    await user.click(screen.getByRole('tab', { name: 'Savings' }));
    // No income logged, so what was kept cannot be measured yet.
    expect(screen.getByText('What you kept is not measurable yet')).toBeInTheDocument();

    // Notes follow the section on show, not the one the box started on.
    await user.click(screen.getByRole('button', { name: /notes/i }));
    expect(onNavigate).toHaveBeenCalledWith('section:saving');
  });

  it('counts dismissals per section', async () => {
    seed({ entries: [entry({ date: day(2), category: 'dining', amount: 500 })] });
    const { user } = renderWithStore(
      <SectionTips section="income" sections={sections} hide={['empty']} here="analytics" />
    );
    const card = screen.getByText('Nothing logged as income this month').closest('.p-4');
    await user.click(card.querySelector('button[aria-label="Dismiss"]'));
    expect(screen.getByRole('button', { name: /restore 1/i })).toBeInTheDocument();

    await user.click(screen.getByRole('tab', { name: 'Spending' }));
    expect(screen.queryByRole('button', { name: /restore/i })).toBeNull();
  });
});
