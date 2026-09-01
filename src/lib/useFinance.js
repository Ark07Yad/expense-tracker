/**
 * Derived numbers.
 *
 * Everything the app displays — the dashboard tiles, all four period views, the
 * charts, the budget bars, the advisor's suggestions — is computed here, by
 * pure functions over `state`. The React hooks at the bottom are thin `useMemo`
 * wrappers.
 *
 * That split is the point: the advisor needs exactly the same totals the
 * dashboard shows, and it needs them outside a component. If the aggregation
 * lived inside a hook, the advice and the chart would eventually disagree about
 * what "spent this month" means, and the app would be quietly lying somewhere.
 */

import { useMemo } from 'react';
import { useStore } from './store';
import { assetClassById, categoriesFor, categoryById } from './data';
import {
  addMonthKeys,
  bucketsOf,
  daysBetween,
  monthKey,
  monthKeyOf,
  pctChange,
  periodLabel,
  periodProgress,
  periodRange,
  rangeDays,
  sum,
  todayKey,
} from './calc';

/* ────────────────────────────── Ledger totals ────────────────────────────── */

export const entriesInRange = (entries, range) =>
  entries.filter((e) => e.date >= range.start && e.date <= range.end);

export function totalsOf(entries) {
  const t = { earning: 0, expense: 0, saving: 0, count: entries.length };
  for (const e of entries) {
    const amount = Math.abs(Number(e.amount) || 0);
    if (e.kind === 'earning') t.earning += amount;
    else if (e.kind === 'saving') t.saving += amount;
    else t.expense += amount;
  }
  /**
   * Net is what is left unallocated: income minus spending minus what you
   * deliberately moved to savings.
   *
   * Savings are subtracted rather than ignored because the money really has
   * left the current account — treating a transfer to a fund as "still spare"
   * is how people end up double-spending it. `free` is the honest headline:
   * a positive number is genuinely uncommitted.
   */
  t.net = t.earning - t.expense - t.saving;
  t.free = t.net;
  t.outflow = t.expense + t.saving;
  t.savingsRate = t.earning > 0 ? ((t.saving + Math.max(0, t.net)) / t.earning) * 100 : 0;
  return t;
}

/** Per-category breakdown for one kind, largest first. */
export function byCategory(entries, kind) {
  const wanted = entries.filter((e) => e.kind === kind);
  const total = sum(wanted, (e) => Math.abs(e.amount));
  const map = new Map();

  for (const e of wanted) {
    const cur = map.get(e.category) || { total: 0, count: 0 };
    cur.total += Math.abs(Number(e.amount) || 0);
    cur.count += 1;
    map.set(e.category, cur);
  }

  return [...map.entries()]
    .map(([id, v]) => {
      const meta = categoryById(id);
      return {
        id,
        label: meta.label,
        color: meta.color,
        icon: meta.icon,
        total: v.total,
        count: v.count,
        avg: v.count ? v.total / v.count : 0,
        share: total > 0 ? (v.total / total) * 100 : 0,
      };
    })
    .sort((a, b) => b.total - a.total);
}

/** Chart series: one row per bucket, with a running expense total for the pace line. */
export function seriesOf(period, range, entries, opts = {}) {
  const buckets = bucketsOf(period, range, opts);
  let cumExpense = 0;
  let cumNet = 0;

  return buckets.map((b) => {
    const inBucket = entries.filter((e) => e.date >= b.start && e.date <= b.end);
    const t = totalsOf(inBucket);
    cumExpense += t.expense;
    cumNet += t.net;
    return {
      key: b.key,
      short: b.short,
      label: b.label,
      start: b.start,
      end: b.end,
      earning: Math.round(t.earning),
      expense: Math.round(t.expense),
      saving: Math.round(t.saving),
      net: Math.round(t.net),
      cumExpense: Math.round(cumExpense),
      cumNet: Math.round(cumNet),
      count: t.count,
      // Bars are drawn below the axis for money going out, so the chart reads
      // as a cash-flow ledger rather than three unrelated stacks.
      expenseNeg: -Math.round(t.expense),
      savingNeg: -Math.round(t.saving),
    };
  });
}

