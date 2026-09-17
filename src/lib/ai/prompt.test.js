import { describe, expect, it } from 'vitest';
import {
  AdviceFormatError, DISCLAIMERS, ROW_SHAPE, SYSTEM_PROMPTS,
  disclaimerFor, namesSpecificProducts, parseAdvice, previewFromPartial, schemaOf, userMessage,
} from './prompt';

const answer = (topic, rows) => JSON.stringify({
  summary: 'You keep 55% of income.',
  [ROW_SHAPE[topic].key]: rows,
  actions: [{ title: 'Clear the card', detail: '2,400 at 21.9%', priority: 'now' }],
  risks: ['Markets fall'],
  assumptions: ['Stable job'],
});

const mix = [
  { assetClass: 'Equity index funds', targetPct: 60, why: 'Long horizon' },
  { assetClass: 'Bonds', targetPct: 40, why: 'Stability' },
];

describe('the instructions', () => {
  it('keep guidance general on every topic', () => {
    for (const [topic, prompt] of Object.entries(SYSTEM_PROMPTS)) {
      expect(prompt, topic).toMatch(/Do not name specific funds/);
      expect(prompt, topic).toMatch(/Never promise or estimate specific returns/);
    }
  });

  it('tell the spending one not to moralise, and the saving one what "kept" means', () => {
    expect(SYSTEM_PROMPTS.spending).toMatch(/Never moralise/);
    expect(SYSTEM_PROMPTS.spending).toMatch(/not discretionary/);
    expect(SYSTEM_PROMPTS.saving).toMatch(/income minus spending/);
  });

  it('hold the budget and debt rules that keep the advice safe', () => {
    expect(SYSTEM_PROMPTS.budgets).toMatch(/must not exceed their income/);
    expect(SYSTEM_PROMPTS.budgets).toMatch(/Not every category needs a cap/);
    expect(SYSTEM_PROMPTS.debt).toMatch(/required minimum payment/);
    expect(SYSTEM_PROMPTS.debt).toMatch(/highest interest rate first/);
    expect(SYSTEM_PROMPTS.debt).toMatch(/Do not name lenders, refinancing products/);
    expect(DISCLAIMERS.debt).toMatch(/free debt advice service/);
    expect(DISCLAIMERS.budgets).toMatch(/fixed by contract/);
  });

  it('carry a disclaimer suited to the topic', () => {
    expect(DISCLAIMERS.investing).toMatch(/subject to market risk/);
    expect(DISCLAIMERS.spending).toMatch(/cannot know what a category was for/);
    expect(DISCLAIMERS.saving).toMatch(/subject to market risk/);
    expect(disclaimerFor('nonsense')).toBe(DISCLAIMERS.investing);
  });

  it('ask for the row shape that topic uses', () => {
    expect(schemaOf('spending').required).toContain('caps');
    expect(schemaOf('budgets').required).toContain('caps');
    expect(schemaOf('saving').properties.split.items.required).toEqual(['purpose', 'monthlyAmount', 'why']);
    expect(schemaOf('debt').properties.plan.items.required).toEqual(['debt', 'monthlyAmount', 'why']);
    expect(userMessage({ currency: 'EUR' }, 'spending')).toContain('"caps"');
    expect(userMessage({ currency: 'EUR' }, 'debt')).toContain('"plan"');
  });

  it('embed the summary and the currency', () => {
    const msg = userMessage({ currency: 'EUR', cashFlow: { typicalMonthlyIncome: 4000 } }, 'investing');
    expect(msg).toContain('All money is in EUR');
    expect(msg).toContain('"typicalMonthlyIncome": 4000');
  });
});

