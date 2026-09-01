/**
 * CSV import.
 *
 * Bank exports are the fastest way to get a year of real history into the app,
 * and they are also uniformly awful: no two banks agree on column names, date
 * order, decimal separator, or how to signal that money went out. So this file
 * guesses, shows its guesses, and lets the user correct every one of them
 * before anything is written.
 *
 * The guessing is deliberately conservative. A wrong date format silently
 * shifts a year of entries by days or months, and a wrong sign turns income
 * into spending — both are far worse than asking. Where the evidence is
 * ambiguous the parser says so rather than picking.
 */

import { categoriesFor } from './data';
import { keyOf } from './calc';

/* ──────────────────────────────── Parsing ───────────────────────────────── */

/**
 * Split CSV text into rows, honouring quotes.
 *
 * Hand-rolled rather than pulled in: a bank export is a single flat table, and
 * the only part of the spec that actually matters here is that a quoted field
 * may contain the delimiter, a newline, or an escaped quote — which is exactly
 * the part a naive `split(',')` gets wrong on any description with a comma in
 * it.
 */
export function parseCsv(text, delimiter) {
  const delim = delimiter || detectDelimiter(text);
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;

  const src = text.replace(/^﻿/, ''); // strip a BOM, which Excel loves to add

  for (let i = 0; i < src.length; i++) {
    const ch = src[i];

    if (quoted) {
      if (ch === '"') {
        if (src[i + 1] === '"') { field += '"'; i++; }
        else quoted = false;
      } else field += ch;
      continue;
    }

    if (ch === '"') { quoted = true; continue; }
    if (ch === delim) { row.push(field); field = ''; continue; }
    if (ch === '\r') continue;
    if (ch === '\n') { row.push(field); rows.push(row); row = []; field = ''; continue; }
    field += ch;
  }

  if (field !== '' || row.length) { row.push(field); rows.push(row); }

  const cleaned = rows.filter((r) => r.some((c) => c.trim() !== ''));
  if (!cleaned.length) return { headers: [], rows: [], delimiter: delim };

  return {
    headers: cleaned[0].map((h) => h.trim()),
    rows: cleaned.slice(1),
    delimiter: delim,
  };
}

/** Pick the delimiter that yields the most consistent column count. */
export function detectDelimiter(text) {
  const sample = text.split(/\r?\n/).slice(0, 20).filter((l) => l.trim());
  let best = ',';
  let bestScore = -1;

  for (const d of [',', ';', '\t', '|']) {
    const counts = sample.map((line) => line.split(d).length);
    const first = counts[0] || 0;
    if (first < 2) continue;
    // Consistency matters more than raw count: a description full of commas
    // scores high on count and terribly on consistency.
    const consistent = counts.filter((c) => c === first).length / counts.length;
    const score = consistent * 10 + Math.min(first, 12);
    if (score > bestScore) { bestScore = score; best = d; }
  }
  return best;
}

/* ──────────────────────────────── Amounts ───────────────────────────────── */

/**
 * Parse an amount from whatever the bank felt like writing.
 *
 * Handles thousands separators in both conventions, currency symbols,
 * accounting parentheses for negatives, and trailing DR/CR markers. Returns
 * null rather than 0 for something unparseable — a row that quietly becomes
 * zero is worse than a row that is flagged and skipped.
 */
