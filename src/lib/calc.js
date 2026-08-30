/**
 * Dates, periods and money.
 *
 * Two rules run through this file.
 *
 * **Dates are strings, not `Date` objects.** A day is `'YYYY-MM-DD'` in the
 * user's own timezone. Storing a `Date` (or worse, an ISO instant) means an
 * entry logged at 11pm in Dublin becomes the next day the moment the machine
 * moves timezone — and this user's machine does move. Strings compare, sort and
 * group correctly with no timezone anywhere near them; `Date` is used only as
 * a calculator, always constructed at local noon so a daylight-saving shift
 * cannot roll the date backwards.
 *
 * **A period is a half-open bucket of days**, resolved to `{ start, end }` day
 * keys once and then passed around. Every view — week, month, quarter, year —
 * uses the same range and bucket machinery, so the four tabs cannot drift apart
 * in how they count a boundary day.
 */

import { currencyByCode } from './data';

/* ───────────────────────────────── Day keys ──────────────────────────────── */

const pad = (n) => String(n).padStart(2, '0');

/** Local-calendar day key for a Date. */
export const keyOf = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

export const todayKey = () => keyOf(new Date());

/** Parse a day key into a local Date at noon — DST-proof for day arithmetic. */
export function parseKey(key) {
  const [y, m, d] = String(key).split('-').map(Number);
  return new Date(y, (m || 1) - 1, d || 1, 12, 0, 0, 0);
}

export function addDays(key, n) {
  const d = parseKey(key);
  d.setDate(d.getDate() + n);
  return keyOf(d);
}

export function addMonths(key, n) {
  const d = parseKey(key);
  const day = d.getDate();
  d.setDate(1);
  d.setMonth(d.getMonth() + n);
  // Clamp: adding a month to 31 Jan must land on 28/29 Feb, not drift to March.
  d.setDate(Math.min(day, daysInMonth(d.getFullYear(), d.getMonth())));
  return keyOf(d);
}

export const daysInMonth = (year, monthIndex) => new Date(year, monthIndex + 1, 0).getDate();

/** Whole days from `a` to `b`, signed. Both are day keys. */
export const daysBetween = (a, b) =>
  Math.round((parseKey(b) - parseKey(a)) / 86400000);

export const monthKey = (key) => String(key).slice(0, 7);

export const monthKeyOf = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;

/** First day of a month key, as a day key. */
export const monthStart = (mk) => `${mk}-01`;

export function addMonthKeys(mk, n) {
  const [y, m] = mk.split('-').map(Number);
  const d = new Date(y, m - 1 + n, 1, 12);
  return monthKeyOf(d);
}

/* ─────────────────────────────── Period ranges ───────────────────────────── */

export const PERIODS = [
  { id: 'week',    label: 'Week',    short: 'W', bucket: 'day',   compare: 'last week' },
  { id: 'month',   label: 'Month',   short: 'M', bucket: 'day',   compare: 'last month' },
  { id: 'quarter', label: 'Quarter', short: 'Q', bucket: 'week',  compare: 'last quarter' },
  { id: 'year',    label: 'Year',    short: 'Y', bucket: 'month', compare: 'last year' },
];

export const periodById = (id) => PERIODS.find((p) => p.id === id) || PERIODS[1];

/** Monday-start by default; `weekStart` is 0 (Sun) or 1 (Mon). */
export function startOfWeek(key, weekStart = 1) {
  const d = parseKey(key);
  const shift = (d.getDay() - weekStart + 7) % 7;
  d.setDate(d.getDate() - shift);
  return keyOf(d);
}

/**
 * Resolve a period to a concrete day range.
 *
 * `offset` steps backwards and forwards: 0 is the period containing `anchor`,
 * -1 the one before it. Everything downstream — totals, buckets, the previous
 * period used for comparisons — is derived from this one function, so "this
 * month" means the same thing in every view.
 */
