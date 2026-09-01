# CoinTrack

**Live: <https://cointrack.ark07yad.workers.dev>**

A local-first expense tracker. Log what you earn, spend and save; see it by week,
month, quarter and year; keep a running figure for what your investments are
worth; and get plain, numeric suggestions about the parts that need attention.

Everything lives in the browser. There is no account, no server and no sync —
the data is stored in IndexedDB with a localStorage mirror, and nothing is ever
sent anywhere.

```bash
npm install && npm run dev
```

Then open <http://localhost:5181>. `npm run build` produces a static `dist/`,
`npm run lint` runs oxlint, and `npm test` runs the suite.

On first run you can either set up a profile or load five months of generated
sample data — the sample set is seeded, so it comes out the same every time, and
it is deliberately imperfect (one overspent month, an uneven freelance income, a
holding nobody has revalued) so the charts and the advisor have something real to
say.

## The screens

| | |
|---|---|
| **Home** | This month at a glance: a spend dial against your budgets with a pace marker, in/out/saved with change against last month, the three most urgent suggestions, a 30-day spend trend, the category mix, budget bars and net worth. |
| **Ledger** | The daily log. A fourteen-day rhythm strip, one day's entries with running totals, and a searchable archive of everything grouped by date. Each entry has a title, an amount, a category, a date and an optional description. Recurring entries are offered here for confirmation, and their schedules are managed at the bottom. |
| **Trends** | The same four questions at four zoom levels — week, month, quarter, year — with a cash-flow chart, a running-total view against a paced budget, a stacked category-mix view, a breakdown donut, biggest movements against the previous period, a per-category table, a daily-spend heatmap and a side-by-side comparison table. |
| **Invest** | Holdings and net worth. You enter what each holding is worth at the end of a month and what you paid in that month; the chart plots value against contributions so growth is separable from deposits. Includes allocation by asset class, per-holding gain, a stale-value warning and a contribution history table. |
| **Advice** | The suggestion box. Pick a section — the whole picture, spending, budgets, income, savings, investments, or a single category — and get rules applied to your own entries, plus a place to keep your own notes. |
| **Settings** | Profile, currency, budgets, and your data: export, restore, sample data, erase. |

## How it is put together

React 19, Vite, Tailwind v4 and Recharts. No UI kit, no icon package, no state
library — the icons are inline SVG, the motion is hand-rolled on
`requestAnimationFrame` and the Web Animations API, and state is one object in a
reducer behind a context.

```
src/
  lib/
    calc.js        dates, period ranges, bucketing, money formatting
    recurring.js   schedules for repeating entries
    data.js        the three ledger kinds, categories, asset classes, currencies
    useFinance.js  every derived number, as pure functions plus thin hooks
    insights.js    the rule engine behind the advisor
    store.jsx      state, reducer, persistence, theme
    persist.js     IndexedDB + localStorage, with daily snapshots
    motion.js      count-up, stagger, FLIP list reflow
    demo.js        the seeded sample data
  components/      one file per screen, plus ui.jsx and EntrySheet.jsx
```

A few decisions worth knowing about:

**Dates are strings, never `Date` objects.** A day is `'YYYY-MM-DD'` in local
time. Storing an instant means an entry logged at 11pm moves to the next day when
the machine changes timezone. `Date` is used only as a calculator, always
constructed at local noon so a daylight-saving shift cannot roll a date
backwards.

**One period engine.** Week, month, quarter and year all resolve through
`periodRange()` and `bucketsOf()`, so a boundary day cannot be counted one way in
the month view and another way in the quarter view. Quarter weeks are clipped to
the quarter, so the bars always sum to the total.

**Pace, not just totals.** Every budget carries the share of the period that has
elapsed. On the 6th, 60% of a budget spent is alarming; on the 26th it is fine,
and a bar that cannot tell the difference is not worth drawing.

**Contributions are kept separate from value.** Without that column every deposit
into an investment reads as growth. The dashed line on the net-worth chart is
what you paid in; only the gap above it is a return.

**Aggregation is pure.** The advisor calls the same functions the charts do,
outside React. If the two computed their own totals they would eventually
disagree, and the app would be quietly lying somewhere.

**Recurring entries are offered, never posted.** A schedule works out what it
owes and puts it in a queue; you confirm or skip each one. Auto-posting is less
typing, but a ledger that invents transactions is one you cannot trust, and the
only thing this app has going for it is that its numbers are ones you put there.
Skipping advances the schedule exactly as posting does, so a subscription you
cancelled stops asking.

**Two tabs do not fight.** Each tab holds and saves the whole state, so without
coordination the second one to write silently wipes the first one's entries. A
`BroadcastChannel` carries only a timestamp; a tab that hears about a newer write
re-reads storage and decides for itself. Adopting a remote state deliberately
does *not* trigger a save — that echo is what turns coordination into an
infinite write loop between the two tabs.

## Tests

```bash
npm test
```

127 tests over the pure engines — dates and period boundaries, aggregation,
schedules, and the advisor's rules. They lean on properties rather than golden
values where they can: the chart buckets must sum to the headline the screen
prints, a category that vanished must still count as a movement, and a holding
nobody revalued must not drag net worth to zero. The advisor suite also pins the
boundary in the next section, so it cannot be eroded by accident.

## What the advisor does and does not do

Every suggestion is a deterministic rule over your own entries, and each one
names a figure you can go and check — there is no model involved and nothing
leaves the browser. Rules stay silent until there is enough history to support
them, and anything you dismiss stays dismissed by rule identity rather than
reappearing next month with a new key.

The investments section describes the holdings you have recorded: how large, how
concentrated, how current the figures are, whether contributions are being
logged. It does not value anything for you, it has no price feed, and it will not
tell you what to buy, sell or hold.

## Deployment

Hosted on Cloudflare as a static-assets Worker, which is the recommended path
for new projects in place of Pages. It fits inside the free plan comfortably:
the app is entirely client-side, so the Worker only executes on a cache miss for
a client route or a 404 — every real page load is served straight from
Cloudflare's asset server.

```bash
npm run deploy          # build, generate dist/_headers, wrangler deploy
```

Two details are load-bearing:

**`not_found_handling = "none"`, with the SPA fallback done by hand.** The
built-in single-page-application mode answers *every* miss with index.html and a
200, including a hashed bundle that is genuinely missing — which happens for
real when a client holding the previous index.html requests an asset that a
deploy has just replaced. The browser then reports a MIME-type error that says
nothing about the actual problem. `worker-entry.js` separates the two: a real
404 for a missing asset, the app shell for a client route.

**Security headers are written twice, from one module.** Cloudflare's asset
server answers requests matching a built file *without* invoking the Worker, so
headers set only in the Worker would cover 404s and nothing a visitor actually
loads. `scripts/gen-headers.mjs` writes `dist/_headers` at build time and
`worker-entry.js` applies the same set to what it still handles; both import
`security-headers.js`, so they cannot drift.

The policy is strict — `script-src 'self'`, `connect-src 'self'`, no framing.
The app keeps a complete personal financial history in IndexedDB, and refusing
to run anything but its own bundle is what makes that hard to read.

## Licence

MIT.
