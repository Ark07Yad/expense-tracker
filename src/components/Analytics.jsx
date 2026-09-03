/**
 * Trends.
 *
 * The same four questions at four zoom levels — week, month, quarter, year —
 * driven by one range engine so a boundary day is counted identically at every
 * level. You can step backwards and forwards through periods; every figure is
 * shown against the equivalent previous period rather than in isolation,
 * because a number with nothing to compare it to is not information.
 */

import { useMemo, useState } from 'react';
import {
  Area, AreaChart, Bar as RBar, BarChart, CartesianGrid, Cell, ComposedChart, Legend, Line,
  Pie, PieChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';
import { useStore } from '../lib/store';
import { useFinance } from '../lib/useFinance';
import { PERIODS, addDays, dayLabel, formatMoney, formatPercent, parseKey, todayKey } from '../lib/calc';
import { categoriesFor, categoryById } from '../lib/data';
import {
  Badge, Bar, Button, Card, CategoryDot, Delta, Empty, Icon, IconButton, Money,
  SectionTitle, Segmented, Select, Stat, stagger, tooltipStyle,
} from './ui';

const VIEWS = [
  { value: 'flow', label: 'Cash flow' },
  { value: 'cumulative', label: 'Running total' },
  { value: 'mix', label: 'Category mix' },
];

export default function Analytics({ onNavigate }) {
  const { state } = useStore();
  const [period, setPeriod] = useState('month');
  const [offset, setOffset] = useState(0);
  const [view, setView] = useState('flow');
  const [catFilter, setCatFilter] = useState('all');
  const f = useFinance(period, offset, catFilter === 'all' ? undefined : catFilter);
  const cur = state.profile.currency;

  const budgetTotal = f.budgets.reduce((s, b) => s + b.cap, 0);

  // The pace line: where cumulative spending would sit if the budget were spent
  // evenly. It is what makes the running-total view answer "am I ahead?" rather
  // than just "how much so far".
  const cumulative = useMemo(() => {
    const n = f.series.length || 1;
    return f.series.map((row, i) => ({
      ...row,
      pace: budgetTotal ? Math.round((budgetTotal * (i + 1)) / n) : null,
    }));
  }, [f.series, budgetTotal]);

  const donutData = useMemo(() => {
    const top = f.expenseCats.slice(0, 7);
    const rest = f.expenseCats.slice(7).reduce((s, c) => s + c.total, 0);
    return rest > 0 ? [...top, { id: 'other', label: 'Everything else', total: rest, color: '#64748b', share: 0 }] : top;
  }, [f.expenseCats]);

  const p = PERIODS.find((x) => x.id === period);
  const empty = f.totals.count === 0;

  return (
    <div className="space-y-5">
      {/* ── Controls ── */}
      <Card className="p-5">
        <div className="flex flex-col lg:flex-row lg:items-center gap-4">
          <Segmented
            value={period}
            onChange={(v) => { setPeriod(v); setOffset(0); }}
            options={PERIODS.map((x) => ({ value: x.id, label: x.label }))}
          />

          <div className="flex items-center gap-2 lg:ml-auto">
            <IconButton name="chevL" label="Previous period" onClick={() => setOffset((o) => o - 1)} />
            <div className="text-center min-w-[13rem]">
              <div className="text-[15px] font-semibold display leading-tight">{f.label}</div>
              <div className="text-[11.5px] text-faint">
                {f.isCurrent ? `${formatPercent(f.progress * 100)} elapsed` : `${f.days} days`}
              </div>
            </div>
            <IconButton
              name="chevR"
              label="Next period"
              onClick={() => setOffset((o) => Math.min(0, o + 1))}
              disabled={offset >= 0}
            />
            {offset !== 0 && (
              <Button size="sm" variant="subtle" onClick={() => setOffset(0)}>
                Now
              </Button>
            )}
          </div>
        </div>

        {/* One filter, applied to every chart below rather than to a single
            card — "how has dining moved over the year" is a whole-page
            question, and answering it in one place beats a filter per widget. */}
        <div className="flex flex-wrap items-center gap-2.5 mt-4">
          <div className="w-full sm:w-64">
            <Select value={catFilter} onChange={(e) => setCatFilter(e.target.value)}>
              <option value="all">Every category</option>
              {categoriesFor('expense').map((c) => (
                <option key={c.id} value={c.id}>{c.label}</option>
              ))}
            </Select>
          </div>
          {catFilter !== 'all' && (
            <Badge tone="brand">
              <Icon name="filter" className="size-3" />
              Showing {categoryById(catFilter).label} only
            </Badge>
          )}
          {catFilter !== 'all' && (
            <button
              onClick={() => setCatFilter('all')}
              className="text-[12px] text-dim hover:text-[color:var(--text)] transition-colors"
            >
              Clear
            </button>
          )}
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 mt-4">
          <Stat
            label="Earned" icon="trendUp" tone="earn"
            value={<Money value={f.totals.earning} compact animate />}
            delta={f.delta.earning} sub={`vs ${p.compare}`}
          />
          <Stat
            label="Spent" icon="trendDown" tone="spend"
            value={<Money value={f.totals.expense} compact animate />}
            delta={f.delta.expense} invertDelta sub={`vs ${p.compare}`}
          />
          <Stat
            label="Saved" icon="piggy" tone="save"
            value={<Money value={f.totals.saving} compact animate />}
            delta={f.delta.saving} sub={`vs ${p.compare}`}
          />
          <Stat
            label="Left over" icon="scale" tone={f.totals.net >= 0 ? 'good' : 'bad'}
            value={<Money value={f.totals.net} compact animate sign />}
            sub={f.totals.earning > 0 ? `${formatPercent(f.totals.savingsRate)} kept` : 'no income logged'}
          />
        </div>
      </Card>

      {empty ? (
        <Card className="p-5">
          <Empty
            icon="chart"
            title={`Nothing logged in ${f.label}`}
            body={
              offset === 0
                ? 'Log a few entries and every chart on this page fills in.'
                : 'Step forward to a period with entries in it, or pick a wider view.'
            }
            action={
              offset !== 0 ? (
                <Button variant="primary" size="sm" onClick={() => setOffset(0)}>Back to now</Button>
              ) : (
                <Button variant="primary" size="sm" onClick={() => onNavigate('compose')}>Log an entry</Button>
              )
            }
          />
        </Card>
      ) : (
        <>
          {/* ── Main chart ── */}
          <Card className="p-5">
            <SectionTitle
              icon="chart"
              sub={
                view === 'flow'
                  ? 'Money in above the line, money out below it'
                  : view === 'cumulative'
                  ? budgetTotal
                    ? 'Running spend against an evenly-paced budget'
                    : 'Running spend across the period'
                  : 'Each category over time'
              }
              action={<Segmented size="sm" value={view} onChange={setView} options={VIEWS} />}
            >
              {p.label} view
            </SectionTitle>

            <div className="h-72 -ml-2">
              <ResponsiveContainer width="100%" height="100%">
                {view === 'flow' ? (
                  <ComposedChart data={f.series} margin={{ top: 8, right: 8, bottom: 0, left: 0 }} stackOffset="sign">
                    <CartesianGrid vertical={false} strokeDasharray="3 3" />
                    <XAxis dataKey="short" axisLine={false} tickLine={false} interval="preserveStartEnd" minTickGap={14} />
                    <YAxis
                      axisLine={false} tickLine={false} width={52}
                      tickFormatter={(v) => formatMoney(Math.abs(v), cur, { compact: true, decimals: 0 })}
                    />
                    <Tooltip
                      contentStyle={tooltipStyle}
                      labelFormatter={(_, pl) => pl?.[0]?.payload?.label ?? ''}
                      formatter={(v, n) => [formatMoney(Math.abs(v), cur), LABELS[n] || n]}
                    />
                    <ReferenceLine y={0} stroke="var(--border-strong)" />
                    <RBar dataKey="earning" stackId="flow" fill="var(--tone-earn)" radius={[4, 4, 0, 0]} isAnimationActive={false} />
                    <RBar dataKey="expenseNeg" stackId="flow" fill="var(--tone-spend)" radius={[0, 0, 4, 4]} isAnimationActive={false} />
                    <RBar dataKey="savingNeg" stackId="flow" fill="var(--tone-save)" radius={[0, 0, 4, 4]} isAnimationActive={false} />
                    <Line
                      type="monotone" dataKey="cumNet" stroke="var(--color-brand-300)" strokeWidth={2.4}
                      dot={false} isAnimationActive={false}
                    />
                    <Legend
                      formatter={(n) => <span style={{ color: 'var(--text-dim)', fontSize: 11 }}>{LABELS[n] || n}</span>}
                      iconType="circle" iconSize={7}
                    />
                  </ComposedChart>
                ) : view === 'cumulative' ? (
                  <AreaChart data={cumulative} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
                    <defs>
                      <linearGradient id="anCum" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="var(--color-brand-400)" stopOpacity={0.4} />
                        <stop offset="100%" stopColor="var(--color-brand-400)" stopOpacity={0.02} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid vertical={false} strokeDasharray="3 3" />
                    <XAxis dataKey="short" axisLine={false} tickLine={false} interval="preserveStartEnd" minTickGap={14} />
                    <YAxis
                      axisLine={false} tickLine={false} width={52}
                      tickFormatter={(v) => formatMoney(v, cur, { compact: true, decimals: 0 })}
                    />
                    <Tooltip
                      contentStyle={tooltipStyle}
                      labelFormatter={(_, pl) => pl?.[0]?.payload?.label ?? ''}
                      formatter={(v, n) => [formatMoney(v, cur), LABELS[n] || n]}
                    />
                    <Area
                      type="monotone" dataKey="cumExpense" stroke="var(--color-brand-400)" strokeWidth={2.4}
                      fill="url(#anCum)" isAnimationActive={false}
                    />
                    {budgetTotal > 0 && (
                      <Line
                        type="linear" dataKey="pace" stroke="var(--tone-warn)" strokeWidth={1.8}
                        strokeDasharray="6 5" dot={false} isAnimationActive={false}
                      />
                    )}
                    <Legend
                      formatter={(n) => <span style={{ color: 'var(--text-dim)', fontSize: 11 }}>{LABELS[n] || n}</span>}
                      iconType="circle" iconSize={7}
                    />
                  </AreaChart>
                ) : (
                  <BarChart data={mixSeries(f)} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
                    <CartesianGrid vertical={false} strokeDasharray="3 3" />
                    <XAxis dataKey="short" axisLine={false} tickLine={false} interval="preserveStartEnd" minTickGap={14} />
                    <YAxis
                      axisLine={false} tickLine={false} width={52}
                      tickFormatter={(v) => formatMoney(v, cur, { compact: true, decimals: 0 })}
                    />
                    <Tooltip
                      contentStyle={tooltipStyle}
                      labelFormatter={(_, pl) => pl?.[0]?.payload?.label ?? ''}
                      formatter={(v, n) => [formatMoney(v, cur), n]}
                    />
                    {f.expenseCats.slice(0, 6).map((c, i, arr) => (
                      <RBar
                        key={c.id}
                        dataKey={c.label}
                        stackId="mix"
                        fill={c.color}
                        radius={i === arr.length - 1 ? [4, 4, 0, 0] : 0}
                        isAnimationActive={false}
                      />
                    ))}
                    <Legend
                      formatter={(n) => <span style={{ color: 'var(--text-dim)', fontSize: 11 }}>{n}</span>}
                      iconType="circle" iconSize={7}
                    />
                  </BarChart>
                )}
              </ResponsiveContainer>
            </div>
          </Card>

          {/* ── Mix + movers ── */}
          <div className="grid lg:grid-cols-5 gap-4">
            <Card className="lg:col-span-2 p-5">
              <SectionTitle
                icon="pie"
                sub={
                  f.expenseCats.length === 1
                    ? '1 category in play'
                    : `${f.expenseCats.length} categories in play`
                }
              >
                Breakdown
              </SectionTitle>
              {f.expenseCats.length === 0 ? (
                /* A donut of nothing is a large blank square where a chart
                   should be. Say there is nothing instead. */
                <Empty
                  icon="pie"
                  title="No spending to break down"
                  body="Money came in or moved to savings this period, but nothing was spent."
                />
              ) : (
              <div className="h-48 relative">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={donutData} dataKey="total" nameKey="label"
                      innerRadius="60%" outerRadius="95%" paddingAngle={2} stroke="none" isAnimationActive={false}
                    >
                      {donutData.map((c) => <Cell key={c.id} fill={c.color} />)}
                    </Pie>
                    <Tooltip contentStyle={tooltipStyle} formatter={(v, n) => [formatMoney(v, cur), n]} />
                  </PieChart>
                </ResponsiveContainer>
                <div className="absolute inset-0 grid place-items-center pointer-events-none">
                  <div className="text-center">
                    <div className="text-[10.5px] uppercase tracking-wider text-faint">Out</div>
                    <div className="text-[18px] font-semibold display">
                      <Money value={f.totals.expense} compact />
                    </div>
                  </div>
                </div>
              </div>
              )}
              <div className="space-y-1.5 mt-3">
                {donutData.map((c) => (
                  <div key={c.id} className="flex items-center gap-2.5 text-[12.5px]">
                    <span className="size-2 rounded-full shrink-0" style={{ background: c.color }} />
                    <span className="truncate flex-1">{c.label}</span>
                    <span className="text-faint tabular">
                      {formatPercent(f.totals.expense > 0 ? (c.total / f.totals.expense) * 100 : 0)}
                    </span>
                    <span className="tabular w-16 text-right"><Money value={c.total} compact /></span>
                  </div>
                ))}
              </div>
            </Card>

            <Card className="lg:col-span-3 p-5">
              <SectionTitle icon="scale" sub={`Against ${p.compare}`}>Biggest movements</SectionTitle>
              {f.movers.length === 0 ? (
                <Empty icon="scale" title="Nothing moved much" body="Spending held steady against the previous period." />
              ) : (
                <div className="space-y-2.5">
                  {f.movers.map((m, i) => (
                    <button
                      key={m.id}
                      onClick={() => onNavigate(`section:${m.id}`)}
                      className="w-full flex items-center gap-3 p-2.5 rounded-2xl text-left transition-all
                                 hover:[background:var(--surface-hover)] active:scale-[0.99] animate-rise"
                      style={stagger(i)}
                    >
                      <CategoryDot color={m.color} icon={m.icon} />
                      <div className="min-w-0 flex-1">
                        <div className="text-[13.5px] font-medium truncate">{m.label}</div>
                        <div className="text-[11.5px] text-faint tabular">
                          {formatMoney(m.before, cur, { compact: true })} → {formatMoney(m.total, cur, { compact: true })}
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <div className={`text-[13.5px] font-semibold tabular ${m.delta > 0 ? 'text-bad' : 'text-good'}`}>
                          {m.delta > 0 ? '+' : '−'}
                          <Money value={Math.abs(m.delta)} compact />
                        </div>
                        <Delta change={m.change} invert />
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </Card>
          </div>

          {/* ── Category table ── */}
          <Card className="p-5">
            <SectionTitle icon="ledger" sub="Tap a row for advice on that category">
              Every category
            </SectionTitle>
            <div className="space-y-3">
              {f.expenseCats.map((c, i) => {
                const line = f.budgets.find((b) => b.id === c.id);
                return (
                  <button
                    key={c.id}
                    onClick={() => onNavigate(`section:${c.id}`)}
                    className="w-full text-left rounded-2xl p-2.5 -m-0.5 transition-all
                               hover:[background:var(--surface-hover)] animate-rise"
                    style={stagger(i)}
                  >
                    <div className="flex items-center gap-3 mb-2">
                      <CategoryDot size="sm" color={c.color} icon={c.icon} />
                      <span className="text-[13.5px] font-medium truncate flex-1">{c.label}</span>
                      <span className="text-[11.5px] text-faint tabular shrink-0">
                        {c.count} {c.count === 1 ? 'entry' : 'entries'} · avg {formatMoney(c.avg, cur, { compact: true })}
                      </span>
                      <span className="text-[13.5px] font-semibold tabular shrink-0 w-20 text-right">
                        <Money value={c.total} compact />
                      </span>
                    </div>
                    <Bar
                      value={c.total}
                      target={line?.cap || f.expenseCats[0].total}
                      color={c.color}
                      compact
                      sub={
                        line?.cap
                          ? `${formatPercent(c.share)} of spending · ${formatPercent(line.pct || 0)} of its ${formatMoney(line.cap, cur, { compact: true })} budget`
                          : `${formatPercent(c.share)} of spending · no budget set`
                      }
                    />
                  </button>
                );
              })}
            </div>
          </Card>

          {/* ── Heatmap ── */}
          {(period === 'month' || period === 'quarter' || period === 'year') && (
            <Card className="p-5">
              <SectionTitle icon="calendar" sub="Darker means more spent that day">
                Daily rhythm
              </SectionTitle>
              <SpendHeatmap range={f.range} entries={f.entries} currency={cur} />
            </Card>
          )}

          {/* ── Comparison ── */}
          <Card className="p-5">
            <SectionTitle icon="scale" sub={`This ${p.label.toLowerCase()} against ${p.compare}`}>
              Side by side
            </SectionTitle>
            <div className="overflow-x-auto -mx-1 px-1">
              <table className="w-full text-[13px] min-w-[30rem]">
                <thead>
                  <tr className="text-[11px] uppercase tracking-wider text-faint">
                    <th className="text-left font-medium pb-2">Measure</th>
                    <th className="text-right font-medium pb-2">This {p.label.toLowerCase()}</th>
                    <th className="text-right font-medium pb-2">Previous</th>
                    <th className="text-right font-medium pb-2">Change</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[color:var(--border)]">
                  {[
                    ['Earned', f.totals.earning, f.prevTotals.earning, true],
                    ['Spent', f.totals.expense, f.prevTotals.expense, false],
                    ['Saved', f.totals.saving, f.prevTotals.saving, true],
                    ['Left over', f.totals.net, f.prevTotals.net, true],
                  ].map(([label, now, before, invert]) => (
                    <tr key={label}>
                      <td className="py-2.5">{label}</td>
                      <td className="py-2.5 text-right tabular font-medium">{formatMoney(now, cur)}</td>
                      <td className="py-2.5 text-right tabular text-dim">{formatMoney(before, cur)}</td>
                      <td className="py-2.5 text-right">
                        <span className={`tabular text-[12.5px] ${
                          (invert ? now - before : before - now) >= 0 ? 'text-good' : 'text-bad'
                        }`}>
                          {now - before >= 0 ? '+' : '−'}
                          {formatMoney(Math.abs(now - before), cur, { compact: true })}
                        </span>
                      </td>
                    </tr>
                  ))}
                  <tr>
                    <td className="py-2.5">Entries logged</td>
                    <td className="py-2.5 text-right tabular font-medium">{f.totals.count}</td>
                    <td className="py-2.5 text-right tabular text-dim">{f.prevTotals.count}</td>
                    <td className="py-2.5 text-right text-dim tabular text-[12.5px]">
                      {f.totals.count - f.prevTotals.count >= 0 ? '+' : '−'}
                      {Math.abs(f.totals.count - f.prevTotals.count)}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </Card>
        </>
      )}
    </div>
  );
}

const LABELS = {
  earning: 'Earned',
  expenseNeg: 'Spent',
  savingNeg: 'Saved',
  cumNet: 'Running balance',
  cumExpense: 'Spent so far',
  pace: 'Budget pace',
};

/** Per-bucket totals for the top categories, shaped for a stacked bar chart. */
function mixSeries(f) {
  const top = f.expenseCats.slice(0, 6);
  return f.series.map((row) => {
    const out = { short: row.short, label: row.label };
    for (const c of top) {
      out[c.label] = f.entries
        .filter((e) => e.kind === 'expense' && e.category === c.id && e.date >= row.start && e.date <= row.end)
        .reduce((s, e) => s + e.amount, 0);
    }
    return out;
  });
}

/* ────────────────────────────────  Heatmap  ─────────────────────────────── */

/**
 * A calendar grid of daily spend, laid out in week columns.
 *
 * Charts show you how much; this shows you *when*, and the two weekly bands of
 * dark cells that usually appear are far more legible here than in any bar
 * chart. Intensity is scaled against the 90th percentile rather than the
 * maximum, so one holiday does not wash the entire year out to nothing.
 */
function SpendHeatmap({ range, entries, currency }) {
  const { cells, scale } = useMemo(() => {
    const spend = new Map();
    for (const e of entries) {
      if (e.kind !== 'expense') continue;
      spend.set(e.date, (spend.get(e.date) || 0) + e.amount);
    }
    const values = [...spend.values()].sort((a, b) => a - b);
    const p90 = values.length ? values[Math.floor(values.length * 0.9)] : 1;

    const out = [];
    // Pad to the start of the week so columns line up with weekdays.
    const firstDow = (parseKey(range.start).getDay() + 6) % 7;
    for (let i = 0; i < firstDow; i++) out.push(null);
    for (let k = range.start; k <= range.end; k = addDays(k, 1)) {
      out.push({ key: k, value: spend.get(k) || 0, future: k > todayKey() });
    }
    return { cells: out, scale: Math.max(1, p90) };
  }, [range, entries]);

  return (
    <div className="overflow-x-auto -mx-1 px-1 pb-1">
      <div className="flex gap-2">
      <div className="grid gap-[3px] shrink-0 pt-px" style={{ gridTemplateRows: 'repeat(7, 15px)' }}>
        {['M', '', 'W', '', 'F', '', 'S'].map((d, i) => (
          <span key={i} className="text-[9px] text-faint leading-[15px] w-3">{d}</span>
        ))}
      </div>
      {/* Fixed cell size rather than fractional columns: a month is six columns
          wide, and letting those stretch to fill a desktop card turned each day
          into a 160px block. The grid scrolls horizontally for a year instead. */}
      <div
        className="grid grid-flow-col gap-[3px] w-fit"
        style={{ gridTemplateRows: 'repeat(7, 15px)', gridAutoColumns: '15px' }}
      >
        {cells.map((c, i) =>
          c === null ? (
            <span key={`pad-${i}`} />
          ) : (
            <span
              key={c.key}
              title={`${dayLabel(c.key)} · ${formatMoney(c.value, currency)}`}
              className="rounded-[3px] transition-transform hover:scale-125 cursor-default"
              style={{
                background: c.future
                  ? 'transparent'
                  : c.value === 0
                  ? 'var(--border)'
                  : `color-mix(in srgb, var(--color-brand-400) ${Math.min(100, 18 + (c.value / scale) * 82)}%, var(--border))`,
                border: c.future ? '1px dashed var(--border)' : 'none',
              }}
            />
          )
        )}
      </div>
      </div>
      <div className="flex items-center gap-2 mt-3 text-[11px] text-faint">
        <span>Less</span>
        {[0, 25, 50, 75, 100].map((v) => (
          <span
            key={v}
            className="size-3 rounded-[3px]"
            style={{ background: `color-mix(in srgb, var(--color-brand-400) ${Math.max(8, v)}%, var(--border))` }}
          />
        ))}
        <span>More</span>
        <Badge className="ml-auto" tone="neutral">
          scaled to {formatMoney(scale, currency, { compact: true })} a day
        </Badge>
      </div>
    </div>
  );
}