export function periodRange(period, offset = 0, { anchor = todayKey(), weekStart = 1 } = {}) {
  const d = parseKey(anchor);

  if (period === 'week') {
    const start = addDays(startOfWeek(anchor, weekStart), offset * 7);
    return { start, end: addDays(start, 6) };
  }

  if (period === 'quarter') {
    const q = Math.floor(d.getMonth() / 3);
    const s = new Date(d.getFullYear(), q * 3 + offset * 3, 1, 12);
    const e = new Date(s.getFullYear(), s.getMonth() + 3, 0, 12);
    return { start: keyOf(s), end: keyOf(e) };
  }

  if (period === 'year') {
    const s = new Date(d.getFullYear() + offset, 0, 1, 12);
    const e = new Date(d.getFullYear() + offset, 11, 31, 12);
    return { start: keyOf(s), end: keyOf(e) };
  }

  // month
  const s = new Date(d.getFullYear(), d.getMonth() + offset, 1, 12);
  const e = new Date(s.getFullYear(), s.getMonth() + 1, 0, 12);
  return { start: keyOf(s), end: keyOf(e) };
}

/** The equivalent range one period earlier — used for every "vs" figure. */
export const previousRange = (period, offset = 0, opts = {}) =>
  periodRange(period, offset - 1, opts);

export function periodLabel(period, range) {
  const s = parseKey(range.start);
  const e = parseKey(range.end);
  const month = (d) => d.toLocaleDateString(undefined, { month: 'short' });

  if (period === 'week') {
    const sameMonth = s.getMonth() === e.getMonth();
    return sameMonth
      ? `${s.getDate()}–${e.getDate()} ${month(s)} ${s.getFullYear()}`
      : `${s.getDate()} ${month(s)} – ${e.getDate()} ${month(e)} ${e.getFullYear()}`;
  }
  if (period === 'quarter') {
    return `Q${Math.floor(s.getMonth() / 3) + 1} ${s.getFullYear()} · ${month(s)}–${month(e)}`;
  }
  if (period === 'year') return String(s.getFullYear());
  return s.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
}

/**
 * Split a range into the buckets a chart should draw.
 *
 * A week and a month bucket by day, a quarter by week, a year by month. Each
 * bucket carries its own `start`/`end` day keys so a caller never has to redo
 * the boundary arithmetic — it just filters entries into the bucket whose range
 * contains them.
 */
export function bucketsOf(period, range, { weekStart = 1 } = {}) {
  const out = [];
  const bucket = periodById(period).bucket;

  if (bucket === 'day') {
    for (let k = range.start; k <= range.end; k = addDays(k, 1)) {
      const d = parseKey(k);
      out.push({
        key: k,
        start: k,
        end: k,
        label: d.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' }),
        short:
          period === 'week'
            ? d.toLocaleDateString(undefined, { weekday: 'short' })
            : String(d.getDate()),
      });
    }
    return out;
  }

  if (bucket === 'week') {
    // Weeks are clipped to the quarter so the first and last bars cover only
    // the days that actually belong to it — otherwise a quarter's total and the
    // sum of its bars disagree, which is the kind of thing people notice.
    let cursor = range.start;
    let n = 1;
    while (cursor <= range.end) {
      const weekEnd = addDays(startOfWeek(cursor, weekStart), 6);
      const end = weekEnd > range.end ? range.end : weekEnd;
      const d = parseKey(cursor);
      out.push({
        key: `w${n}`,
        start: cursor,
        end,
        label: `Week ${n} · ${d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}`,
        short: `W${n}`,
      });
      cursor = addDays(end, 1);
      n += 1;
    }
    return out;
  }

  // month buckets
  let cursor = range.start;
  while (cursor <= range.end) {
    const d = parseKey(cursor);
    const end = keyOf(new Date(d.getFullYear(), d.getMonth() + 1, 0, 12));
    out.push({
      key: monthKey(cursor),
      start: cursor,
      end: end > range.end ? range.end : end,
      label: d.toLocaleDateString(undefined, { month: 'long', year: 'numeric' }),
      short: d.toLocaleDateString(undefined, { month: 'short' }),
    });
    cursor = keyOf(new Date(d.getFullYear(), d.getMonth() + 1, 1, 12));
  }
  return out;
}

/**
 * How far through the current period we are, 0–1.
 *
 * This is what makes "you have spent 60% of your budget" honest: on the 6th of
 * the month, 60% spent is alarming; on the 26th it is fine. Every pace figure
 * in the app is scaled by this.
 */
export function periodProgress(range, today = todayKey()) {
  if (today < range.start) return 0;
  if (today > range.end) return 1;
  const total = daysBetween(range.start, range.end) + 1;
  const done = daysBetween(range.start, today) + 1;
  return Math.min(1, Math.max(0, done / total));
}

