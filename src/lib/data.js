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
    label: 'Set aside',
    plural: 'Set aside',
    verb: 'set aside',
    icon: 'piggy',
    tone: 'save',
    /**
     * Zero, because setting money aside does not make you poorer.
     *
     * This used to be -1, and that single number was the source of most of the
     * confusion in this app: a transfer to a savings pot was treated as though
     * the money had gone, so nothing accumulated, every month restarted from
     * zero, and putting aside more than you earned made the month look like a
     * disaster. Moving money between your own pots is a transfer, not a loss.
     */
    sign: 0,
    blurb: 'Money moved into a savings pot. Still yours — it just stops being spending money.',
  },
  {
    id: 'withdrawal',
    label: 'Take out',
    plural: 'Taken out',
    verb: 'took out',
    icon: 'undo',
    tone: 'invest',
    sign: 0,
    blurb: 'Money taken back out of savings, to spend or to use for something.',
  },
];

export const kindById = (id) => KINDS.find((k) => k.id === id) || KINDS[1];

/**
 * What to put in front of an amount in a list.
 *
 * Savings and withdrawals are transfers between your own pots, so a minus sign
 * would say the money is gone when it is merely somewhere else. Arrows say
 * which way it moved without implying it was lost.
 */
export const KIND_PREFIX = { earning: '+', expense: '−', saving: '→', withdrawal: '←' };
export const prefixFor = (kind) => KIND_PREFIX[kind] ?? '−';

/* ──────────────────────────────── Categories ──────────────────────────────── */

/**
 * `share` is a rough share of monthly take-home pay, used only to propose an
 * opening budget during onboarding. They are conventional planning heuristics
 * (a housing figure near 30%, groceries near 10%), not advice — every one of
 * them is editable, and the app never silently re-applies them afterwards.
 */
/*
 * Category colours — the Paper palette.
 *
 * Muted, earthy tones (clay, brick, ochre, olive, sage, pine, slate, indigo,
 * plum, stone) rather than saturated screen colours, so a donut or a list of
 * category icons reads as ink on paper. Each was solved for lightness, not
 * picked: these are drawn as icons and chart marks on *both* the ivory page and
 * the charcoal one, and every colour holds at least 3.7:1 against all four
 * backgrounds — above the 3:1 that graphics need. Hue and saturation set the
 * character; lightness is fixed by that constraint.
 */
export const CATEGORIES = {
  expense: [
    { id: 'housing',       label: 'Rent & Housing',   icon: 'home',      color: '#b16248', share: 0.28 },
    { id: 'groceries',     label: 'Groceries',        icon: 'basket',    color: '#737d35', share: 0.10 },
    { id: 'dining',        label: 'Food & Dining',    icon: 'cup',       color: '#b95963', share: 0.06 },
    { id: 'transport',     label: 'Transport',        icon: 'car',       color: '#4f7ba7', share: 0.06 },
    { id: 'utilities',     label: 'Bills & Utilities',icon: 'bolt',      color: '#977026', share: 0.05 },
    { id: 'health',        label: 'Health',           icon: 'heart',     color: '#4f8260', share: 0.04 },
    { id: 'shopping',      label: 'Shopping',         icon: 'bag',       color: '#9168a4', share: 0.05 },
    { id: 'entertainment', label: 'Entertainment',    icon: 'play',      color: '#98698d', share: 0.03 },
    { id: 'subscriptions', label: 'Subscriptions',    icon: 'repeat',    color: '#398282', share: 0.02 },
    { id: 'education',     label: 'Education',        icon: 'book',      color: '#6a73b2', share: 0.03 },
    { id: 'travel',        label: 'Travel',           icon: 'plane',     color: '#4a8172', share: 0.03 },
    { id: 'family',        label: 'Family & Gifts',   icon: 'gift',      color: '#b25d71', share: 0.02 },
    { id: 'debt',          label: 'Loan & EMI',       icon: 'bank',      color: '#a76837', share: 0.00 },
    { id: 'other-expense', label: 'Other',            icon: 'dots',      color: '#7c776c', share: 0.02 },
  ],
  earning: [
    { id: 'salary',        label: 'Salary',           icon: 'wallet',    color: '#3c855b' },
    { id: 'freelance',     label: 'Freelance',        icon: 'laptop',    color: '#4f8260' },
    { id: 'business',      label: 'Business',         icon: 'store',     color: '#657f4b' },
    { id: 'interest',      label: 'Interest',         icon: 'percent',   color: '#398282' },
    { id: 'dividend',      label: 'Dividends',        icon: 'coins',     color: '#737d35' },
    { id: 'rental',        label: 'Rental income',    icon: 'key',       color: '#4a8172' },
    { id: 'refund',        label: 'Refund',           icon: 'undo',      color: '#7c776c' },
    { id: 'gift-in',       label: 'Gift received',    icon: 'gift',      color: '#b25d71' },
    { id: 'other-earning', label: 'Other',            icon: 'dots',      color: '#7c776c' },
  ],
  saving: [
    { id: 'emergency',     label: 'Emergency fund',   icon: 'shield',    color: '#4f7ba7' },
    { id: 'goal',          label: 'Goal savings',     icon: 'target',    color: '#6a73b2' },
    { id: 'retirement',    label: 'Retirement',       icon: 'hourglass', color: '#9168a4' },
    { id: 'invest-transfer', label: 'To investments', icon: 'chart',     color: '#977026' },
    { id: 'debt-payoff',   label: 'Extra debt payoff',icon: 'bank',      color: '#4a8172' },
    { id: 'other-saving',  label: 'Other',            icon: 'dots',      color: '#7c776c' },
  ],
};

