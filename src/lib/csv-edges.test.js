/**
 * Bank exports, as they actually arrive: quoted commas, European decimals,
 * semicolons, and dates in an order nobody states.
 *
 * The date order matters more than it looks. `parseDate` defaults to DMY, so an
 * ISO file read with the default would be rejected row by row — the import
 * screen avoids that by detecting the order from the file's own rows first.
 * These tests pin that pipeline, not the default.
 */

import { describe, expect, it } from 'vitest';
import { buildRows, detectDateOrder, detectDelimiter, parseAmount, parseCsv, parseDate } from './csv';

const file = (text) => {
  const parsed = parseCsv(text);
  const order = detectDateOrder(parsed.rows.map((r) => r[0]));
  return { parsed, order, rows: buildRows(parsed, { date: 0, description: 1, amount: 2 }, { dateOrder: order.order }) };
};

describe('reading the file', () => {
  it('keeps a quoted comma, an escaped quote and a newline inside one field', () => {
    const { headers, rows } = parseCsv('date,description,amount\n2026-09-01,"Dinner, with friends",1200\n');
    expect(headers).toEqual(['date', 'description', 'amount']);
    expect(rows[0]).toEqual(['2026-09-01', 'Dinner, with friends', '1200']);

    const tricky = parseCsv('a,b\n"He said ""hi""","line one\nline two"\n');
    expect(tricky.rows[0][0]).toBe('He said "hi"');
    expect(tricky.rows[0][1]).toBe('line one\nline two');
  });

  it('spots a semicolon file, as European banks export', () => {
    expect(detectDelimiter('date;description;amount\n2026-09-01;Rent;1.234,56\n')).toBe(';');
    expect(detectDelimiter('date,description,amount\n2026-09-01,Rent,1234.56\n')).toBe(',');
  });

  it('reads the amount formats banks emit', () => {
    expect(parseAmount('1,234.56')).toBeCloseTo(1234.56);
    expect(parseAmount('1.234,56')).toBeCloseTo(1234.56);
    expect(parseAmount('₹ 1,234')).toBeCloseTo(1234);
    expect(parseAmount('-500')).toBeCloseTo(-500);
    expect(parseAmount('')).toBe(null);
    expect(parseAmount('abc')).toBe(null);
  });
});

describe('deciding what the dates mean', () => {
  it('reads an ISO file by detecting the order first', () => {
    const { order, rows } = file('date,description,amount\n2026-09-01,Rent,1200\n2026-10-02,Rent,1200\n');
    expect(order).toEqual({ order: 'YMD', ambiguous: false, confident: true });
    expect(rows.map((r) => r.date)).toEqual(['2026-09-01', '2026-10-02']);
  });

  it('uses a day past the 12th to settle day-first files', () => {
    const { order, rows } = file('date,description,amount\n03/04/2026,Rent,1200\n25/12/2026,Gift,500\n');
    expect(order.order).toBe('DMY');
    expect(rows[0].date).toBe('2026-04-03');
  });

  it('says so when the file cannot settle it', () => {
    // Every day is 12 or lower: 03/04 could be March or April, and nothing in
    // the file decides. The screen offers the choice on the back of this flag.
    const { order } = file('date,description,amount\n03/04/2026,Rent,1200\n05/06/2026,Rent,1200\n');
    expect(order.ambiguous).toBe(true);
    expect(order.confident).toBe(false);
  });

  it('rejects a date that cannot exist rather than rolling it forward', () => {
    expect(parseDate('31/02/2026', 'DMY')).toBe(null);
    expect(parseDate('nonsense')).toBe(null);
    expect(parseDate('12 Mar 2026')).toBe('2026-03-12');
  });
});

describe('what reaches the ledger', () => {
  it('flags a row it cannot read instead of importing a zero', () => {
    const { rows } = file('date,description,amount\n2026-09-01,Rent,1200\nnonsense,Broken,\n');
    const usable = rows.filter((r) => r.ok !== false);
    const broken = rows.filter((r) => r.ok === false);
    expect(usable).toHaveLength(1);
    expect(broken).toHaveLength(1);
    expect(broken[0].reason).toBeTruthy();
    for (const row of usable) expect(Number.isFinite(row.amount)).toBe(true);
  });
});