export const rangeContains = (range, key) => key >= range.start && key <= range.end;

export const rangeDays = (range) => daysBetween(range.start, range.end) + 1;

/* ──────────────────────────────── Formatting ─────────────────────────────── */

/** 'Today' / 'Yesterday' / 'Sat, 30 Aug' — dates people read without decoding. */
export function dayLabel(key, today = todayKey()) {
  if (key === today) return 'Today';
  if (key === addDays(today, -1)) return 'Yesterday';
  if (key === addDays(today, 1)) return 'Tomorrow';
  const d = parseKey(key);
  const sameYear = d.getFullYear() === parseKey(today).getFullYear();
  return d.toLocaleDateString(
    undefined,
    sameYear
      ? { weekday: 'short', day: 'numeric', month: 'short' }
      : { day: 'numeric', month: 'short', year: 'numeric' }
  );
}

export const shortDate = (key) =>
  parseKey(key).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });

/**
 * 'Aug 2026'.
 *
 * The two-digit year form is shorter but reads as a day of the month — "valued
 * Aug 26" looked like the 26th of August rather than August 2026, which is
 * exactly the wrong thing to be ambiguous about on a screen full of dates.
 */
export const monthLabel = (mk) =>
  parseKey(`${mk}-01`).toLocaleDateString(undefined, { month: 'short', year: 'numeric' });

/**
 * Money, formatted the way the chosen currency is actually written.
 *
 * `compact` matters more than it looks: an axis tick reading ₹1,25,000 pushes
 * the plot area off the card, while "1.25L" is both shorter and the form an
 * Indian reader parses fastest. Intl handles the lakh/crore abbreviations for
 * `en-IN` natively, so there is no hand-rolled table to get wrong.
 */
export function formatMoney(value, code = 'INR', { compact = false, decimals, sign = false } = {}) {
  const cur = currencyByCode(code);
  const n = Number(value) || 0;
  const abs = Math.abs(n);

  // Whole numbers by default. Showing ₹1,204.00 on every row is noise; the
  // decimals only earn their place under 100, where they carry real precision.
  const digits =
    decimals !== undefined ? decimals : compact ? (abs >= 1000 ? 1 : 0) : abs > 0 && abs < 100 ? 2 : 0;

  let out;
  try {
    out = new Intl.NumberFormat(cur.locale, {
      style: 'currency',
      currency: cur.code,
      notation: compact && abs >= 1000 ? 'compact' : 'standard',
      minimumFractionDigits: compact ? 0 : digits,
      maximumFractionDigits: digits,
    }).format(abs);
  } catch {
    out = `${cur.symbol}${abs.toFixed(digits)}`;
  }

  if (sign && n !== 0) return `${n > 0 ? '+' : '−'}${out}`;
  return n < 0 ? `−${out}` : out;
}

/** Bare number, no currency — for inputs and tight table cells. */
export function formatNumber(value, code = 'INR', { compact = false } = {}) {
  const cur = currencyByCode(code);
  const n = Number(value) || 0;
  try {
    return new Intl.NumberFormat(cur.locale, {
      notation: compact && Math.abs(n) >= 1000 ? 'compact' : 'standard',
      maximumFractionDigits: Math.abs(n) < 100 && !Number.isInteger(n) ? 2 : 0,
    }).format(n);
  } catch {
    return String(Math.round(n));
  }
}

export const formatPercent = (v, decimals = 0) =>
  `${(Number(v) || 0).toFixed(decimals)}%`;

/**
 * Percentage change, with the divide-by-zero case handled honestly.
 *
 * Going from nothing to something is not "infinity percent" — it is new, and
 * the UI says so rather than printing a meaningless number.
 */
export function pctChange(current, previous) {
  const a = Number(current) || 0;
  const b = Number(previous) || 0;
  if (b === 0) return a === 0 ? { pct: 0, kind: 'flat' } : { pct: null, kind: 'new' };
  return { pct: ((a - b) / Math.abs(b)) * 100, kind: 'ratio' };
}

export const clamp = (n, min, max) => Math.min(max, Math.max(min, n));

export const sum = (arr, pick = (x) => x) =>
  arr.reduce((t, x) => t + (Number(pick(x)) || 0), 0);
