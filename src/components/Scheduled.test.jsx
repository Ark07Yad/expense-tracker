/**
 * @vitest-environment jsdom
 */

/**
 * The recurring queue.
 *
 * The semantics that matter are not visual: posting must create exactly the
 * entries shown and no others, and *skipping must advance the schedule just as
 * posting does* — otherwise a cancelled subscription asks again every month
 * forever. Both are invisible when broken until months later.
 */

import { describe, expect, it } from 'vitest';
import { screen } from '@testing-library/react';
import { DueQueue, ScheduledList } from './Scheduled';
import { renderWithStore, seed, store } from '../test/render';
import { addMonths, todayKey } from '../lib/calc';

/** A monthly rule whose occurrences are already overdue. */
const rule = (over = {}) => ({
  id: 'rent',
  kind: 'expense',
  category: 'housing',
  title: 'Rent',
  note: '',
  amount: 25500,
  frequency: 'monthly',
  anchorDate: addMonths(todayKey(), -3),
  lastResolved: null,
  active: true,
  createdAt: 1,
  ...over,
});

describe('DueQueue', () => {
  it('shows nothing when nothing is due', () => {
    seed({ recurring: [rule({ lastResolved: todayKey() })] });
    const { container } = renderWithStore(<DueQueue />);
    expect(container).toBeEmptyDOMElement();
  });

  it('lists one row per overdue occurrence', () => {
    seed({ recurring: [rule()] });
    renderWithStore(<DueQueue />);
    // Three months back, inclusive of today's month: four occurrences.
    expect(screen.getByText(/4 scheduled entries due/)).toBeInTheDocument();
    expect(screen.getAllByTitle(/Tap to skip/)).toHaveLength(4);
  });

  it('ignores a paused rule', () => {
    seed({ recurring: [rule(), rule({ id: 'gym', title: 'Old gym', active: false })] });
    renderWithStore(<DueQueue />);
    expect(screen.queryByText('Old gym')).not.toBeInTheDocument();
  });

  it('posts every row when confirmed', async () => {
    seed({ recurring: [rule()] });
    const { user } = renderWithStore(<DueQueue />);

    await user.click(screen.getByRole('button', { name: /Add all 4/ }));

    const { entries, recurring } = store().state;
    expect(entries).toHaveLength(4);
    expect(entries.every((e) => e.title === 'Rent' && e.amount === 25500)).toBe(true);
    // Every posted entry is marked as generated, and the rule has moved on.
    expect(entries.every((e) => e.fromRule === 'rent')).toBe(true);
    expect(recurring[0].lastResolved).toBe(entries.map((e) => e.date).sort().at(-1));
  });

  it('skips the rows that were turned off, and still advances the rule', async () => {
    // The important half: a skipped occurrence must not come back.
    seed({ recurring: [rule()] });
    const { user } = renderWithStore(<DueQueue />);

    const rows = screen.getAllByTitle(/Tap to skip/);
    await user.click(rows[0]);
    await user.click(rows[1]);

    expect(screen.getByRole('button', { name: /Add 2, skip 2/ })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /Add 2, skip 2/ }));

    const { entries, recurring } = store().state;
    expect(entries).toHaveLength(2);
    // Advanced past the skipped ones, so the queue is now empty.
    expect(recurring[0].lastResolved).not.toBeNull();
  });

  it('can skip everything without writing an entry', async () => {
    seed({ recurring: [rule()] });
    const { user } = renderWithStore(<DueQueue />);

    for (const row of screen.getAllByTitle(/Tap to skip/)) await user.click(row);
    await user.click(screen.getByRole('button', { name: /Skip all/ }));

    expect(store().state.entries).toHaveLength(0);
    expect(store().state.recurring[0].lastResolved).not.toBeNull();
  });

  it('leaves the queue empty afterwards', async () => {
    seed({ recurring: [rule()] });
    const { user } = renderWithStore(<DueQueue />);
    await user.click(screen.getByRole('button', { name: /Add all/ }));
    expect(screen.queryByText(/scheduled entr/)).not.toBeInTheDocument();
  });
});

describe('ScheduledList', () => {
  it('describes each schedule in words', () => {
    seed({ recurring: [rule({ anchorDate: '2026-01-03', lastResolved: todayKey() })] });
    renderWithStore(<ScheduledList />);
    expect(screen.getByText(/Monthly on the 3rd/)).toBeInTheDocument();
  });

  it('pauses and resumes without touching the schedule', async () => {
    seed({ recurring: [rule({ lastResolved: todayKey() })] });
    const { user } = renderWithStore(<ScheduledList />);

    await user.click(screen.getByRole('button', { name: 'Pause' }));
    expect(store().state.recurring[0].active).toBe(false);
    expect(screen.getByText('Paused')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Resume' }));
    expect(store().state.recurring[0].active).toBe(true);
    // Pausing must not lose where the schedule had got to.
    expect(store().state.recurring[0].lastResolved).toBe(todayKey());
  });

  it('offers a way in when there is nothing scheduled', () => {
    seed();
    renderWithStore(<ScheduledList />);
    expect(screen.getByText('Nothing scheduled')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Add a schedule/ })).toBeInTheDocument();
  });
});
