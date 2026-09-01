/**
 * Savings goals.
 *
 * The cases worth pinning are the ones that would quietly mislead: a goal that
 * ignores money already set aside, a required-per-month figure that divides by
 * a deadline days away, and "on track" claiming a judgement it has no basis
 * for.
 */

import { describe, expect, it } from 'vitest';
import { contributionsFor, goalProgress, goalsSummary, goalsWithProgress } from './goals';
import { addDays, todayKey } from './calc';

let seq = 0;
const saving = (date, amount, goalId) => ({
  id: `g${seq++}`, date, kind: 'saving', category: 'goal', title: 'Transfer',
  note: '', amount, goalId, createdAt: seq,
});

const goal = (over = {}) => ({
  id: 'trip', name: 'Japan trip', target: 3000, opening: 0,
  deadline: null, note: '', createdAt: 1, archived: false, ...over,
});

const state = (goals, entries = []) => ({ goals, entries });

describe('contributionsFor', () => {
  it('counts only saving entries tagged to this goal', () => {
    const s = state([goal()], [
      saving('2026-01-01', 100, 'trip'),
      saving('2026-01-02', 200, 'other'),
      { ...saving('2026-01-03', 300, 'trip'), kind: 'expense' }, // wrong kind
      saving('2026-01-04', 400, undefined),                     // untagged
    ]);
    expect(contributionsFor(s, 'trip').map((e) => e.amount)).toEqual([100]);
  });
});

describe('goalProgress', () => {
  it('adds tagged contributions to the opening balance', () => {
    // Nobody starts at zero; a goal that ignores what is already set aside
    // shows 0% on a fund that is half full.
    const s = state([goal({ opening: 500 })], [saving('2026-01-01', 250, 'trip')]);
    const p = goalProgress(s, s.goals[0], '2026-02-01');
    expect(p.saved).toBe(750);
    expect(p.remaining).toBe(2250);
    expect(p.pct).toBe(25);
  });

  it('caps progress at 100% and marks completion', () => {
    const s = state([goal({ target: 100 })], [saving('2026-01-01', 250, 'trip')]);
    const p = goalProgress(s, s.goals[0], '2026-02-01');
    expect(p.pct).toBe(100);
    expect(p.complete).toBe(true);
    expect(p.remaining).toBe(0);
  });

  it('does not divide by zero on a goal with no target', () => {
    const p = goalProgress(state([goal({ target: 0 })]), goal({ target: 0 }), '2026-02-01');
    expect(p.pct).toBe(0);
    expect(p.complete).toBe(false);
  });

  it('works out what is required per month to land on the deadline', () => {
    const today = todayKey();
    const s = state([goal({ target: 3000, deadline: addDays(today, 182) })]); // ~6 months
    const p = goalProgress(s, s.goals[0], today);
    expect(p.requiredPerMonth).toBeGreaterThan(450);
    expect(p.requiredPerMonth).toBeLessThan(550);
  });

  it('refuses to state a per-month figure for a deadline days away', () => {
    // "You need £4,000 a month" for a goal due on Friday is arithmetically
    // true and useless; the honest answer is the outstanding lump sum.
    const today = todayKey();
    const s = state([goal({ target: 3000, deadline: addDays(today, 3) })]);
    const p = goalProgress(s, s.goals[0], today);
    expect(p.requiredPerMonth).toBeNull();
    expect(p.remaining).toBe(3000);
  });

  it('needs nothing per month once the target is met', () => {
    const today = todayKey();
    const s = state(
      [goal({ target: 1000, deadline: addDays(today, 90) })],
      [saving(addDays(today, -5), 1000, 'trip')]
    );
    const p = goalProgress(s, s.goals[0], today);
    expect(p.complete).toBe(true);
    expect(p.requiredPerMonth).toBeNull();
    expect(p.onTrack).toBe(true);
  });

  it('flags an overdue goal, but not a finished one', () => {
    const today = todayKey();
    const missed = goalProgress(
      state([goal({ target: 1000, deadline: addDays(today, -10) })]),
      goal({ target: 1000, deadline: addDays(today, -10) }),
      today
    );
    expect(missed.overdue).toBe(true);

    const done = goalProgress(
      state([goal({ target: 1000, deadline: addDays(today, -10) })], [saving(addDays(today, -20), 1000, 'trip')]),
      goal({ target: 1000, deadline: addDays(today, -10) }),
      today
    );
    expect(done.overdue).toBe(false);
  });

  it('judges "on track" from the recent pace', () => {
    const today = todayKey();
    const deadline = addDays(today, 182); // ~6 months, needs ~500/mo for 3000
    const fast = state(
      [goal({ target: 3000, deadline })],
      [saving(addDays(today, -20), 900, 'trip'), saving(addDays(today, -50), 900, 'trip')]
    );
    expect(goalProgress(fast, fast.goals[0], today).onTrack).toBe(true);

    const slow = state([goal({ target: 3000, deadline })], [saving(addDays(today, -20), 50, 'trip')]);
    expect(goalProgress(slow, slow.goals[0], today).onTrack).toBe(false);
  });

  it('declines to judge a goal with no deadline', () => {
    // There is nothing to be on track *for*, so it must not guess.
    const s = state([goal({ deadline: null })], [saving('2026-01-01', 100, 'trip')]);
    expect(goalProgress(s, s.goals[0], '2026-02-01').onTrack).toBeNull();
  });

  it('ignores contributions older than the recent window when judging pace', () => {
    // Deliberately short of the target: a *completed* goal is on track by
    // definition, which would mask whether the window is doing anything.
    const today = todayKey();
    const s = state(
      [goal({ target: 3000, deadline: addDays(today, 182) })],
      [saving(addDays(today, -300), 500, 'trip')] // one deposit, long ago
    );
    const p = goalProgress(s, s.goals[0], today);
    expect(p.saved).toBe(500);
    expect(p.complete).toBe(false);
    expect(p.perMonthRecent).toBe(0);
    expect(p.onTrack).toBe(false);
  });
});

describe('goalsWithProgress', () => {
  it('hides archived goals', () => {
    const s = state([goal(), goal({ id: 'old', archived: true })]);
    expect(goalsWithProgress(s, '2026-02-01').map((g) => g.id)).toEqual(['trip']);
  });

  it('puts the nearest deadline first and finished goals last', () => {
    const today = todayKey();
    const s = state([
      goal({ id: 'far', deadline: addDays(today, 300) }),
      goal({ id: 'done', target: 10 }),
      goal({ id: 'soon', deadline: addDays(today, 10) }),
    ], [saving(addDays(today, -1), 50, 'done')]);
    expect(goalsWithProgress(s, today).map((g) => g.id)).toEqual(['soon', 'far', 'done']);
  });

  it('is empty-safe', () => {
    expect(goalsWithProgress({}, '2026-02-01')).toEqual([]);
  });
});

describe('goalsSummary', () => {
  it('totals across goals and counts the ones behind', () => {
    const today = todayKey();
    const s = state([
      goal({ id: 'a', target: 1000, opening: 250 }),
      goal({ id: 'b', target: 2000, deadline: addDays(today, 182) }),
    ]);
    const rows = goalsWithProgress(s, today);
    const sum = goalsSummary(rows);
    expect(sum.count).toBe(2);
    expect(sum.saved).toBe(250);
    expect(sum.target).toBe(3000);
    expect(sum.remaining).toBe(2750);
    expect(sum.behind).toBe(1); // 'b' has a deadline and no contributions
  });
});