export function parseAmount(raw) {
  if (raw === null || raw === undefined) return null;
  let s = String(raw).trim();
  if (!s) return null;

  let negative = false;

  if (/^\(.*\)$/.test(s)) { negative = true; s = s.slice(1, -1); }
  if (/\bDR\b|\bDEBIT\b/i.test(s)) negative = true;
  if (/\bCR\b|\bCREDIT\b/i.test(s)) negative = false;

  s = s.replace(/[A-Za-z$£€₹¥\s]/g, '');

  if (s.startsWith('-')) { negative = true; s = s.slice(1); }
  else if (s.startsWith('+')) s = s.slice(1);

  const commas = (s.match(/,/g) || []).length;
  const dots = (s.match(/\./g) || []).length;

  if (commas && dots) {
    // Both present: whichever comes last is the decimal separator, and every
    // instance of the other one is grouping.
    if (s.lastIndexOf(',') > s.lastIndexOf('.')) s = s.replace(/\./g, '').replace(',', '.');
    else s = s.replace(/,/g, '');
  } else if (commas > 1) {
    // More than one and nothing else: grouping, in either convention. Indian
    // lakh grouping (1,25,000) lands here, and treating the last comma as a
    // decimal point turned ₹1,25,000 into 1.25.
    s = s.replace(/,/g, '');
  } else if (commas === 1) {
    // A lone comma is a decimal separator unless it is followed by exactly
    // three digits, which is the grouping convention (1,234).
    const after = s.length - s.lastIndexOf(',') - 1;
    s = after === 3 ? s.replace(',', '') : s.replace(',', '.');
  } else if (dots > 1) {
    // 1.234.567 — grouping in the European convention.
    s = s.replace(/\./g, '');
  }

  s = s.replace(/[^0-9.]/g, '');
  if (!s || s === '.') return null;

  const n = Number(s);
  if (!Number.isFinite(n)) return null;
  return negative ? -n : n;
}

/* ───────────────────────────────── Dates ────────────────────────────────── */

const DATE_ORDERS = ['YMD', 'DMY', 'MDY'];

/** Pull three numbers and an optional textual month out of a date string. */
function dateParts(raw) {
  const s = String(raw || '').trim();
  if (!s) return null;

  // 12 Mar 2026 / Mar 12, 2026
  const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
  const named = s.match(/(\d{1,2})[\s-]*([A-Za-z]{3,})[\s-]*(\d{2,4})|([A-Za-z]{3,})[\s-]*(\d{1,2})[,\s-]*(\d{2,4})/);
  if (named) {
    const day = Number(named[1] || named[5]);
    const monthName = (named[2] || named[4] || '').slice(0, 3).toLowerCase();
    const month = MONTHS.indexOf(monthName) + 1;
    const year = Number(named[3] || named[6]);
    if (month > 0) return { a: year, b: month, c: day, order: 'YMD', explicit: true };
  }

  const nums = s.match(/\d+/g);
  if (!nums || nums.length < 3) return null;
  return { a: Number(nums[0]), b: Number(nums[1]), c: Number(nums[2]), explicit: false };
}

const expandYear = (y) => (y < 100 ? (y > 70 ? 1900 + y : 2000 + y) : y);

/**
 * Decide DMY vs MDY vs YMD from the whole column, not row by row.
 *
 * 03/04/2026 is genuinely ambiguous; 13/04/2026 anywhere in the column is not.
 * Reading the column as a set is what turns a coin flip into a decision, and
 * `ambiguous` is returned honestly when the evidence never arrives.
 */
export function detectDateOrder(samples) {
  const parts = samples.map(dateParts).filter(Boolean);
  if (!parts.length) return { order: 'DMY', ambiguous: true, confident: false };

  const viable = new Set(DATE_ORDERS);
  for (const p of parts) {
    if (p.explicit) continue;
    if (p.a > 31) { viable.delete('DMY'); viable.delete('MDY'); }
    if (p.a > 12 && p.a <= 31) viable.delete('MDY');
    if (p.b > 12) { viable.delete('DMY'); viable.delete('YMD'); }
    if (p.c > 31) { viable.delete('YMD'); }
  }

  const order = DATE_ORDERS.find((o) => viable.has(o)) || 'DMY';
  return { order, ambiguous: viable.size > 1, confident: viable.size === 1 };
}

/** Apply a chosen order to one cell. Returns a 'YYYY-MM-DD' key, or null. */
export function parseDate(raw, order = 'DMY') {
  const p = dateParts(raw);
  if (!p) return null;

  let y, m, d;
  if (p.explicit) { y = p.a; m = p.b; d = p.c; }
  else if (order === 'YMD') { y = p.a; m = p.b; d = p.c; }
  else if (order === 'MDY') { m = p.a; d = p.b; y = p.c; }
  else { d = p.a; m = p.b; y = p.c; }

  y = expandYear(y);
  if (!(m >= 1 && m <= 12) || !(d >= 1 && d <= 31) || !(y >= 1900 && y <= 2200)) return null;

  const date = new Date(y, m - 1, d, 12);
  // Rejects 31 February rather than silently rolling it into March.
  if (date.getMonth() !== m - 1 || date.getDate() !== d) return null;
  return keyOf(date);
}

