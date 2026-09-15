/**
 * The instructions, the answer shape, and reading whatever comes back.
 *
 * General guidance only, by design: asset classes and generic instrument types,
 * never a named fund, stock, ticker, coin or provider. Recommending specific
 * products to a specific person is regulated advice in most places, and a
 * disclaimer does not change that.
 *
 * The parser is deliberately forgiving. Free and local models wrap JSON in
 * prose, code fences or reasoning tags, and a strict parser would make most of
 * them unusable; what matters is that nothing reaches the page except fields
 * this module has checked, rendered as text.
 */

export const DISCLAIMER =
  'AI-generated general guidance, not personal advice from a registered investment adviser. ' +
  'Investments are subject to market risk: values can fall as well as rise, and past performance ' +
  'does not guarantee future returns. Read all product and scheme documents carefully, and consider ' +
  'speaking to a qualified adviser before acting.';

export const ADVICE_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['summary', 'allocation', 'actions', 'risks', 'assumptions'],
  properties: {
    summary: { type: 'string' },
    allocation: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['assetClass', 'targetPct', 'why'],
        properties: {
          assetClass: { type: 'string' },
          targetPct: { type: 'number' },
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

export const SYSTEM_PROMPT = `You give general, educational personal-finance and investment guidance based on a summary of one person's finances.

Rules:
- General guidance only. Do not name specific funds, ETFs, stocks, bonds, cryptocurrencies, tickers, fund houses, banks, brokers, apps or insurance products. Speak in asset classes and generic instrument types, for example "a low-cost, broadly diversified index fund", "government bonds", "fixed deposits", "a high-interest savings account".
- Ground every point in the figures provided and quote them. If something needed is missing, say what and keep the guidance conditional.
- Work in this order unless the figures clearly say otherwise: an emergency cushion of roughly 3–6 months of spending; high-interest debt; savings goals with deadlines; then long-term investing matched to the stated horizon and risk tolerance.
- Never promise or estimate specific returns, and do not state current prices, rates or market levels — you do not have live data.
- If the country or region is given, you may mention general features that commonly exist there (such as tax-advantaged retirement accounts) in generic terms, noting that rules change and should be checked.
- The allocation is a suggested long-term mix across asset classes that sums to 100. Use an empty list if investing is not yet appropriate, and explain why in the summary.
- 3 to 6 actions, each specific to these figures. priority is "now", "soon" or "later".
- Plain text in every field: no markdown, no HTML.

Reply with only a JSON object matching the schema you are given.`;

export function userMessage(summary) {
  return [
    `A summary of my finances. All money is in ${summary.currency}.`,
    '',
    JSON.stringify(summary, null, 2),
    '',
    'Reply with only a JSON object matching this JSON schema:',
    JSON.stringify(ADVICE_SCHEMA),
  ].join('\n');
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

export function parseAdvice(raw) {
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

  let allocation = Array.isArray(data?.allocation)
    ? data.allocation
        .map((x) => ({ assetClass: text(x?.assetClass), targetPct: Math.max(0, Number(x?.targetPct) || 0), why: text(x?.why) }))
        .filter((x) => x.assetClass && x.targetPct > 0)
    : [];

  // Models are bad at adding up. Rescale rather than show a mix of 130%.
  const total = allocation.reduce((s, x) => s + x.targetPct, 0);
  const rescaled = total > 0 && Math.abs(total - 100) > 1;
  if (rescaled) allocation = allocation.map((x) => ({ ...x, targetPct: (x.targetPct * 100) / total }));
  allocation = allocation.map((x) => ({ ...x, targetPct: Math.round(x.targetPct) }));

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
  if (!summary && !actions.length && !allocation.length) {
    throw new AdviceFormatError('The model answered, but without any guidance in it.', raw);
  }

  return { summary, allocation, actions, risks: texts(data?.risks), assumptions: texts(data?.assumptions), rescaled };
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
    ...(advice?.allocation || []).flatMap((x) => [x.assetClass, x.why]),
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
