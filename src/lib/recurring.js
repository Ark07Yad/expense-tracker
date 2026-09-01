/**
 * Recurring rules.
 *
 * A rule is an entry template plus a schedule. Rent, a phone bill, a monthly
 * transfer to savings — the things people retype twelve times a year and
 * eventually stop logging at all.
 *
 * **Nothing posts by itself.** The app works out what is due and offers it; the
 * user confirms or skips each one. Auto-posting would be less typing, but a
 * ledger that invents transactions is a ledger you cannot trust — and the whole
 * value of this app is that its numbers are ones you put there. Skipping is a
 * first-class outcome for exactly that reason: the gym you cancelled should not
 * keep appearing as spending.
 *
 * Rule shape:
 *   { id, kind, category, title, note, amount,
 *     frequency: 'weekly' | 'monthly' | 'yearly',
 *     anchorDate,          // the first date it fires; day-of-month comes from this
 *     lastResolved,        // last date posted *or* skipped, or null
 *     active, createdAt }
 */

import { addDays, addMonths, daysBetween, parseKey, todayKey } from './calc';

export const FREQUENCIES = [
  { id: 'weekly', label: 'Weekly', short: 'wk' },
  { id: 'monthly', label: 'Monthly', short: 'mo' },
  { id: 'yearly', label: 'Yearly', short: 'yr' },
];

export const frequencyById = (id) => FREQUENCIES.find((f) => f.id === id) || FREQUENCIES[1];

/**
 * A rule is never allowed to generate more than this many pending items.
 *
 * Someone returning after a year away should get a manageable queue and a clear
 * "older ones skipped", not four hundred checkboxes. The cap is also what stops
 * a malformed rule from locking the UI up while it generates occurrences.
 */
export const MAX_PENDING = 24;

/**
 * The nth occurrence, always measured from the anchor rather than from the
 * previous occurrence.
 *
 * That distinction is the whole correctness argument for monthly rules. Rent on
 * the 31st, stepped one month at a time, becomes 28 Feb and then stays on the
 * 28th forever — the date silently drifts. Measuring from the anchor clamps only
 * for the short month and returns to the 31st in March.
 */
export function nthOccurrence(rule, n) {
  if (rule.frequency === 'weekly') return addDays(rule.anchorDate, n * 7);
  if (rule.frequency === 'yearly') return addMonths(rule.anchorDate, n * 12);
  return addMonths(rule.anchorDate, n);
}

/** Roughly how many periods fit between two dates — a starting point to search from. */
function estimateIndex(rule, from, to) {
  const days = daysBetween(from, to);
  if (days < 0) return 0;
  if (rule.frequency === 'weekly') return Math.floor(days / 7);
  if (rule.frequency === 'yearly') return Math.floor(days / 365) - 1;
  return Math.floor(days / 31) - 1;
}

/**
 * Everything this rule owes, up to and including today.
 *
 * Occurrences already posted or skipped are excluded via `lastResolved`, so a
 * rule cannot double-post and a skipped month cannot come back.
 */
export function dueOccurrences(rule, today = todayKey(), max = MAX_PENDING) {
  if (!rule || rule.active === false) return [];

  const out = [];
  const floor = rule.lastResolved || null;

  // Start the scan near the answer rather than from the anchor: a weekly rule
  // running for three years is 150 iterations from zero, and this screen can
  // hold a dozen rules.
  let n = Math.max(0, estimateIndex(rule, rule.anchorDate, floor || rule.anchorDate));

  // Walk back in case the estimate overshot.
  while (n > 0 && nthOccurrence(rule, n) > (floor || rule.anchorDate)) n -= 1;

  for (let guard = 0; guard < 2000; guard++) {
    const date = nthOccurrence(rule, n);
    if (date > today) break;
    if (!floor || date > floor) {
      out.push(date);
      if (out.length >= max) break;
    }
    n += 1;
  }

  return out;
}

/** The next date this rule will fire, whether or not anything is outstanding. */
export function nextOccurrence(rule, today = todayKey()) {
  if (!rule || rule.active === false) return null;
  const from = rule.lastResolved && rule.lastResolved > today ? rule.lastResolved : today;
  let n = Math.max(0, estimateIndex(rule, rule.anchorDate, from));
  while (n > 0 && nthOccurrence(rule, n) > from) n -= 1;
  for (let guard = 0; guard < 2000; guard++) {
    const date = nthOccurrence(rule, n);
    if (date > from && (!rule.lastResolved || date > rule.lastResolved)) return date;
    n += 1;
  }
  return null;
}

/**
 * Everything due across all rules, oldest first.
 *
 * Flattened to one row per occurrence rather than per rule, because that is the
 * unit the user acts on — three months of a missed rent rule are three separate
 * decisions, not one.
 */
export function dueList(state, today = todayKey()) {
  const rules = state.recurring || [];
  const out = [];
  for (const rule of rules) {
    for (const date of dueOccurrences(rule, today)) out.push({ rule, date, key: `${rule.id}:${date}` });
  }
  return out.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
}

/** Total value of what is pending, split by kind — for the review summary. */
export function dueTotals(items) {
  const t = { earning: 0, expense: 0, saving: 0, count: items.length };
  for (const { rule } of items) {
    const amount = Math.abs(Number(rule.amount) || 0);
    if (rule.kind === 'earning') t.earning += amount;
    else if (rule.kind === 'saving') t.saving += amount;
    else t.expense += amount;
  }
  return t;
}

/** "Monthly on the 3rd", "Weekly on Mondays", "Yearly on 3 March". */
export function describeRule(rule) {
  const d = parseKey(rule.anchorDate);
  if (rule.frequency === 'weekly') {
    return `Weekly on ${d.toLocaleDateString(undefined, { weekday: 'long' })}s`;
  }
  if (rule.frequency === 'yearly') {
    return `Yearly on ${d.toLocaleDateString(undefined, { day: 'numeric', month: 'long' })}`;
  }
  return `Monthly on the ${ordinal(d.getDate())}`;
}

function ordinal(n) {
  // 11th–13th are the exceptions that the naive last-digit rule gets wrong.
  if (n % 100 >= 11 && n % 100 <= 13) return `${n}th`;
  return `${n}${{ 1: 'st', 2: 'nd', 3: 'rd' }[n % 10] || 'th'}`;
}

/** The entry a rule produces on a given date. */
export function entryFromRule(rule, date) {
  return {
    date,
    kind: rule.kind,
    category: rule.category,
    title: rule.title,
    note: rule.note,
    amount: rule.amount,
  };
}