/* ──────────────────────────────── Mapping ───────────────────────────────── */

const HEADER_HINTS = {
  date: ['date', 'transaction date', 'posted', 'value date', 'booking date', 'when', 'time'],
  description: ['description', 'details', 'narrative', 'memo', 'particulars', 'payee', 'reference', 'name', 'transaction'],
  amount: ['amount', 'value', 'sum', 'transaction amount'],
  debit: ['debit', 'withdrawal', 'paid out', 'money out', 'outflow', 'expense', 'dr'],
  credit: ['credit', 'deposit', 'paid in', 'money in', 'inflow', 'income', 'cr'],
  category: ['category', 'type', 'classification'],
};

/**
 * Short hints are matched whole-word only.
 *
 * "cr" as a substring matches "des**cr**iption", which is not a hypothetical:
 * it made the parser treat the description column as a credit amount, take the
 * debit/credit branch, and reject every row in the file as unreadable.
 */
const isShortHint = (hint) => hint.length <= 3;

/** Best guess at which column is which, by header name. */
export function guessMapping(headers) {
  const lower = headers.map((h) => h.toLowerCase().trim());
  const pick = (hints) => {
    for (const hint of hints) {
      const exact = lower.indexOf(hint);
      if (exact > -1) return exact;
    }
    for (const hint of hints) {
      if (isShortHint(hint)) continue;
      const partial = lower.findIndex((h) => h.includes(hint));
      if (partial > -1) return partial;
    }
    return -1;
  };

  const debit = pick(HEADER_HINTS.debit);
  const credit = pick(HEADER_HINTS.credit);

  return {
    date: pick(HEADER_HINTS.date),
    description: pick(HEADER_HINTS.description),
    // A separate debit/credit pair takes precedence: when a bank supplies both,
    // a lone "amount" column is usually a running balance.
    amount: debit > -1 && credit > -1 ? -1 : pick(HEADER_HINTS.amount),
    debit,
    credit,
    category: pick(HEADER_HINTS.category),
  };
}

/* ─────────────────────────── Category guessing ──────────────────────────── */

const KEYWORDS = {
  groceries: ['tesco', 'sainsbury', 'aldi', 'lidl', 'asda', 'grocer', 'supermarket', 'dunnes', 'bigbasket', 'blinkit', 'zepto', 'reliance fresh', 'dmart', 'whole foods', 'kroger'],
  dining: ['restaurant', 'cafe', 'coffee', 'starbucks', 'costa', 'mcdonald', 'kfc', 'domino', 'pizza', 'swiggy', 'zomato', 'deliveroo', 'ubereats', 'uber eats', 'just eat', 'doordash', 'bar ', 'pub '],
  transport: ['uber', 'ola ', 'lyft', 'taxi', 'cab', 'metro', 'transport', 'railway', 'irctc', 'train', 'bus ', 'fuel', 'petrol', 'shell', 'bp ', 'parking', 'toll'],
  housing: ['rent', 'landlord', 'mortgage', 'property tax', 'maintenance'],
  utilities: ['electric', 'water', 'gas bill', 'broadband', 'internet', 'airtel', 'jio', 'vodafone', 'bsnl', 'utility', 'council tax'],
  subscriptions: ['netflix', 'spotify', 'prime', 'youtube', 'icloud', 'google one', 'dropbox', 'adobe', 'subscription', 'membership', 'hotstar', 'disney'],
  health: ['pharmacy', 'chemist', 'apollo', 'hospital', 'clinic', 'doctor', 'dental', 'gym', 'fitness', 'boots'],
  shopping: ['amazon', 'flipkart', 'myntra', 'ebay', 'ikea', 'zara', 'h&m', 'primark', 'argos', 'shop', 'store', 'retail'],
  entertainment: ['cinema', 'pvr', 'inox', 'odeon', 'theatre', 'bookmyshow', 'ticketmaster', 'concert', 'game'],
  education: ['course', 'udemy', 'coursera', 'tuition', 'college', 'university', 'school', 'books'],
  travel: ['airline', 'flight', 'indigo', 'ryanair', 'easyjet', 'emirates', 'hotel', 'airbnb', 'booking.com', 'expedia', 'makemytrip', 'travel'],
  debt: ['loan', 'emi', 'repayment', 'credit card payment'],
  salary: ['salary', 'payroll', 'wages', 'pay from'],
  interest: ['interest'],
  dividend: ['dividend'],
  refund: ['refund', 'reversal', 'chargeback'],
};