/**
 * A withdrawal answers "out of which pot?", which is the same list a saving
 * answers "into which pot?" — so they deliberately share one set rather than
 * having a near-duplicate that can drift.
 */
export const categoriesFor = (kind) =>
  kind === 'withdrawal' ? CATEGORIES.saving : CATEGORIES[kind] || CATEGORIES.expense;

const CATEGORY_INDEX = Object.fromEntries(
  Object.values(CATEGORIES).flat().map((c) => [c.id, c])
);

/** Never returns undefined — a deleted or renamed category still renders. */
export const categoryById = (id) =>
  CATEGORY_INDEX[id] || { id, label: 'Uncategorised', icon: 'dots', color: '#7c776c' };

/* ────────────────────────────── Asset classes ────────────────────────────── */

/**
 * `risk` drives the allocation commentary in the advisor: roughly how much a
 * holding can move in a bad year. It is a coarse 1–5 scale, deliberately not
 * dressed up as a volatility figure it has not earned.
 */
export const ASSET_CLASSES = [
  { id: 'equity',   label: 'Stocks',        icon: 'chart',   color: '#9168a4', risk: 4 },
  { id: 'fund',     label: 'Mutual funds',  icon: 'layers',  color: '#4f7ba7', risk: 3 },
  { id: 'retire',   label: 'Retirement',    icon: 'hourglass', color: '#6a73b2', risk: 3 },
  { id: 'bond',     label: 'Bonds & FDs',   icon: 'bank',    color: '#4f8260', risk: 1 },
  { id: 'gold',     label: 'Gold',          icon: 'coins',   color: '#977026', risk: 2 },
  { id: 'crypto',   label: 'Crypto',        icon: 'spark',   color: '#b95963', risk: 5 },
  { id: 'property', label: 'Property',      icon: 'home',    color: '#b16248', risk: 3 },
  { id: 'cash',     label: 'Cash & liquid', icon: 'wallet',  color: '#7c776c', risk: 0 },
];

/**
 * What you owe.
 *
 * `revolving` marks the debts that regenerate if you keep using them — a credit
 * card paid down and spent again is a different problem from a mortgage, and the
 * advice for the two is not the same.
 */
export const DEBT_CLASSES = [
  { id: 'mortgage', label: 'Mortgage', icon: 'home', color: '#b16248', revolving: false },
  { id: 'card', label: 'Credit card', icon: 'wallet', color: '#b95963', revolving: true },
  { id: 'personal', label: 'Personal loan', icon: 'bank', color: '#a76837', revolving: false },
  { id: 'car', label: 'Car loan', icon: 'car', color: '#4f7ba7', revolving: false },
  { id: 'student', label: 'Student loan', icon: 'book', color: '#98698d', revolving: false },
  { id: 'overdraft', label: 'Overdraft', icon: 'drop', color: '#977026', revolving: true },
  { id: 'other-debt', label: 'Other', icon: 'dots', color: '#7c776c', revolving: false },
];

export const debtClassById = (id) =>
  DEBT_CLASSES.find((d) => d.id === id) || DEBT_CLASSES[DEBT_CLASSES.length - 1];

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
