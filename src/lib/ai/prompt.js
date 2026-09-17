/**
 * The instructions, the answer shape, and reading whatever comes back.
 *
 * General guidance only, by design: asset classes and generic instrument types,
 * never a named fund, stock, ticker, coin or provider. Recommending specific
 * products to a specific person is regulated advice in most places, and a
 * disclaimer does not change that.
 *
 * Three topics, because the same model is asked three different questions:
 * investing (a long-term mix), spending (monthly caps), and saving (where the
 * money you keep should go). Each has its own instructions, answer shape and
 * disclaimer; everything after that — parsing, rendering, dismissing — is
 * shared, so the answer is normalised into one row shape here.
 *
 * The parser is deliberately forgiving. Free and local models wrap JSON in
 * prose, code fences or reasoning tags, and a strict parser would make most of
 * them unusable; what matters is that nothing reaches the page except fields
 * this module has checked, rendered as text.
 */

export const DISCLAIMERS = {
  investing:
    'AI-generated general guidance, not personal advice from a registered investment adviser. ' +
    'Investments are subject to market risk: values can fall as well as rise, and past performance ' +
    'does not guarantee future returns. Read all product and scheme documents carefully, and consider ' +
    'speaking to a qualified adviser before acting.',
  spending:
    'AI-generated general guidance, not personal financial advice. It reads only the figures you logged, ' +
    'so it cannot know what a category was for or what is unavoidable in your life. Treat any suggested ' +
    'cap as a starting point to adjust, not a rule.',
  saving:
    'AI-generated general guidance, not personal advice from a registered adviser. It reads only the figures ' +
    'you logged. Anything invested rather than held as cash is subject to market risk — values can fall as ' +
    'well as rise — and rates, tax rules and account types change.',
  budgets:
    'AI-generated general guidance, not personal financial advice. It reads only the figures you logged, so it ' +
    'cannot know which of your costs are fixed by contract or what a category was for. Treat any cap as a ' +
    'starting point to adjust, not a rule.',
  debt:
    'AI-generated general guidance, not personal financial or debt advice. It reads only the figures you ' +
    'logged and cannot see your loan agreements, fees or penalties. Keep paying at least the required minimum ' +
    'on every debt, check the terms before changing anything, and if repayments are becoming unmanageable, ' +
    'consider a free debt advice service in your country.',
};

export const disclaimerFor = (topic) => DISCLAIMERS[topic] || DISCLAIMERS.investing;

/**
 * How each topic's rows are named on the wire and on the page.
 *
 * `key` is the array the model returns, `label`/`value` its fields, and `unit`
 * decides both the rendering and whether the numbers are expected to add to 100.
 */
export const ROW_SHAPE = {
  investing: { key: 'allocation', label: 'assetClass', value: 'targetPct', unit: 'percent', title: 'Suggested long-term mix' },
  spending: { key: 'caps', label: 'category', value: 'monthlyCap', unit: 'money', title: 'Suggested monthly caps' },
  saving: { key: 'split', label: 'purpose', value: 'monthlyAmount', unit: 'money', title: 'Where each month\'s savings could go' },
  budgets: { key: 'caps', label: 'category', value: 'monthlyCap', unit: 'money', title: 'Suggested budgets' },
  debt: { key: 'plan', label: 'debt', value: 'monthlyAmount', unit: 'money', title: 'Suggested monthly payments' },
};

const schemaFor = (topic) => {
  const shape = ROW_SHAPE[topic];
  return {
    type: 'object',
    additionalProperties: false,
    required: ['summary', shape.key, 'actions', 'risks', 'assumptions'],
    properties: {
      summary: { type: 'string' },
      [shape.key]: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          required: [shape.label, shape.value, 'why'],
          properties: {
            [shape.label]: { type: 'string' },
            [shape.value]: { type: 'number' },
            why: { type: 'string' },
          },
        },
      },
      actions: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['title', 'detail', 'priority'],
          properties: {
            title: { type: 'string' },
            detail: { type: 'string' },
            priority: { type: 'string', enum: ['now', 'soon', 'later'] },
          },
        },
      },
      risks: { type: 'array', items: { type: 'string' } },
      assumptions: { type: 'array', items: { type: 'string' } },
    },
  };
};

