/**
 * CSV import.
 *
 * Bank exports are uniformly awful and disagree on everything, so most of these
 * tests are real-world shapes: quoted descriptions containing the delimiter,
 * European decimal commas, accounting parentheses, separate debit/credit
 * columns, and two-digit years. The ambiguous-date case is the one that matters
 * most — getting DMY and MDY the wrong way round shifts a year of history and
 * nothing about the result looks broken.
 */

import { describe, expect, it } from 'vitest';
import {
  buildRows, detectDateOrder, detectDelimiter, guessCategory, guessMapping,
  parseAmount, parseCsv, parseDate, summariseRows,
} from './csv';

describe('parseCsv', () => {
  it('parses a plain file', () => {
    const { headers, rows } = parseCsv('Date,Description,Amount\n2026-01-01,Coffee,-3.50');
    expect(headers).toEqual(['Date', 'Description', 'Amount']);
    expect(rows).toEqual([['2026-01-01', 'Coffee', '-3.50']]);
  });

  it('keeps a delimiter that is inside quotes', () => {
    // The single most common way a naive split ruins an import.
    const { rows } = parseCsv('Date,Description,Amount\n2026-01-01,"Tesco, Dublin 2",-31.20');
    expect(rows[0]).toEqual(['2026-01-01', 'Tesco, Dublin 2', '-31.20']);
  });

  it('handles escaped quotes and newlines inside a field', () => {
    const { rows } = parseCsv('A,B\n"say ""hi""","line1\nline2"');
    expect(rows[0]).toEqual(['say "hi"', 'line1\nline2']);
  });

  it('copes with CRLF, a BOM and trailing blank lines', () => {
    const { headers, rows } = parseCsv('﻿Date,Amount\r\n2026-01-01,5\r\n\r\n');
    expect(headers).toEqual(['Date', 'Amount']);
    expect(rows).toHaveLength(1);
  });

  it('returns empty structures for an empty file', () => {
    expect(parseCsv('')).toEqual({ headers: [], rows: [], delimiter: ',' });
  });
});

describe('detectDelimiter', () => {
  it('finds semicolons and tabs', () => {
    expect(detectDelimiter('a;b;c\n1;2;3')).toBe(';');
    expect(detectDelimiter('a\tb\tc\n1\t2\t3')).toBe('\t');
    expect(detectDelimiter('a,b,c\n1,2,3')).toBe(',');
  });

  it('prefers consistency over raw count', () => {
    // Commas appear more often, but only the semicolon splits every line the
    // same way — the commas live inside descriptions.
    const text = 'Date;Description;Amount\n2026-01-01;Tesco, Dublin, 2;-31,20\n2026-01-02;Aldi, Cork;-12,00';
    expect(detectDelimiter(text)).toBe(';');
  });
});

describe('parseAmount', () => {
  it('reads plain numbers', () => {
    expect(parseAmount('3.50')).toBe(3.5);
    expect(parseAmount('-3.50')).toBe(-3.5);
    expect(parseAmount('+120')).toBe(120);
  });

  it('strips thousands separators and currency symbols', () => {
    expect(parseAmount('1,234.56')).toBe(1234.56);
    expect(parseAmount('£1,234.56')).toBe(1234.56);
    expect(parseAmount('₹ 1,25,000')).toBe(125000);
  });

  it('reads the European convention', () => {
    expect(parseAmount('1.234,56')).toBe(1234.56);
    expect(parseAmount('31,20')).toBe(31.2);
  });

  it('reads accounting parentheses as negative', () => {
    expect(parseAmount('(45.00)')).toBe(-45);
  });

  it('reads DR and CR markers', () => {
    expect(parseAmount('45.00 DR')).toBe(-45);
    expect(parseAmount('45.00 CR')).toBe(45);
  });

  it('returns null rather than zero for junk', () => {
    // A row that quietly becomes 0 is worse than one that is flagged.
    expect(parseAmount('')).toBeNull();
    expect(parseAmount('n/a')).toBeNull();
    expect(parseAmount(null)).toBeNull();
    expect(parseAmount('.')).toBeNull();
  });
});

