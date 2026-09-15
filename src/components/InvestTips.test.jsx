/**
 * @vitest-environment jsdom
 */

/**
 * The Invest screen's suggestion box.
 *
 * What matters: actions open the sheet on this screen rather than navigating
 * to the screen you are already on, and a dismissal is the same dismissal the
 * advisor honours — stored by rule id, restorable.
 */

import { describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import InvestTips from './InvestTips';
import { renderWithStore, seed, store } from '../test/render';
import { addMonthKeys, monthKey, todayKey } from '../lib/calc';

const nowM = monthKey(todayKey());

/** Last valued three months ago, so the stale rule fires. */
const staleHolding = () => ({
  id: 'fund', name: 'Index fund', class: 'fund', note: '', createdAt: 1,
  history: { [addMonthKeys(nowM, -3)]: { contributed: 1000, value: 1200 } },
});

describe('InvestTips', () => {
  it('renders nothing when there are no holdings', () => {
    seed({});
    const { container } = renderWithStore(<InvestTips />);
    expect(container.querySelector('section')).toBeNull();
  });

  it('opens the update sheet in place instead of navigating', async () => {
    seed({ assets: [staleHolding()] });
    const onUpdate = vi.fn();
    const onNavigate = vi.fn();
    const { user } = renderWithStore(<InvestTips onUpdate={onUpdate} onNavigate={onNavigate} />);

    expect(screen.getByText('Suggestion box')).toBeInTheDocument();
    expect(screen.getByText(/1 holding has not been revalued recently/)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /update values/i }));
    expect(onUpdate).toHaveBeenCalledTimes(1);
    expect(onNavigate).not.toHaveBeenCalled();
  });

  it('leaves out what the hero already says', () => {
    seed({ assets: [staleHolding()] });
    renderWithStore(<InvestTips />);
    expect(screen.queryByText(/across 1 holding/)).toBeNull();
    // The disclaimer is a footnote, not a card.
    expect(screen.getByText(/will not tell you what to buy or sell/)).toBeInTheDocument();
  });

  it('dismisses by rule id, and can restore', async () => {
    seed({ assets: [staleHolding()] });
    const { user } = renderWithStore(<InvestTips />);
    const title = /1 holding has not been revalued recently/;

    const card = screen.getByText(title).closest('.p-4');
    await user.click(card.querySelector('button[aria-label="Dismiss"]'));

    expect(screen.queryByText(title)).toBeNull();
    expect(store().state.dismissed).toContain('inv-stale');

    await user.click(screen.getByRole('button', { name: /restore 1/i }));
    expect(screen.getByText(title)).toBeInTheDocument();
  });
});