export const SCHEMAS = {
  investing: schemaFor('investing'),
  spending: schemaFor('spending'),
  saving: schemaFor('saving'),
  budgets: schemaFor('budgets'),
  debt: schemaFor('debt'),
};

export const schemaOf = (topic) => SCHEMAS[topic] || SCHEMAS.investing;

const SHARED_RULES = `- Ground every point in the figures provided and quote them. If something needed is missing, say what, and keep the guidance conditional.
- Never promise or estimate specific returns, and do not state current prices, rates or market levels — you do not have live data.
- Do not name specific funds, ETFs, stocks, bonds, cryptocurrencies, tickers, fund houses, banks, brokers, apps or insurance products. Speak in generic types, for example "a low-cost, broadly diversified index fund", "a high-interest savings account", "fixed deposits".
- If a country or region is given, you may mention general features that commonly exist there (such as tax-advantaged accounts) in generic terms, noting that rules change and should be checked.
- 3 to 6 actions, each specific to these figures. priority is "now", "soon" or "later".
- Plain text in every field: no markdown, no HTML.
- Reply with only a JSON object matching the schema you are given.`;

export const SYSTEM_PROMPTS = {
  investing: `You give general, educational personal-finance and investment guidance based on a summary of one person's finances.

Rules:
- General guidance only. Work in asset classes and generic instrument types.
- Work in this order unless the figures clearly say otherwise: an emergency cushion of roughly 3–6 months of spending; high-interest debt; savings goals with deadlines; then long-term investing matched to the stated horizon and risk tolerance.
- "allocation" is a suggested long-term mix across asset classes whose percentages sum to 100. Use an empty list if investing is not yet appropriate, and say why in the summary.
${SHARED_RULES}`,

  spending: `You give general, educational guidance on someone's spending, based on a summary of what they logged.

Rules:
- Describe what the figures show before suggesting anything, and be specific: name the categories and the amounts.
- Respect that much spending is not discretionary. Housing, debt repayments, utilities and insurance are usually fixed in the short term; say so rather than suggesting they simply be cut.
- Never moralise, shame, or single out small pleasures as the problem when the large fixed costs dominate. A person who is fine overall should be told so.
- "caps" is a short list of suggested monthly limits in their currency, for the few categories where a limit would actually change something. Each must be realistic against what they typically spend — a cap far below recent months is not a plan. Use an empty list if caps would not help, and say why.
- Where a cap frees money, say what it frees per month and what it could go toward.
${SHARED_RULES}`,

  saving: `You give general, educational guidance on saving, based on a summary of someone's finances.

Rules:
- What they "keep" is income minus spending. Money kept is not automatically moved anywhere — say where it currently sits if that matters.
- Work in this order unless the figures say otherwise: an emergency cushion of roughly 3–6 months of spending, held somewhere it can be reached without selling anything; then debts costing more than savings can earn; then goals with deadlines; then longer-term saving or investing.
- "split" is a suggested division of what they keep each month, in their currency, by purpose (for example an emergency cushion, a named goal number from the summary, longer-term investing). The amounts should add up to roughly what they actually keep in a typical month, not more.
- If they keep little or nothing, say that plainly and point at the spending side instead of inventing a split.
${SHARED_RULES}`,

  budgets: `You give general, educational guidance on setting monthly budgets, based on a summary of what someone logged.

Rules:
- A budget only works if it is realistic. Compare every suggested cap with what they typically spend in that category and say plainly when a cap is a stretch rather than a description.
- Caps plus their savings target must not exceed their income. If the caps they already have do, say so and say what has to give.
- Fixed costs — housing, debt repayments, utilities, insurance — are not where a cap changes behaviour. Set those at what they actually cost, and put the discipline into the categories that vary.
- Not every category needs a cap. Fewer, well-chosen caps beat a full set; leave a category out rather than inventing a number for it.
- "caps" is the suggested monthly budget per category, in their currency, for the categories worth capping.
${SHARED_RULES}`,

  debt: `You give general, educational guidance on paying down debt, based on a summary of what someone owes.

Rules:
- Every debt must keep receiving at least its required minimum payment. A plan that starves one to clear another faster is not a plan; say so if the figures tempt it.
- Explain the trade-off between paying the highest interest rate first (cheapest overall) and the smallest balance first (quicker visible progress), and say which the figures here favour and why.
- Weigh clearing debt against keeping a small cash cushion, and against money going into investments. Say when building a cushion first is the safer order.
- Do not name lenders, refinancing products, consolidation companies or balance-transfer offers. Generic types only, noting that fees, terms and penalties vary and must be checked before acting.
- "plan" is the suggested monthly payment per debt, in their currency, using the debt types from the summary. The total must be affordable against what they typically keep each month.
${SHARED_RULES}`,
};

