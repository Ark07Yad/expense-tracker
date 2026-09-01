/**
 * Savings goals.
 *
 * A goal is a target amount, optionally with a date. Progress is measured from
 * *saving entries tagged to that goal*, not from a category — categories are
 * shared, and "Goal savings" covering three different goals would make every
 * figure here a guess.
 *
 * The number that earns the screen is `requiredPerMonth`: what you would have
 * to put aside from now on to land on the date. A progress bar tells you where
 * you are; that figure tells you whether the plan is real.
 *
 * `opening` exists because almost nobody starts a goal at zero — money is
 * usually already set aside before the app is opened, and a goal that ignores it
 * would show 0% on a fund that is half full.
 */

import { daysBetween, todayKey } from './calc';

/** Contributions tagged to a goal. */
export function contributionsFor(state, goalId) {
  return (state.entries || []).filter((e) => e.kind === 'saving' && e.goalId === goalId);
}

/**
 * Months between now and a deadline, as a fraction and never below zero.
 *
 * Fractional rather than whole because "1 month left" on the 28th and on the
 * 2nd are very different requirements, and rounding to whole months makes the
 * per-month figure lurch at the start of every month.
 */
function monthsUntil(deadline, today) {
  if (!deadline) return null;
  const days = daysBetween(today, deadline);
  return Math.max(0, days / 30.4375);
}

export function goalProgress(state, goal, today = todayKey()) {
  const contributions = contributionsFor(state, goal.id);
  const contributed = contributions.reduce((n, e) => n + Math.abs(Number(e.amount) || 0), 0);
  const opening = Math.max(0, Number(goal.opening) || 0);
  const saved = opening + contributed;
  const target = Math.max(0, Number(goal.target) || 0);
  const remaining = Math.max(0, target - saved);
  const pct = target > 0 ? Math.min(100, (saved / target) * 100) : 0;
  const complete = target > 0 && saved >= target;

  const months = monthsUntil(goal.deadline, today);
  const overdue = !!goal.deadline && goal.deadline < today && !complete;

  // Below a fortnight the divisor stops being meaningful — "you need £4,000 a
  // month" for a goal due on Friday is arithmetically true and useless. Past
  // that point the honest answer is the lump sum still outstanding.
  const requiredPerMonth =
    months !== null && months >= 0.5 && remaining > 0 ? remaining / months : null;

  /** What recent behaviour would actually deliver, from the last 90 days. */
  const since = daysBetween(today, todayKey()) === 0 ? today : today;
  const recent = contributions.filter((e) => daysBetween(e.date, since) <= 90 && e.date <= since);
  const recentTotal = recent.reduce((n, e) => n + Math.abs(Number(e.amount) || 0), 0);
  const perMonthRecent = recent.length ? recentTotal / 3 : 0;

  const monthsAtCurrentRate = perMonthRecent > 0 && remaining > 0 ? remaining / perMonthRecent : null;

  return {
    ...goal,
    contributions,
    contributionCount: contributions.length,
    opening,
    saved,
    target,
    remaining,
    pct,
    complete,
    overdue,
    monthsLeft: months,
    requiredPerMonth,
    perMonthRecent,
    monthsAtCurrentRate,
    /**
     * On track means the current pace clears the target by the deadline. With
     * no deadline there is nothing to be on track for, so it stays null rather
     * than pretending to a judgement.
     */
    onTrack:
      complete ? true
      : months === null || requiredPerMonth === null ? null
      : perMonthRecent >= requiredPerMonth,
    lastContribution: contributions.reduce((m, e) => (e.date > m ? e.date : m), ''),
  };
}

export function goalsWithProgress(state, today = todayKey()) {
  return (state.goals || [])
    .filter((g) => !g.archived)
    .map((g) => goalProgress(state, g, today))
    .sort((a, b) => {
      // Finished goals drop to the bottom; among the rest, the most urgent
      // deadline first, then the closest to completion.
      if (a.complete !== b.complete) return a.complete ? 1 : -1;
      if (a.deadline && b.deadline) return a.deadline < b.deadline ? -1 : 1;
      if (a.deadline) return -1;
      if (b.deadline) return 1;
      return b.pct - a.pct;
    });
}

/** Totals across every active goal, for a summary line. */
export function goalsSummary(rows) {
  return {
    count: rows.length,
    saved: rows.reduce((n, g) => n + g.saved, 0),
    target: rows.reduce((n, g) => n + g.target, 0),
    remaining: rows.reduce((n, g) => n + g.remaining, 0),
    /** Only the goals with a date contribute a required monthly figure. */
    requiredPerMonth: rows.reduce((n, g) => n + (g.requiredPerMonth || 0), 0),
    complete: rows.filter((g) => g.complete).length,
    behind: rows.filter((g) => g.onTrack === false).length,
  };
}