describe('detectDateOrder', () => {
  it('recognises ISO', () => {
    expect(detectDateOrder(['2026-01-05', '2026-02-11'])).toMatchObject({ order: 'YMD', confident: true });
  });

  it('recognises day-first from a day above 12', () => {
    expect(detectDateOrder(['05/01/2026', '13/04/2026'])).toMatchObject({ order: 'DMY', confident: true });
  });

  it('recognises month-first from a second field above 12', () => {
    expect(detectDateOrder(['01/05/2026', '04/13/2026'])).toMatchObject({ order: 'MDY', confident: true });
  });

  it('admits when the column is genuinely ambiguous', () => {
    // 03/04/2026 could be either, and pretending otherwise shifts history.
    const got = detectDateOrder(['03/04/2026', '05/06/2026']);
    expect(got.ambiguous).toBe(true);
    expect(got.confident).toBe(false);
  });
});

describe('parseDate', () => {
  it('applies the chosen order', () => {
    expect(parseDate('05/01/2026', 'DMY')).toBe('2026-01-05');
    expect(parseDate('05/01/2026', 'MDY')).toBe('2026-05-01');
    expect(parseDate('2026-01-05', 'YMD')).toBe('2026-01-05');
  });

  it('reads a written month regardless of the chosen order', () => {
    expect(parseDate('12 Mar 2026', 'MDY')).toBe('2026-03-12');
    expect(parseDate('Mar 12, 2026', 'DMY')).toBe('2026-03-12');
  });

  it('expands two-digit years sensibly', () => {
    expect(parseDate('05/01/26', 'DMY')).toBe('2026-01-05');
    expect(parseDate('05/01/99', 'DMY')).toBe('1999-01-05');
  });

  it('rejects an impossible date instead of rolling it forward', () => {
    // new Date(2026, 1, 31) silently becomes 3 March.
    expect(parseDate('31/02/2026', 'DMY')).toBeNull();
    expect(parseDate('45/01/2026', 'DMY')).toBeNull();
    expect(parseDate('not a date', 'DMY')).toBeNull();
  });
});

describe('guessMapping', () => {
  it('matches common header names', () => {
    const m = guessMapping(['Date', 'Description', 'Amount']);
    expect(m).toMatchObject({ date: 0, description: 1, amount: 2 });
  });

  it('prefers a debit/credit pair over a lone amount column', () => {
    // When a bank gives both, the remaining numeric column is usually the
    // running balance, and importing that would be nonsense.
    const m = guessMapping(['Date', 'Details', 'Money Out', 'Money In', 'Balance']);
    expect(m.debit).toBe(2);
    expect(m.credit).toBe(3);
    expect(m.amount).toBe(-1);
  });

  it('reports what it could not find', () => {
    expect(guessMapping(['Foo', 'Bar']).date).toBe(-1);
  });
});

describe('guessCategory', () => {
  it('recognises merchants', () => {
    expect(guessCategory('TESCO STORES 3294 DUBLIN')).toBe('groceries');
    expect(guessCategory('Uber   *trip help.uber.com')).toBe('transport');
    expect(guessCategory('NETFLIX.COM')).toBe('subscriptions');
    expect(guessCategory('SWIGGY BANGALORE')).toBe('dining');
  });

  it('prefers the longest match', () => {
    expect(guessCategory('CREDIT CARD PAYMENT')).toBe('debt');
  });

  it('only offers categories valid for the kind', () => {
    expect(guessCategory('MONTHLY SALARY ACME LTD', 'earning')).toBe('salary');
    // 'groceries' is not an earning category, so it must not be returned.
    expect(guessCategory('TESCO STORES', 'earning')).toBeNull();
  });

  it('returns null when it has no idea', () => {
    expect(guessCategory('XFER 99201')).toBeNull();
    expect(guessCategory('')).toBeNull();
  });
});

