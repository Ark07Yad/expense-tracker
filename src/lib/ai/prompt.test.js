import { describe, expect, it } from 'vitest';
import { AdviceFormatError, DISCLAIMER, SYSTEM_PROMPT, namesSpecificProducts, parseAdvice, userMessage } from './prompt';

const good = {
  summary: 'You keep 55% of income.',
  allocation: [{ assetClass: 'Equity index funds', targetPct: 60, why: 'Long horizon' }, { assetClass: 'Bonds', targetPct: 40, why: 'Stability' }],
  actions: [{ title: 'Clear the card', detail: '2,400 at 21.9%', priority: 'now' }],
  risks: ['Markets fall'],
  assumptions: ['Stable job'],
};

describe('the instructions', () => {
  it('keep guidance general and say so', () => {
    expect(SYSTEM_PROMPT).toMatch(/Do not name specific funds/);
    expect(SYSTEM_PROMPT).toMatch(/Never promise or estimate specific returns/);
    expect(DISCLAIMER).toMatch(/subject to market risk/);
  });

  it('embed the summary and the currency', () => {
    const msg = userMessage({ currency: 'EUR', cashFlow: { typicalMonthlyIncome: 4000 } });
    expect(msg).toContain('All money is in EUR');
    expect(msg).toContain('"typicalMonthlyIncome": 4000');
  });
});

describe('parseAdvice', () => {
  it('reads plain JSON', () => {
    expect(parseAdvice(JSON.stringify(good))).toEqual(expect.objectContaining({ summary: good.summary, rescaled: false }));
  });

  it('reads JSON wrapped in reasoning, prose and a code fence', () => {
    const raw = `<think>let me add this up</think>Sure! Here you go:\n\`\`\`json\n${JSON.stringify(good)}\n\`\`\`\nHope that helps.`;
    expect(parseAdvice(raw).actions[0].title).toBe('Clear the card');
  });

  it('rescales an allocation that does not add up', () => {
    const out = parseAdvice(JSON.stringify({ ...good, allocation: [{ assetClass: 'A', targetPct: 90, why: '' }, { assetClass: 'B', targetPct: 60, why: '' }] }));
    expect(out.allocation.map((a) => a.targetPct)).toEqual([60, 40]);
    expect(out.rescaled).toBe(true);
  });

  it('drops malformed items and defaults an unknown priority', () => {
    const out = parseAdvice(JSON.stringify({
      summary: 's',
      allocation: [{ assetClass: '', targetPct: 50 }, { assetClass: 'Cash', targetPct: 'lots' }],
      actions: [{ title: 'Do it', priority: 'yesterday' }, { detail: 'no title' }],
      risks: ['r', 3, null],
    }));
    expect(out.allocation).toEqual([]);
    expect(out.actions).toEqual([{ title: 'Do it', detail: '', priority: 'soon' }]);
    expect(out.risks).toEqual(['r']);
  });

  it('throws a format error, keeping the raw text, when there is nothing usable', () => {
    for (const raw of ['', 'I cannot help with that.', '{not json}', '{"foo": 1}']) {
      expect(() => parseAdvice(raw)).toThrow(AdviceFormatError);
    }
    try { parseAdvice('plain words'); } catch (e) { expect(e.raw).toBe('plain words'); }
  });
});

describe('namesSpecificProducts', () => {
  const withText = (detail) => ({ ...good, actions: [{ title: 't', detail, priority: 'now' }] });

  it('flags tickers, exchange prefixes and ISINs', () => {
    expect(namesSpecificProducts(withText('Buy an S&P fund (VOO)'))).toBe(true);
    expect(namesSpecificProducts(withText('Consider NSE: RELIANCE'))).toBe(true);
    expect(namesSpecificProducts(withText('ISIN IE00B4L5Y983'))).toBe(true);
    expect(namesSpecificProducts(withText('look up the ticker'))).toBe(true);
  });

  it('does not cry wolf on generic instrument and account types', () => {
    expect(namesSpecificProducts(good)).toBe(false);
    expect(namesSpecificProducts(withText('A low-cost index fund (ETF), a monthly SIP, your PPF (PPF) and a pension (PRSA) in EUR (EUR)'))).toBe(false);
  });
});