export const systemPromptFor = (topic) => SYSTEM_PROMPTS[topic] || SYSTEM_PROMPTS.investing;

export function userMessage(summary, topic = 'investing') {
  return [
    `A summary of my finances. All money is in ${summary.currency}.`,
    '',
    JSON.stringify(summary, null, 2),
    '',
    'Reply with only a JSON object matching this JSON schema:',
    JSON.stringify(schemaOf(topic)),
  ].join('\n');
}

/**
 * What to show while the answer is still arriving.
 *
 * The wire carries JSON, and streaming raw JSON at someone is worse than a
 * spinner. This pulls the human-readable parts out of a half-finished object:
 * the summary as it is typed, and how many suggestions have landed so far.
 * Deliberately string-based — `JSON.parse` cannot read an unfinished object,
 * and a half-written string is exactly what we want to display.
 */
export function previewFromPartial(raw) {
  if (typeof raw !== 'string' || !raw) return { summary: '', rows: 0, actions: 0 };

  const body = raw.replace(/<think>[\s\S]*?<\/think>/gi, '');
  let summary = '';
  const at = body.search(/"summary"\s*:\s*"/);
  if (at !== -1) {
    const from = body.indexOf('"', body.indexOf(':', at)) + 1;
    for (let i = from; i < body.length; i++) {
      const c = body[i];
      if (c === '\\') {
        // An escape pair, or a backslash that has not been completed yet.
        const next = body[i + 1];
        summary += next === 'n' ? '\n' : next === 't' ? '\t' : next === undefined ? '' : next;
        i++;
        continue;
      }
      if (c === '"') break;
      summary += c;
    }
  }

  return {
    summary: summary.trim(),
    rows: (body.match(/"why"\s*:/g) || []).length,
    actions: (body.match(/"priority"\s*:/g) || []).length,
  };
}

export class AdviceFormatError extends Error {
  constructor(message, raw = '') {
    super(message);
    this.name = 'AdviceFormatError';
    this.raw = raw;
  }
}

const PRIORITIES = ['now', 'soon', 'later'];
const text = (v) => (typeof v === 'string' ? v.trim() : '');
const texts = (v) => (Array.isArray(v) ? v.map(text).filter(Boolean) : []);

export function parseAdvice(raw, topic = 'investing') {
  const shape = ROW_SHAPE[topic] || ROW_SHAPE.investing;

  if (typeof raw !== 'string' || !raw.trim()) {
    throw new AdviceFormatError('The model returned an empty answer.', raw || '');
  }

  // Reasoning models often think out loud before the answer.
  let body = raw.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
  const fenced = body.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced) body = fenced[1].trim();

  const start = body.indexOf('{');
  const end = body.lastIndexOf('}');
  if (start === -1 || end <= start) {
    throw new AdviceFormatError('The model did not answer in the expected format.', raw);
  }

  let data;
  try {
    data = JSON.parse(body.slice(start, end + 1));
  } catch {
    throw new AdviceFormatError('The model did not answer in the expected format.', raw);
  }

  let rows = Array.isArray(data?.[shape.key])
    ? data[shape.key]
        .map((x) => ({ label: text(x?.[shape.label]), value: Math.max(0, Number(x?.[shape.value]) || 0), why: text(x?.why) }))
        .filter((x) => x.label && x.value > 0)
    : [];

  // Percentages are meant to add to 100 and models are bad at adding up;
  // amounts of money are not, so they are left alone.
  const total = rows.reduce((s, x) => s + x.value, 0);
  const rescaled = shape.unit === 'percent' && total > 0 && Math.abs(total - 100) > 1;
  if (rescaled) rows = rows.map((x) => ({ ...x, value: (x.value * 100) / total }));
  if (shape.unit === 'percent') rows = rows.map((x) => ({ ...x, value: Math.round(x.value) }));

  const actions = Array.isArray(data?.actions)
    ? data.actions
        .map((x) => ({
          title: text(x?.title),
          detail: text(x?.detail),
          priority: PRIORITIES.includes(x?.priority) ? x.priority : 'soon',
        }))
        .filter((x) => x.title)
    : [];

  const summary = text(data?.summary);
  if (!summary && !actions.length && !rows.length) {
    throw new AdviceFormatError('The model answered, but without any guidance in it.', raw);
  }

  return {
    topic,
    summary,
    rows,
    rowsTitle: shape.title,
    unit: shape.unit,
    actions,
    risks: texts(data?.risks),
    assumptions: texts(data?.assumptions),
    rescaled,
  };
}