/**
 * A monthly budget, restated for whatever period is on screen.
 *
 * Budgets are set per month because that is how bills arrive. Showing a weekly
 * view against a monthly cap would be meaningless, so the cap is converted —
 * exactly for month/quarter/year, and pro-rata for a week.
 */
export function budgetForPeriod(cap, period, range) {
  const c = Number(cap) || 0;
  if (!c) return 0;
  if (period === 'month') return c;
  if (period === 'quarter') return c * 3;
  if (period === 'year') return c * 12;
  return (c * rangeDays(range)) / 30.4375;
}

/**
 * Budget lines for a period.
 *
 * `pace` is the share of the budget that *should* be gone by now — the whole
 * reason the bars are trustworthy. Without it, every budget looks fine on the
 * 3rd and catastrophic on the 30th.
 */
export function budgetLines(state, period, range, entries) {
  const progress = periodProgress(range, todayKey());
  const spend = new Map();
  for (const e of entries) {
    if (e.kind !== 'expense') continue;
    spend.set(e.category, (spend.get(e.category) || 0) + Math.abs(Number(e.amount) || 0));
  }

  const lines = [];
  for (const cat of categoriesFor('expense')) {
    const cap = budgetForPeriod(state.profile.budgets[cat.id], period, range);
    const spent = spend.get(cat.id) || 0;
    if (!cap && !spent) continue;
    const pct = cap > 0 ? (spent / cap) * 100 : null;
    lines.push({
      id: cat.id,
      label: cat.label,
      color: cat.color,
      icon: cat.icon,
      cap,
      spent,
      left: cap - spent,
      pct,
      pace: progress * 100,
      // "Over pace" is the actionable state: not yet over budget, but on track
      // to be. Flagging only a blown budget tells people too late to act.
      status:
        cap <= 0 ? 'untracked'
        : spent > cap ? 'over'
        : progress > 0 && spent / cap > progress + 0.12 ? 'ahead'
        : spent / cap > 0.9 ? 'tight'
        : 'ok',
      projected: progress > 0.05 ? spent / progress : null,
    });
  }

  return lines.sort((a, b) => {
    const rank = { over: 0, ahead: 1, tight: 2, ok: 3, untracked: 4 };
    if (rank[a.status] !== rank[b.status]) return rank[a.status] - rank[b.status];
    return b.spent - a.spent;
  });
}

/** Categories that moved most against the previous period. */
export function movers(current, previous, limit = 4) {
  const prev = new Map(previous.map((c) => [c.id, c.total]));
  const seen = new Set(current.map((c) => c.id));

  const rows = current.map((c) => {
    const before = prev.get(c.id) || 0;
    return { ...c, before, delta: c.total - before, change: pctChange(c.total, before) };
  });

  // A category that vanished this period is a real movement too, and often the
  // encouraging one — it should not silently drop out of the comparison.
  for (const [id, before] of prev) {
    if (seen.has(id) || before <= 0) continue;
    const meta = categoryById(id);
    rows.push({
      id,
      label: meta.label,
      color: meta.color,
      icon: meta.icon,
      total: 0,
      count: 0,
      share: 0,
      before,
      delta: -before,
      change: pctChange(0, before),
    });
  }

  return rows
    .filter((r) => Math.abs(r.delta) > 0.5)
    .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))
    .slice(0, limit);
}

/**
 * Everything one period view needs, in one object.
 *
 * `categoryFilter` narrows the whole computation rather than the display, so
 * the totals, the comparison against last period, the buckets and the movers
 * all describe the same filtered slice. Filtering only at render time is how a
 * chart ends up showing one category against a headline for all of them.
 *
 * It is deliberately the *last* parameter: inserting it before `anchor` would
 * have silently re-read every existing caller's anchor as a category filter,
 * which fails by returning plausible-looking empty results rather than by
 * throwing.
 */
