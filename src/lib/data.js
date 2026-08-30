/**
 * The app's vocabulary: the three ledger kinds, their categories, the asset
 * classes an investment can belong to, and the currencies we can format.
 *
 * Kept as plain data in one file so a category is defined exactly once — its
 * label, its icon, its colour and, where it makes sense, a default share of
 * take-home pay used to seed budgets during onboarding.
 */

/* ─────────────────────────────── Ledger kinds ─────────────────────────────── */

export const KINDS = [
  {
    id: 'earning',
    label: 'Earning',
    plural: 'Earnings',
    verb: 'earned',
    icon: 'trendUp',
    tone: 'earn',
    sign: 1,
    blurb: 'Money arriving — salary, freelance, interest, refunds.',
  },
  {
    id: 'expense',
    label: 'Expense',
    plural: 'Expenses',
    verb: 'spent',
    icon: 'trendDown',
    tone: 'spend',
    sign: -1,
    blurb: 'Money leaving — the day-to-day cost of living.',
  },
  {
    id: 'saving',
    label: 'Saving',
    plural: 'Savings',
    verb: 'saved',
    icon: 'piggy',
    tone: 'save',
    sign: -1,
    blurb: 'Money set aside on purpose. It leaves your account but stays yours.',
  },
];

export const kindById = (id) => KINDS.find((k) => k.id === id) || KINDS[1];

/* ──────────────────────────────── Categories ──────────────────────────────── */

/**
 * `share` is a rough share of monthly take-home pay, used only to propose an
 * opening budget during onboarding. They are conventional planning heuristics
 * (a housing figure near 30%, groceries near 10%), not advice — every one of
 * them is editable, and the app never silently re-applies them afterwards.
 */
export const CATEGORIES = {
  expense: [
    { id: 'housing',       label: 'Rent & Housing',   icon: 'home',      color: '#f472b6', share: 0.28 },
    { id: 'groceries',     label: 'Groceries',        icon: 'basket',    color: '#fb923c', share: 0.10 },
    { id: 'dining',        label: 'Food & Dining',    icon: 'cup',       color: '#f43f5e', share: 0.06 },
    { id: 'transport',     label: 'Transport',        icon: 'car',       color: '#38bdf8', share: 0.06 },
    { id: 'utilities',     label: 'Bills & Utilities',icon: 'bolt',      color: '#facc15', share: 0.05 },
    { id: 'health',        label: 'Health',           icon: 'heart',     color: '#4ade80', share: 0.04 },
    { id: 'shopping',      label: 'Shopping',         icon: 'bag',       color: '#c084fc', share: 0.05 },
    { id: 'entertainment', label: 'Entertainment',    icon: 'play',      color: '#a78bfa', share: 0.03 },
    { id: 'subscriptions', label: 'Subscriptions',    icon: 'repeat',    color: '#22d3ee', share: 0.02 },
    { id: 'education',     label: 'Education',        icon: 'book',      color: '#60a5fa', share: 0.03 },
    { id: 'travel',        label: 'Travel',           icon: 'plane',     color: '#2dd4bf', share: 0.03 },
    { id: 'family',        label: 'Family & Gifts',   icon: 'gift',      color: '#f9a8d4', share: 0.02 },
    { id: 'debt',          label: 'Loan & EMI',       icon: 'bank',      color: '#fb7185', share: 0.00 },
    { id: 'other-expense', label: 'Other',            icon: 'dots',      color: '#94a3b8', share: 0.02 },
  ],
  earning: [
    { id: 'salary',        label: 'Salary',           icon: 'wallet',    color: '#10b981' },
    { id: 'freelance',     label: 'Freelance',        icon: 'laptop',    color: '#34d399' },
    { id: 'business',      label: 'Business',         icon: 'store',     color: '#6ee7b7' },
    { id: 'interest',      label: 'Interest',         icon: 'percent',   color: '#22d3ee' },
    { id: 'dividend',      label: 'Dividends',        icon: 'coins',     color: '#a3e635' },
    { id: 'rental',        label: 'Rental income',    icon: 'key',       color: '#4ade80' },
    { id: 'refund',        label: 'Refund',           icon: 'undo',      color: '#94a3b8' },
    { id: 'gift-in',       label: 'Gift received',    icon: 'gift',      color: '#f9a8d4' },
    { id: 'other-earning', label: 'Other',            icon: 'dots',      color: '#94a3b8' },
  ],
  saving: [
    { id: 'emergency',     label: 'Emergency fund',   icon: 'shield',    color: '#38bdf8' },
    { id: 'goal',          label: 'Goal savings',     icon: 'target',    color: '#0ea5e9' },
    { id: 'retirement',    label: 'Retirement',       icon: 'hourglass', color: '#818cf8' },
    { id: 'invest-transfer', label: 'To investments', icon: 'chart',     color: '#fbbf24' },
    { id: 'debt-payoff',   label: 'Extra debt payoff',icon: 'bank',      color: '#2dd4bf' },
    { id: 'other-saving',  label: 'Other',            icon: 'dots',      color: '#94a3b8' },
  ],
};