/*
 * Common acronyms that look like tickers in parentheses but are generic
 * instrument or account types — flagging "(ETF)" would cry wolf on every answer.
 */
const GENERIC = new Set([
  'ETF', 'ETFS', 'SIP', 'SIPS', 'PPF', 'EPF', 'VPF', 'NPS', 'EMI', 'FD', 'FDS', 'RD', 'ELSS', 'REIT', 'REITS',
  'ISA', 'LISA', 'SIPP', 'IRA', 'TFSA', 'RRSP', 'FHSA', 'CPF', 'SRS', 'SGB', 'ULIP', 'NAV', 'TER', 'APR', 'APY',
  'GDP', 'CD', 'CDS', 'HYSA', 'UCITS', 'PRSA', 'PEPP', 'SSY', 'SCSS', 'NSC', 'KVP', 'MF', 'MFS', 'US', 'UK', 'EU',
  'INR', 'EUR', 'USD', 'GBP', 'AED', 'SGD', 'CAD', 'AUD', 'JPY', 'KYC', 'AMC', 'SEBI', 'RBI',
]);

/**
 * A best-effort check that an answer stayed general. It cannot prove a
 * negative; it catches the common shapes — exchange-prefixed tickers, tickers
 * in parentheses, ISINs — so the page can say so rather than stay silent.
 */
export function namesSpecificProducts(advice) {
  const all = [
    advice?.summary,
    ...(advice?.rows || []).flatMap((x) => [x.label, x.why]),
    ...(advice?.actions || []).flatMap((x) => [x.title, x.detail]),
    ...(advice?.risks || []),
    ...(advice?.assumptions || []),
  ].filter(Boolean).join('\n');

  if (/\b(?:NYSE|NASDAQ|NSE|BSE|LSE|TSX|ASX|XETRA|AMEX|EURONEXT)\s*:\s*[A-Z0-9.]{1,12}\b/i.test(all)) return true;
  if (/\b[A-Z]{2}[A-Z0-9]{9}[0-9]\b/.test(all)) return true;
  if (/\bticker\b/i.test(all)) return true;
  for (const m of all.matchAll(/\(([A-Z]{2,6}(?:\.[A-Z]{1,3})?)\)/g)) {
    if (!GENERIC.has(m[1].split('.')[0])) return true;
  }
  return false;
}
