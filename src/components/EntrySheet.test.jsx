/**
 * @vitest-environment jsdom
 */

/**
 * The entry composer.
 *
 * This is the form the whole app is fed through, and it has already produced
 * two silent failures: the reducer whitelisted fields, so a selected goal and a
 * foreign-currency block were both dropped on save while the UI happily showed
 * them selected; and the currency symbol read the store rather than the
 * in-progress choice. Both are pinned here.
 */

import { describe, expect, it, vi } from 'vitest';
import { screen, within } from '@testing-library/react';
import EntrySheet from './EntrySheet';
import { renderWithStore, seed, store } from '../test/render';

const open = (props = {}) =>
  renderWithStore(<EntrySheet open onClose={() => {}} defaultDate="2026-09-02" {...props} />);

const amountField = () => screen.getByPlaceholderText('0');
const titleField = () => screen.getByPlaceholderText(/Food & Dining|Rent & Housing|Salary|Emergency fund/);
const saveButton = () => screen.getByRole('button', { name: /^Log |Save changes/ });

describe('validation', () => {
  it('refuses an entry with no amount, and says why', async () => {
    seed();
    const onClose = vi.fn();
    const { user } = open({ onClose });

    await user.click(saveButton());

    expect(screen.getByText('Enter an amount above zero.')).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
    expect(store().state.entries).toHaveLength(0);
  });

  it('saves once the amount is real', async () => {
    seed();
    const onClose = vi.fn();
    const { user } = open({ onClose });

    await user.type(amountField(), '250');
    await user.type(titleField(), 'Lunch');
    await user.click(saveButton());

    expect(onClose).toHaveBeenCalled();
    const [entry] = store().state.entries;
    expect(entry).toMatchObject({ amount: 250, title: 'Lunch', kind: 'expense', date: '2026-09-02' });
  });

  it('falls back to a title rather than saving a blank one', async () => {
    seed();
    const { user } = open();
    await user.type(amountField(), '99');
    await user.click(saveButton());
    expect(store().state.entries[0].title).toBe('Untitled');
  });
});

describe('switching kind', () => {
  it('moves the category to one valid for the new kind', async () => {
    // "Groceries" is not a kind of earning; leaving it selected would file the
    // entry under a category that view never shows.
    seed();
    const { user } = open();

    // "Groceries" appears both as a quick-add chip and as a category, so the
    // query has to be scoped to the category group.
    const categories = screen.getByText('Category').parentElement;
    await user.click(within(categories).getByRole('button', { name: 'Groceries' }));
    await user.click(screen.getByRole('button', { name: /^Earning/ }));
    await user.type(amountField(), '5000');
    await user.click(saveButton());

    const [entry] = store().state.entries;
    expect(entry.kind).toBe('earning');
    expect(['salary', 'freelance', 'business', 'interest', 'dividend', 'rental', 'refund', 'gift-in', 'other-earning'])
      .toContain(entry.category);
  });

  it('relabels the save button for the chosen kind', async () => {
    seed();
    const { user } = open();
    expect(saveButton()).toHaveTextContent('Log expense');
    await user.click(screen.getByRole('button', { name: /^Saving/ }));
    expect(saveButton()).toHaveTextContent('Log saving');
  });
});

describe('goal tagging', () => {
  const withGoal = () =>
    seed({
      goals: [{ id: 'trip', name: 'Japan trip', target: 3000, opening: 0, deadline: null, note: '', createdAt: 1, archived: false }],
    });

  it('offers goals only for savings', async () => {
    withGoal();
    const { user } = open();

    expect(screen.queryByText('Toward a goal')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /^Saving/ }));
    expect(screen.getByText('Toward a goal')).toBeInTheDocument();
  });

  it('actually stores the tag', async () => {
    // The regression: the reducer built entries field by field, so goalId was
    // dropped. The composer showed the goal selected and saved without it.
    withGoal();
    const { user } = open();

    await user.click(screen.getByRole('button', { name: /^Saving/ }));
    await user.type(amountField(), '400');
    await user.click(screen.getByRole('button', { name: /Japan trip/ }));
    await user.click(saveButton());

    expect(store().state.entries[0]).toMatchObject({ kind: 'saving', goalId: 'trip', amount: 400 });
  });

  it('drops the tag if the kind is switched away from saving', async () => {
    withGoal();
    const { user } = open();

    await user.click(screen.getByRole('button', { name: /^Saving/ }));
    await user.click(screen.getByRole('button', { name: /Japan trip/ }));
    await user.click(screen.getByRole('button', { name: /^Expense/ }));
    await user.type(amountField(), '100');
    await user.click(saveButton());

    expect(store().state.entries[0].goalId).toBeUndefined();
  });
});