export function computeFinance(state, period, offset = 0, anchor = todayKey(), categoryFilter = null) {
  const opts = { anchor, weekStart: state.profile.weekStart ?? 1 };
  const range = periodRange(period, offset, opts);
  const prevRange = periodRange(period, offset - 1, opts);

  const all = categoryFilter
    ? state.entries.filter((e) => e.category === categoryFilter)
    : state.entries;

  const inRange = entriesInRange(all, range).sort(
    (a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : b.createdAt - a.createdAt)
  );
  const inPrev = entriesInRange(all, prevRange);

  const totals = totalsOf(inRange);
  const prevTotals = totalsOf(inPrev);
  const expenseCats = byCategory(inRange, 'expense');
  const progress = periodProgress(range, todayKey());
  const elapsedDays = Math.max(1, Math.min(rangeDays(range), daysBetween(range.start, todayKey()) + 1));
  const isCurrent = todayKey() >= range.start && todayKey() <= range.end;

  return {
    period,
    offset,
    categoryFilter: categoryFilter || null,
    range,
    prevRange,
    label: periodLabel(period, range),
    days: rangeDays(range),
    progress,
    isCurrent,
    isFuture: range.start > todayKey(),
    entries: inRange,
    totals,
    prevTotals,
    delta: {
      earning: pctChange(totals.earning, prevTotals.earning),
      expense: pctChange(totals.expense, prevTotals.expense),
      saving: pctChange(totals.saving, prevTotals.saving),
      net: pctChange(totals.net, prevTotals.net),
    },
    series: seriesOf(period, range, inRange, opts),
    expenseCats,
    earningCats: byCategory(inRange, 'earning'),
    savingCats: byCategory(inRange, 'saving'),
    movers: movers(expenseCats, byCategory(inPrev, 'expense')),
    budgets: budgetLines(state, period, range, inRange),
    /** Daily burn so far, and where the period lands if nothing changes. */
    dailyBurn: isCurrent ? totals.expense / elapsedDays : totals.expense / rangeDays(range),
    projectedExpense: isCurrent && progress > 0.05 ? totals.expense / progress : totals.expense,
    biggest: inRange.filter((e) => e.kind === 'expense').sort((a, b) => b.amount - a.amount)[0] || null,
  };
}

/* ──────────────────────────────  Investments  ────────────────────────────── */

/**
 * Carry a holding's last known value forward.
 *
 * Nobody revalues every asset every month. Without carry-forward, a month in
 * which you only updated one fund would show your net worth collapsing to that
 * fund's value — the single most alarming bug this screen could have.
 */
function latestAtOrBefore(history, month) {
  let best = null;
  for (const [m, snap] of Object.entries(history || {})) {
    if (m <= month && (!best || m > best.month)) best = { month: m, ...snap };
  }
  return best;
}