export const categoriesFor = (kind) => CATEGORIES[kind] || CATEGORIES.expense;

const CATEGORY_INDEX = Object.fromEntries(
  Object.values(CATEGORIES).flat().map((c) => [c.id, c])
);

/** Never returns undefined — a deleted or renamed category still renders. */
export const categoryById = (id) =>
  CATEGORY_INDEX[id] || { id, label: 'Uncategorised', icon: 'dots', color: '#94a3b8' };

/* ────────────────────────────── Asset classes ────────────────────────────── */

/**
 * `risk` drives the allocation commentary in the advisor: roughly how much a
 * holding can move in a bad year. It is a coarse 1–5 scale, deliberately not
 * dressed up as a volatility figure it has not earned.
 */
export const ASSET_CLASSES = [
  { id: 'equity',   label: 'Stocks',        icon: 'chart',   color: '#8e6bff', risk: 4 },
  { id: 'fund',     label: 'Mutual funds',  icon: 'layers',  color: '#38bdf8', risk: 3 },
  { id: 'retire',   label: 'Retirement',    icon: 'hourglass', color: '#818cf8', risk: 3 },
  { id: 'bond',     label: 'Bonds & FDs',   icon: 'bank',    color: '#34d399', risk: 1 },
  { id: 'gold',     label: 'Gold',          icon: 'coins',   color: '#fbbf24', risk: 2 },
  { id: 'crypto',   label: 'Crypto',        icon: 'spark',   color: '#fb7185', risk: 5 },
  { id: 'property', label: 'Property',      icon: 'home',    color: '#2dd4bf', risk: 3 },
  { id: 'cash',     label: 'Cash & liquid', icon: 'wallet',  color: '#94a3b8', risk: 0 },
];

export const assetClassById = (id) =>
  ASSET_CLASSES.find((a) => a.id === id) || ASSET_CLASSES[ASSET_CLASSES.length - 1];

/* ──────────────────────────────── Currencies ─────────────────────────────── */

/**
 * The locale matters as much as the symbol: `en-IN` groups as 1,00,000 and
 * abbreviates to L and Cr, which is what an Indian user expects to read and
 * what `en-US` gets wrong.
 */
export const CURRENCIES = [
  { code: 'INR', symbol: '₹',  locale: 'en-IN', label: 'Indian rupee' },
  { code: 'USD', symbol: '$',  locale: 'en-US', label: 'US dollar' },
  { code: 'EUR', symbol: '€',  locale: 'de-DE', label: 'Euro' },
  { code: 'GBP', symbol: '£',  locale: 'en-GB', label: 'Pound sterling' },
  { code: 'AED', symbol: 'د.إ', locale: 'en-AE', label: 'UAE dirham' },
  { code: 'SGD', symbol: 'S$', locale: 'en-SG', label: 'Singapore dollar' },
  { code: 'CAD', symbol: 'C$', locale: 'en-CA', label: 'Canadian dollar' },
  { code: 'AUD', symbol: 'A$', locale: 'en-AU', label: 'Australian dollar' },
  { code: 'JPY', symbol: '¥',  locale: 'ja-JP', label: 'Japanese yen' },
];

export const currencyByCode = (code) =>
  CURRENCIES.find((c) => c.code === code) || CURRENCIES[0];

/* ───────────────────────────── Quick-add presets ─────────────────────────── */

/**
 * One tap fills the form. Most people's ledger is thirty-odd repeated things,
 * and the difference between a tracker that survives month three and one that
 * does not is almost entirely how long a single entry takes.
 */
export const QUICK_ADD = [
  { kind: 'expense', category: 'dining',        title: 'Lunch' },
  { kind: 'expense', category: 'dining',        title: 'Coffee' },
  { kind: 'expense', category: 'transport',     title: 'Cab' },
  { kind: 'expense', category: 'groceries',     title: 'Groceries' },
  { kind: 'expense', category: 'subscriptions', title: 'Subscription' },
  { kind: 'earning', category: 'salary',        title: 'Salary' },
  { kind: 'saving',  category: 'emergency',     title: 'Emergency fund' },
];
