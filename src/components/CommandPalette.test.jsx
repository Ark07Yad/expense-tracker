/**
 * @vitest-environment jsdom
 */

/**
 * Search and jump.
 *
 * What has to hold: the keyboard alone can find and run anything, the thing
 * that runs is the thing highlighted, and closing puts focus back where it
 * came from — a palette that strands focus on <body> breaks every shortcut
 * after it.
 */

import { describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import CommandPalette, { rank, score } from './CommandPalette';

const make = () => {
  const ran = [];
  const commands = [
    { id: 'go-home', group: 'Go to', label: 'Home', icon: 'home', hint: '1', run: () => ran.push('home') },
    { id: 'go-ledger', group: 'Go to', label: 'Ledger', icon: 'ledger', hint: '2', run: () => ran.push('ledger') },
    { id: 'go-trends', group: 'Go to', label: 'Trends', icon: 'chart', hint: '3', keywords: 'analytics', run: () => ran.push('trends') },
    { id: 'new', group: 'Actions', label: 'New entry', icon: 'plus', hint: 'N', keywords: 'add log', run: () => ran.push('new') },
  ];
  return { ran, commands };
};

const open = (props = {}) => {
  const { ran, commands } = make();
  const onClose = vi.fn();
  const user = userEvent.setup();
  render(<CommandPalette onClose={onClose} commands={commands} {...props} />);
  return { ran, onClose, user, input: screen.getByRole('combobox') };
};

describe('ranking', () => {
  it('prefers the start of a label, then the start of a word, then anywhere', () => {
    expect(score('tr', 'Trends')).toBeGreaterThan(score('tr', 'New entry'));
    expect(score('en', 'New entry')).toBeGreaterThan(score('en', 'Trends'));
    expect(score('zzz', 'Ledger')).toBe(0);
  });

  it('matches the first letters of words, but not letters scattered anywhere', () => {
    expect(score('jt', 'Jump to today')).toBeGreaterThan(0);
    expect(score('ne', 'New entry')).toBeGreaterThan(0);
    // The bug this replaced: "tre" hiding inside "picTuRE".
    expect(score('tre', 'Suggestions: Whole picture')).toBe(0);
    expect(score('ldg', 'Ledger')).toBe(0);
  });

  it('counts the word after a colon as the start of a word', () => {
    expect(score('spend', 'Suggestions: Spending')).toBe(80);
  });

  it('keeps the given order with no query, and matches keywords', () => {
    const { commands } = make();
    expect(rank(commands, '').map((c) => c.id)).toEqual(['go-home', 'go-ledger', 'go-trends', 'new']);
    expect(rank(commands, 'analytics').map((c) => c.id)).toEqual(['go-trends']);
    expect(rank(commands, 'add').map((c) => c.id)).toEqual(['new']);
  });
});

describe('CommandPalette', () => {
  it('is a labelled dialog with the input focused and everything listed', () => {
    const { input } = open();
    expect(screen.getByRole('dialog', { name: 'Search and jump' })).toBeInTheDocument();
    expect(input).toHaveFocus();
    expect(screen.getAllByRole('option')).toHaveLength(4);
    expect(screen.getByText('Go to')).toBeInTheDocument();
    expect(screen.getByText('Actions')).toBeInTheDocument();
  });

  it('filters as you type and runs the highlighted result on Enter', async () => {
    const { ran, onClose, user } = open();
    await user.keyboard('tre');
    const options = screen.getAllByRole('option');
    expect(options).toHaveLength(1);
    expect(options[0]).toHaveTextContent('Trends');
    expect(options[0]).toHaveAttribute('aria-selected', 'true');

    await user.keyboard('{Enter}');
    expect(ran).toEqual(['trends']);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('moves with the arrow keys, wraps, and tells assistive tech which row is active', async () => {
    const { ran, user, input } = open();
    const selected = () => screen.getAllByRole('option').find((o) => o.getAttribute('aria-selected') === 'true');

    expect(selected()).toHaveTextContent('Home');
    await user.keyboard('{ArrowDown}{ArrowDown}');
    expect(selected()).toHaveTextContent('Trends');
    expect(input).toHaveAttribute('aria-activedescendant', selected().id);

    await user.keyboard('{ArrowUp}{ArrowUp}{ArrowUp}');
    expect(selected()).toHaveTextContent('New entry');

    await user.keyboard('{Enter}');
    expect(ran).toEqual(['new']);
  });

  it('runs what is clicked', async () => {
    const { ran, user } = open();
    await user.click(screen.getByRole('option', { name: /Ledger/ }));
    expect(ran).toEqual(['ledger']);
  });

  it('closes on Escape and on the backdrop without running anything', async () => {
    const { ran, onClose, user } = open();
    await user.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(ran).toEqual([]);
  });

  it('keeps focus in the box when Tab is pressed', async () => {
    const { user, input } = open();
    await user.tab();
    expect(input).toHaveFocus();
  });

  it('says so when nothing matches, and Enter does nothing', async () => {
    const { ran, onClose, user } = open();
    await user.keyboard('qqqq');
    expect(screen.queryAllByRole('option')).toHaveLength(0);
    expect(screen.getByText(/Nothing matches/)).toBeInTheDocument();
    await user.keyboard('{Enter}');
    expect(ran).toEqual([]);
    expect(onClose).not.toHaveBeenCalled();
  });

  it('searches entries once there are two letters, after the commands', async () => {
    const opened = [];
    const findEntries = vi.fn((q) =>
      q === 'lu' ? [{ id: 'entry-1', group: 'Entries', label: 'Lunch', hint: '9 Oct · ₹265', run: () => opened.push('lunch') }] : []
    );
    const { user } = open({ findEntries });

    await user.keyboard('l');
    expect(findEntries).not.toHaveBeenCalled();

    await user.keyboard('u');
    expect(findEntries).toHaveBeenCalledWith('lu');
    const lunch = screen.getByRole('option', { name: /Lunch/ });
    expect(within(lunch).getByText('9 Oct · ₹265')).toBeInTheDocument();

    await user.click(lunch);
    expect(opened).toEqual(['lunch']);
  });

  it('returns focus to the element it is told to, even if that never had focus', () => {
    // Safari: a clicked button is not the active element.
    const trigger = document.createElement('button');
    document.body.appendChild(trigger);
    expect(trigger).not.toHaveFocus();

    const { commands } = make();
    const { unmount } = render(<CommandPalette onClose={() => {}} commands={commands} returnFocusTo={trigger} />);
    unmount();
    expect(trigger).toHaveFocus();
    trigger.remove();
  });

  it('returns focus to whatever opened it', () => {
    const trigger = document.createElement('button');
    document.body.appendChild(trigger);
    trigger.focus();

    const { commands } = make();
    const { unmount } = render(<CommandPalette onClose={() => {}} commands={commands} />);
    expect(screen.getByRole('combobox')).toHaveFocus();
    unmount();
    expect(trigger).toHaveFocus();
    trigger.remove();
  });
});