export function computeInvestments(state, months = 12) {
  const assets = state.assets || [];
  const allMonths = assets.flatMap((a) => Object.keys(a.history || {}));
  const nowMonth = monthKey(todayKey());

  if (!assets.length) {
    return {
      empty: true, assets: [], rows: [], series: [], allocation: [],
      netWorth: 0, invested: 0, gain: 0, gainPct: 0, lastUpdated: null,
      staleAssets: [], contributedThisMonth: 0, monthChange: { pct: null, kind: 'flat' }, byClass: [],
    };
  }

  const firstMonth = allMonths.length ? allMonths.sort()[0] : nowMonth;

  // Walk month by month from the first record to now, carrying values forward.
  const span = [];
  for (let m = firstMonth; m <= nowMonth; m = addMonthKeys(m, 1)) span.push(m);
  const window = span.slice(-months);

  const series = window.map((m) => {
    let value = 0;
    let invested = 0;
    for (const a of assets) {
      const snap = latestAtOrBefore(a.history, m);
      if (snap) value += Number(snap.value) || 0;
      // Contributions are cumulative: everything paid in up to and including m.
      for (const [hm, h] of Object.entries(a.history || {})) {
        if (hm <= m) invested += Number(h.contributed) || 0;
      }
    }
    return {
      key: m,
      short: monthKeyOf(new Date(`${m}-01T12:00:00`)) === m
        ? new Date(`${m}-01T12:00:00`).toLocaleDateString(undefined, { month: 'short' })
        : m,
      label: new Date(`${m}-01T12:00:00`).toLocaleDateString(undefined, { month: 'long', year: 'numeric' }),
      value: Math.round(value),
      invested: Math.round(invested),
      gain: Math.round(value - invested),
    };
  });

  const rows = assets
    .map((a) => {
      const snap = latestAtOrBefore(a.history, nowMonth);
      const invested = sum(Object.values(a.history || {}), (h) => h.contributed);
      const value = snap ? Number(snap.value) || 0 : 0;
      const meta = assetClassById(a.class);
      return {
        ...a,
        meta,
        value,
        invested,
        gain: value - invested,
        gainPct: invested > 0 ? ((value - invested) / invested) * 100 : 0,
        lastMonth: snap?.month || null,
        monthsStale: snap?.month ? monthsApart(snap.month, nowMonth) : null,
        contributedThisMonth: Number(a.history?.[nowMonth]?.contributed) || 0,
      };
    })
    .sort((a, b) => b.value - a.value);

  const netWorth = sum(rows, (r) => r.value);
  const invested = sum(rows, (r) => r.invested);

  const classMap = new Map();
  for (const r of rows) {
    const cur = classMap.get(r.class) || { value: 0, invested: 0, count: 0 };
    cur.value += r.value;
    cur.invested += r.invested;
    cur.count += 1;
    classMap.set(r.class, cur);
  }
  const byClass = [...classMap.entries()]
    .map(([id, v]) => {
      const meta = assetClassById(id);
      return {
        id,
        label: meta.label,
        color: meta.color,
        icon: meta.icon,
        risk: meta.risk,
        ...v,
        share: netWorth > 0 ? (v.value / netWorth) * 100 : 0,
      };
    })
    .sort((a, b) => b.value - a.value);

  const last = series[series.length - 1];
  const prev = series[series.length - 2];

  return {
    empty: false,
    assets,
    rows,
    series,
    byClass,
    allocation: byClass,
    netWorth,
    invested,
    gain: netWorth - invested,
    gainPct: invested > 0 ? ((netWorth - invested) / invested) * 100 : 0,
    monthChange: prev ? pctChange(last.value, prev.value) : { pct: null, kind: 'new' },
    monthDelta: prev ? last.value - prev.value : 0,
    contributedThisMonth: sum(rows, (r) => r.contributedThisMonth),
    /** Holdings nobody has revalued in a while — the advisor nags about these. */
    staleAssets: rows.filter((r) => r.monthsStale === null || r.monthsStale >= 2),
    lastUpdated: rows.reduce((m, r) => (r.lastMonth && r.lastMonth > m ? r.lastMonth : m), ''),
    currentMonth: nowMonth,
  };
}

function monthsApart(a, b) {
  const [ay, am] = a.split('-').map(Number);
  const [by, bm] = b.split('-').map(Number);
  return (by - ay) * 12 + (bm - am);
}

/* ─────────────────────────────────  Hooks  ───────────────────────────────── */

export function useFinance(period, offset = 0, categoryFilter = null) {
  const { state } = useStore();
  return useMemo(
    () => computeFinance(state, period, offset, todayKey(), categoryFilter),
    [state, period, offset, categoryFilter]
  );
}

export function useInvestments(months = 12) {
  const { state } = useStore();
  return useMemo(() => computeInvestments(state, months), [state, months]);
}

/** Rolling daily totals, for the sparkline and the year heatmap. */
export function useDailySpend(days = 90) {
  const { state } = useStore();
  return useMemo(() => {
    const end = todayKey();
    const map = new Map();
    for (const e of state.entries) {
      if (e.kind !== 'expense') continue;
      map.set(e.date, (map.get(e.date) || 0) + Math.abs(Number(e.amount) || 0));
    }
    const out = [];
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      out.push({ key, value: map.get(key) || 0 });
    }
    return { days: out, max: out.reduce((m, d) => Math.max(m, d.value), 0), end };
  }, [state.entries, days]);
}