describe('repeating', () => {
  it('creates a schedule alongside the entry', async () => {
    seed();
    const { user } = open();

    await user.type(amountField(), '25500');
    await user.type(titleField(), 'Rent');
    await user.click(within(screen.getByText('Repeats').parentElement).getByRole('tab', { name: 'Monthly' }));
    await user.click(saveButton());

    const { entries, recurring } = store().state;
    expect(entries).toHaveLength(1);
    expect(recurring).toHaveLength(1);
    expect(recurring[0]).toMatchObject({ title: 'Rent', amount: 25500, frequency: 'monthly', anchorDate: '2026-09-02' });
  });

  it('marks the schedule resolved for today, so it does not offer a duplicate', async () => {
    // Without this the queue would immediately offer the same day back, and
    // the first thing a new schedule did would be to duplicate its own entry.
    seed();
    const { user } = open();

    await user.type(amountField(), '700');
    await user.click(within(screen.getByText('Repeats').parentElement).getByRole('tab', { name: 'Monthly' }));
    await user.click(saveButton());

    expect(store().state.recurring[0].lastResolved).toBe('2026-09-02');
  });

  it('stays a one-off by default', async () => {
    seed();
    const { user } = open();
    await user.type(amountField(), '50');
    await user.click(saveButton());
    expect(store().state.recurring).toHaveLength(0);
  });
});

describe('foreign payments', () => {
  it('converts once and keeps the rate as provenance', async () => {
    seed({ profile: { currency: 'INR' } });
    const { user } = open();

    await user.click(screen.getByRole('button', { name: /Paid in another currency/ }));
    const [, paid, rate] = screen.getAllByRole('textbox').filter((el) => el.inputMode === 'decimal');
    await user.type(paid, '45');
    await user.type(rate, '92.4');
    await user.type(titleField(), 'Dinner in Berlin');
    await user.click(saveButton());

    const [entry] = store().state.entries;
    // The ledger stays in the home currency; the block records what was paid.
    expect(entry.amount).toBeCloseTo(4158, 0);
    expect(entry.fx).toMatchObject({ amount: 45, rate: 92.4 });
  });

  it('clears the block when switched back off', async () => {
    seed();
    const { user } = open();

    await user.click(screen.getByRole('button', { name: /Paid in another currency/ }));
    await user.click(screen.getByRole('button', { name: /Not a foreign payment/ }));
    await user.type(amountField(), '300');
    await user.click(saveButton());

    expect(store().state.entries[0].fx).toBeUndefined();
  });
});

describe('editing', () => {
  const existing = {
    id: 'x1', date: '2026-09-01', kind: 'expense', category: 'transport',
    title: 'Cab', note: 'Airport', amount: 462, createdAt: 1,
  };

  it('seeds the form from the entry', () => {
    seed({ entries: [existing] });
    open({ editing: existing });
    expect(screen.getByDisplayValue('Cab')).toBeInTheDocument();
    expect(screen.getByDisplayValue('462')).toBeInTheDocument();
    expect(saveButton()).toHaveTextContent('Save changes');
  });

  it('updates in place rather than adding a second entry', async () => {
    seed({ entries: [existing] });
    const { user } = open({ editing: existing });

    const title = screen.getByDisplayValue('Cab');
    await user.clear(title);
    await user.type(title, 'Taxi home');
    await user.click(saveButton());

    const { entries } = store().state;
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ id: 'x1', title: 'Taxi home', amount: 462 });
  });

  it('does not offer a repeat when editing', () => {
    // Turning an existing entry into a schedule retroactively raises questions
    // about the entries already logged; the Scheduled list is the honest place.
    seed({ entries: [existing] });
    open({ editing: existing });
    expect(screen.queryByText('Repeats')).not.toBeInTheDocument();
  });
});