describe('parseAdvice', () => {
  it('reads plain JSON and keeps the topic', () => {
    const out = parseAdvice(answer('investing', mix), 'investing');
    expect(out).toEqual(expect.objectContaining({ topic: 'investing', unit: 'percent', rescaled: false }));
    expect(out.rows[0]).toEqual({ label: 'Equity index funds', value: 60, why: 'Long horizon' });
    expect(out.rowsTitle).toBe('Suggested long-term mix');
  });

  it('reads each topic out of its own key', () => {
    const spending = parseAdvice(answer('spending', [{ category: 'Food & Dining', monthlyCap: 320.5, why: 'Above habit' }]), 'spending');
    expect(spending.rows).toEqual([{ label: 'Food & Dining', value: 320.5, why: 'Above habit' }]);
    expect(spending.unit).toBe('money');
    expect(spending.rowsTitle).toBe('Suggested monthly caps');

    const saving = parseAdvice(answer('saving', [{ purpose: 'Emergency cushion', monthlyAmount: 200, why: 'Two months short' }]), 'saving');
    expect(saving.rows).toEqual([{ label: 'Emergency cushion', value: 200, why: 'Two months short' }]);
  });

  it('reads budgets and debt out of their own keys', () => {
    const budgets = parseAdvice(answer('budgets', [{ category: 'Food & Dining', monthlyCap: 400, why: 'Just above habit' }]), 'budgets');
    expect(budgets.rows).toEqual([{ label: 'Food & Dining', value: 400, why: 'Just above habit' }]);
    expect(budgets.rowsTitle).toBe('Suggested budgets');

    const debt = parseAdvice(answer('debt', [{ debt: 'Credit card', monthlyAmount: 250, why: 'Highest rate' }]), 'debt');
    expect(debt.rows).toEqual([{ label: 'Credit card', value: 250, why: 'Highest rate' }]);
    expect(debt.rowsTitle).toBe('Suggested monthly payments');
    expect(debt.unit).toBe('money');
  });

  it('reads JSON wrapped in reasoning, prose and a code fence', () => {
    const raw = `<think>let me add up</think>Sure!\n\`\`\`json\n${answer('investing', mix)}\n\`\`\`\nHope that helps.`;
    expect(parseAdvice(raw).actions[0].title).toBe('Clear the card');
  });

  it('rescales percentages that do not add up, and leaves money alone', () => {
    const pct = parseAdvice(answer('investing', [{ assetClass: 'A', targetPct: 90, why: '' }, { assetClass: 'B', targetPct: 60, why: '' }]), 'investing');
    expect(pct.rows.map((r) => r.value)).toEqual([60, 40]);
    expect(pct.rescaled).toBe(true);

    const money = parseAdvice(answer('spending', [{ category: 'A', monthlyCap: 900, why: '' }, { category: 'B', monthlyCap: 600, why: '' }]), 'spending');
    expect(money.rows.map((r) => r.value)).toEqual([900, 600]);
    expect(money.rescaled).toBe(false);
  });

  it('drops malformed items and defaults an unknown priority', () => {
    const out = parseAdvice(JSON.stringify({
      summary: 's',
      allocation: [{ assetClass: '', targetPct: 50 }, { assetClass: 'Cash', targetPct: 'lots' }],
      actions: [{ title: 'Do it', priority: 'yesterday' }, { detail: 'no title' }],
      risks: ['r', 3, null],
    }));
    expect(out.rows).toEqual([]);
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
  const withText = (detail) => parseAdvice(JSON.stringify({
    summary: 's', allocation: [], actions: [{ title: 't', detail, priority: 'now' }], risks: [], assumptions: [],
  }));

  it('flags tickers, exchange prefixes and ISINs', () => {
    expect(namesSpecificProducts(withText('Buy an S&P fund (VOO)'))).toBe(true);
    expect(namesSpecificProducts(withText('Consider NSE: RELIANCE'))).toBe(true);
    expect(namesSpecificProducts(withText('ISIN IE00B4L5Y983'))).toBe(true);
    expect(namesSpecificProducts(withText('look up the ticker'))).toBe(true);
  });

  it('does not cry wolf on generic instrument and account types', () => {
    expect(namesSpecificProducts(parseAdvice(answer('investing', mix)))).toBe(false);
    expect(namesSpecificProducts(withText('A low-cost index fund (ETF), a monthly SIP, your PPF (PPF) and a pension (PRSA) in EUR (EUR)'))).toBe(false);
  });
});

describe('previewFromPartial', () => {
  const partial = '{"summary": "You keep 55% of what you earn, whic';

  it('shows the summary as it is still being typed', () => {
    expect(previewFromPartial(partial).summary).toBe('You keep 55% of what you earn, whic');
    expect(previewFromPartial('{"summ').summary).toBe('');
    expect(previewFromPartial('').summary).toBe('');
  });

  it('survives escapes, including a half-written one', () => {
    expect(previewFromPartial('{"summary": "A \\"tight\\" month,\\nso far').summary).toBe('A "tight" month,\nso far');
    expect(previewFromPartial('{"summary": "ends on a backslash \\').summary).toBe('ends on a backslash');
  });

  it('counts the suggestions that have landed', () => {
    const half = '{"summary": "x", "caps": [{"category": "A", "monthlyCap": 1, "why": "b"}], "actions": [{"title": "t", "detail": "d", "priority": "now"}, {"title": "u"';
    expect(previewFromPartial(half)).toEqual({ summary: 'x', rows: 1, actions: 1 });
  });

  it('ignores a reasoning preamble', () => {
    expect(previewFromPartial('<think>hmm, their rent is high</think>{"summary": "Rent leads').summary).toBe('Rent leads');
  });
});