/**
 * Guess a category from a description.
 *
 * Only ever a starting point — it is shown in the preview and every row stays
 * editable, because a merchant string is thin evidence and a confidently wrong
 * category is harder to notice than an obviously uncategorised one.
 */
export function guessCategory(description, kind = 'expense') {
  const text = String(description || '').toLowerCase();
  if (!text.trim()) return null;

  const valid = new Set(categoriesFor(kind).map((c) => c.id));
  let best = null;
  let bestLen = 0;

  for (const [category, words] of Object.entries(KEYWORDS)) {
    if (!valid.has(category)) continue;
    for (const w of words) {
      // Longest match wins: "credit card payment" should beat "card".
      if (text.includes(w) && w.length > bestLen) { best = category; bestLen = w.length; }
    }
  }
  return best;
}

/* ────────────────────────────── Row building ────────────────────────────── */

/**
 * Turn parsed rows into draft entries.
 *
 * `signConvention` matters because banks disagree: some write spending as a
 * negative amount, some as a positive number in a debit column, and a few use
 * positives for both and expect you to know. It is surfaced in the UI rather
 * than assumed, because getting it backwards turns a year of spending into a
 * year of income and every chart with it.
 */
export function buildRows(parsed, mapping, options = {}) {
  const { dateOrder = 'DMY', flipSign = false, existing = [] } = options;

  // Dedupe against what is already logged: re-importing an overlapping export
  // is the normal way to bring a statement up to date, and doubling every
  // transaction in the overlap would be silent and painful to unpick.
  const seen = new Set(
    existing.map((e) => `${e.date}|${Math.round(Math.abs(e.amount))}|${(e.title || '').toLowerCase().slice(0, 24)}`)
  );

  const rows = [];
  for (const cells of parsed.rows) {
    const at = (i) => (i >= 0 && i < cells.length ? cells[i] : '');

    const date = parseDate(at(mapping.date), dateOrder);
    const description = String(at(mapping.description) || '').trim();

    let value = null;
    if (mapping.debit > -1 || mapping.credit > -1) {
      const debit = parseAmount(at(mapping.debit));
      const credit = parseAmount(at(mapping.credit));
      if (debit) value = -Math.abs(debit);
      else if (credit) value = Math.abs(credit);
    } else {
      value = parseAmount(at(mapping.amount));
    }

    if (value !== null && flipSign) value = -value;

    if (!date || value === null || value === 0) {
      rows.push({
        ok: false,
        reason: !date ? 'unreadable date' : value === null ? 'unreadable amount' : 'zero amount',
        raw: cells,
        date, description, amount: value,
      });
      continue;
    }

    const kind = value < 0 ? 'expense' : 'earning';
    const amount = Math.abs(value);
    const category = guessCategory(description, kind) || (kind === 'earning' ? 'other-earning' : 'other-expense');
    const title = description.slice(0, 60) || 'Imported';
    const key = `${date}|${Math.round(amount)}|${title.toLowerCase().slice(0, 24)}`;

    rows.push({
      ok: true,
      duplicate: seen.has(key),
      key,
      date,
      kind,
      category,
      title,
      note: description.length > 60 ? description : '',
      amount,
      raw: cells,
    });
    seen.add(key);
  }

  return rows;
}

export function summariseRows(rows) {
  const usable = rows.filter((r) => r.ok && !r.duplicate);
  return {
    total: rows.length,
    usable: usable.length,
    duplicates: rows.filter((r) => r.ok && r.duplicate).length,
    failed: rows.filter((r) => !r.ok).length,
    expense: usable.filter((r) => r.kind === 'expense').reduce((n, r) => n + r.amount, 0),
    earning: usable.filter((r) => r.kind === 'earning').reduce((n, r) => n + r.amount, 0),
    from: usable.reduce((m, r) => (!m || r.date < m ? r.date : m), ''),
    to: usable.reduce((m, r) => (r.date > m ? r.date : m), ''),
  };
}