describe('buildRows', () => {
  const parse = (text) => parseCsv(text);

  it('builds entries, inferring kind from the sign', () => {
    const parsed = parse('Date,Description,Amount\n05/01/2026,TESCO,-31.20\n06/01/2026,SALARY,2500');
    const rows = buildRows(parsed, guessMapping(parsed.headers), { dateOrder: 'DMY' });
    expect(rows[0]).toMatchObject({ ok: true, date: '2026-01-05', kind: 'expense', amount: 31.2, category: 'groceries' });
    expect(rows[1]).toMatchObject({ ok: true, kind: 'earning', amount: 2500, category: 'salary' });
  });

  it('handles separate debit and credit columns', () => {
    const parsed = parse('Date,Details,Money Out,Money In\n05/01/2026,TESCO,31.20,\n06/01/2026,SALARY,,2500');
    const rows = buildRows(parsed, guessMapping(parsed.headers), { dateOrder: 'DMY' });
    expect(rows[0]).toMatchObject({ kind: 'expense', amount: 31.2 });
    expect(rows[1]).toMatchObject({ kind: 'earning', amount: 2500 });
  });

  it('can flip the sign convention', () => {
    // Some banks write spending as a positive. Getting this backwards turns a
    // year of spending into a year of income.
    const parsed = parse('Date,Description,Amount\n05/01/2026,TESCO,31.20');
    const rows = buildRows(parsed, guessMapping(parsed.headers), { dateOrder: 'DMY', flipSign: true });
    expect(rows[0].kind).toBe('expense');
  });

  it('flags unusable rows rather than dropping them silently', () => {
    const parsed = parse('Date,Description,Amount\nnonsense,TESCO,-31.20\n05/01/2026,X,notanumber\n05/01/2026,Y,0');
    const rows = buildRows(parsed, guessMapping(parsed.headers), { dateOrder: 'DMY' });
    expect(rows.map((r) => r.reason)).toEqual(['unreadable date', 'unreadable amount', 'zero amount']);
    expect(rows.every((r) => !r.ok)).toBe(true);
  });

  it('marks rows already in the ledger as duplicates', () => {
    const parsed = parse('Date,Description,Amount\n05/01/2026,TESCO,-31.20');
    const existing = [{ date: '2026-01-05', amount: 31.2, title: 'TESCO' }];
    const rows = buildRows(parsed, guessMapping(parsed.headers), { dateOrder: 'DMY', existing });
    expect(rows[0].duplicate).toBe(true);
  });

  it('marks a repeat within the same file as a duplicate too', () => {
    const parsed = parse('Date,Description,Amount\n05/01/2026,TESCO,-31.20\n05/01/2026,TESCO,-31.20');
    const rows = buildRows(parsed, guessMapping(parsed.headers), { dateOrder: 'DMY' });
    expect(rows[0].duplicate).toBe(false);
    expect(rows[1].duplicate).toBe(true);
  });

  it('keeps a long description as the note and truncates the title', () => {
    const long = 'X'.repeat(90);
    const parsed = parse(`Date,Description,Amount\n05/01/2026,${long},-10`);
    const rows = buildRows(parsed, guessMapping(parsed.headers), { dateOrder: 'DMY' });
    expect(rows[0].title).toHaveLength(60);
    expect(rows[0].note).toBe(long);
  });
});

describe('summariseRows', () => {
  it('counts what will and will not be imported', () => {
    const parsed = parseCsv('Date,Description,Amount\n05/01/2026,TESCO,-31.20\n06/01/2026,SALARY,2500\nbad,X,-1');
    const rows = buildRows(parsed, guessMapping(parsed.headers), { dateOrder: 'DMY' });
    const s = summariseRows(rows);
    expect(s).toMatchObject({ total: 3, usable: 2, failed: 1, duplicates: 0, expense: 31.2, earning: 2500 });
    expect(s.from).toBe('2026-01-05');
    expect(s.to).toBe('2026-01-06');
  });
});
