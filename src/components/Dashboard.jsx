/**
 * Home.
 *
 * Fixed to the current month. Everything else in the app lets you move around;
 * this screen answers one question — "where am I right now?" — and a date
 * control here would only get in the way of that.
 *
 * The ordering is the argument: what is left, then where it went, then what it
 * is trending toward, then what to do about it.
 */

import { Suspense, lazy, useMemo } from 'react';
import { useStore } from '../lib/store';
import { useDailySpend, useFinance, useInvestments } from '../lib/useFinance';
import { headlineSuggestions } from '../lib/insights';
import { categoryById, kindById } from '../lib/data';
import { dayLabel, formatMoney, formatPercent, shortDate } from '../lib/calc';

/**
 * Tailwind only sees class names that appear literally in the source, so a
 * tone-to-class map has to be written out rather than built with a template
 * string. Every dynamic accent in this app goes through a lookup like this one.
 */
const KIND_TEXT = { earn: 'text-earn', spend: 'text-spend', save: 'text-save' };
import {
  Badge, Bar, Button, Card, CategoryDot, Delta, Empty, Icon, Money, Ring,
  SectionTitle, Stat, stagger,
} from './ui';
import { DueBanner } from './Scheduled';

/*
 * All three resolve the same chunk, so this is one extra request, made after
 * the page is already usable.
 */
const SpendTrend = lazy(() => import('./DashboardCharts').then((m) => ({ default: m.SpendTrend })));
const CategoryDonut = lazy(() => import('./DashboardCharts').then((m) => ({ default: m.CategoryDonut })));
const NetWorthSpark = lazy(() => import('./DashboardCharts').then((m) => ({ default: m.NetWorthSpark })));

export default function Dashboard({ onNavigate }) {
  const { state } = useStore();
  const f = useFinance('month', 0);
  const inv = useInvestments(12);
  const daily = useDailySpend(30);
  const cur = state.profile.currency;

  const tips = useMemo(() => headlineSuggestions(state, 3), [state]);

  const budgetTotal = f.budgets.reduce((s, b) => s + b.cap, 0);
  const income = f.totals.earning || state.profile.monthlyIncome || 0;
  // The ring measures spending against the most meaningful ceiling available:
  // your own budgets if you set them, otherwise what you actually earn.
  const ceiling = budgetTotal || income || f.totals.expense || 1;
  const ceilingLabel = budgetTotal ? 'of budget' : income ? 'of income' : 'spent';
  const over = f.totals.expense > ceiling;

  const spark = useMemo(() => {
    // A seven-day trailing mean alongside the daily bars: the raw series is far
    // too spiky to read a direction from, and the direction is the point.
    const rows = daily.days.map((d, i, arr) => {
      const from = Math.max(0, i - 6);
      const window = arr.slice(from, i + 1);
      return {
        ...d,
        label: shortDate(d.key),
        avg: Math.round(window.reduce((s, x) => s + x.value, 0) / window.length),
      };
    });
    return rows;
  }, [daily]);

  const greeting = (() => {
    const h = new Date().getHours();
    const who = state.profile.name ? `, ${state.profile.name.split(' ')[0]}` : '';
    if (h < 5) return `Still up${who}?`;
    if (h < 12) return `Good morning${who}`;
    if (h < 17) return `Good afternoon${who}`;
    return `Good evening${who}`;
  })();

  const donut = f.expenseCats.slice(0, 6);
  const donutOther = f.expenseCats.slice(6).reduce((s, c) => s + c.total, 0);
  const donutData = donutOther > 0
    ? [...donut, { id: 'other', label: 'Everything else', total: donutOther, color: '#64748b' }]
    : donut;

  return (
    <div className="space-y-5">
      {/* One line, not the whole queue — this screen is a summary, and the
          review itself belongs next to the ledger it writes into. */}
      <DueBanner onNavigate={onNavigate} />

      {/* ── Hero ── */}
      <Card glow sheen className="p-5 sm:p-6">
        <div className="flex items-start justify-between gap-4 mb-5">
          <div className="min-w-0">
            <h1 className="text-[22px] sm:text-[26px] font-semibold display leading-tight truncate">{greeting}</h1>
            <p className="text-[13px] text-dim mt-1">
              {f.label} · {formatPercent(f.progress * 100)} through the month
            </p>
          </div>
          <Badge tone={f.totals.net >= 0 ? 'good' : 'bad'} className="shrink-0 mt-1">
            {f.totals.net >= 0 ? 'In the black' : 'Overspent'}
          </Badge>
        </div>

        <div className="flex flex-col md:flex-row items-center gap-6">
          <div className="shrink-0">
            <Ring
              value={f.totals.expense}
              max={ceiling}
              tone={over ? 'over' : 'brand'}
              pace={f.isCurrent ? f.progress : null}
              size={188}
            >
              <div>
                <div className="text-[10.5px] uppercase tracking-wider text-faint">Spent</div>
                <div className="text-[26px] font-semibold display leading-none mt-1">
                  <Money value={f.totals.expense} compact animate />
                </div>
                <div className="text-[11.5px] text-faint mt-1.5">
                  {formatMoney(ceiling, cur, { compact: true })} {ceilingLabel}
                </div>
              </div>
            </Ring>
          </div>

          <div className="flex-1 w-full min-w-0 space-y-3">
            <div className="grid grid-cols-3 gap-2.5">
              <Stat
                label="In"
                icon="trendUp"
                tone="earn"
                value={<Money value={f.totals.earning} compact animate />}
                delta={f.delta.earning}
              />
              <Stat
                label="Out"
                icon="trendDown"
                tone="spend"
                value={<Money value={f.totals.expense} compact animate />}
                delta={f.delta.expense}
                invertDelta
              />
              <Stat
                label="Saved"
                icon="piggy"
                tone="save"
                value={<Money value={f.totals.saving} compact animate />}
                delta={f.delta.saving}
              />
            </div>

            <div className="surface rounded-2xl p-3.5">
              <div className="flex items-baseline justify-between gap-3 mb-2">
                <span className="text-[12px] text-dim">
                  Keeping <span className="font-semibold text-[color:var(--text)]">{formatPercent(f.totals.savingsRate)}</span> of
                  what you earn
                </span>
                <span className="text-[11.5px] text-faint tabular">
                  target {formatPercent(state.profile.savingsTargetPct || 0)}
                </span>
              </div>
              <Bar
                value={Math.max(0, f.totals.savingsRate)}
                target={Math.max(1, state.profile.savingsTargetPct || 20)}
                color="var(--tone-save)"
                overTone="good"
                compact
              />
              <div className="flex items-center justify-between text-[11.5px] mt-2.5">
                <span className="text-faint">
                  {f.totals.net >= 0 ? 'Unspent so far' : 'Beyond what came in'}
                </span>
                <span className={`tabular font-medium ${f.totals.net >= 0 ? 'text-good' : 'text-bad'}`}>
                  <Money value={Math.abs(f.totals.net)} />
                </span>
              </div>
            </div>
          </div>
        </div>

        {f.isCurrent && f.totals.expense > 0 && (
          <div className="mt-4 pt-4 border-t border-hair grid grid-cols-2 sm:grid-cols-4 gap-3 text-center">
            {[
              ['Daily burn', <Money key="a" value={f.dailyBurn} compact />],
              ['On pace for', <Money key="b" value={f.projectedExpense} compact />],
              ['Entries', f.totals.count],
              ['Biggest', f.biggest ? <Money key="c" value={f.biggest.amount} compact /> : '—'],
            ].map(([label, value], i) => (
              <div key={label} className="animate-rise" style={stagger(i)}>
                <div className="text-[10.5px] uppercase tracking-wider text-faint">{label}</div>
                <div className="text-[15px] font-semibold display mt-1">{value}</div>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* ── Suggestions ── */}
      {tips.length > 0 && (
        <div>
          <SectionTitle
            icon="compass"
            action={
              <Button size="sm" variant="subtle" onClick={() => onNavigate('advisor')}>
                All advice
                <Icon name="chevR" className="size-3.5" />
              </Button>
            }
          >
            Worth a look
          </SectionTitle>
          <div className="grid md:grid-cols-3 gap-3">
            {tips.map((t, i) => (
              <button
                key={t.id}
                onClick={() => onNavigate(t.action?.to || 'advisor')}
                className="surface rounded-2xl p-4 text-left transition-all animate-rise
                           hover:[background:var(--surface-hover)] active:scale-[0.99]"
                style={stagger(i)}
              >
                <div className="flex items-center gap-2 mb-2">
                  <span
                    className="size-7 rounded-lg grid place-items-center shrink-0"
                    style={{
                      background: `color-mix(in srgb, var(--tone-${t.tone}) 16%, transparent)`,
                      color: `var(--tone-${t.tone})`,
                    }}
                  >
                    <Icon name={t.icon} className="size-3.5" />
                  </span>
                  <span className="text-[11px] uppercase tracking-wider text-faint">{t.tone === 'bad' ? 'Needs attention' : t.tone === 'warn' ? 'Heads up' : 'Note'}</span>
                </div>
                <div className="text-[13.5px] font-semibold leading-snug">{t.title}</div>
                <p className="text-[12px] text-dim mt-1.5 leading-relaxed line-clamp-3">{t.body}</p>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ── Spend trend + mix ── */}
      <div className="grid lg:grid-cols-5 gap-4">
        <Card className="lg:col-span-3 p-5">
          <SectionTitle icon="wave" sub="Daily spend, with a seven-day average through it">
            Last 30 days
          </SectionTitle>
          <Suspense fallback={<div className="h-52 rounded-2xl animate-pulse" style={{ background: 'var(--border)' }} />}>
            <SpendTrend data={spark} cur={cur} />
          </Suspense>
        </Card>

        <Card className="lg:col-span-2 p-5">
          <SectionTitle icon="pie" sub="This month, largest first">Where it went</SectionTitle>
          {donutData.length === 0 ? (
            <Empty icon="pie" title="Nothing logged yet" body="Add an expense and the mix appears here." />
          ) : (
            <>
              <div className="h-44 relative">
                <Suspense fallback={<div className="absolute inset-4 rounded-full animate-pulse" style={{ background: 'var(--border)' }} />}>
                  <CategoryDonut data={donutData} cur={cur} />
                </Suspense>
                <div className="absolute inset-0 grid place-items-center pointer-events-none">
                  <div className="text-center">
                    <div className="text-[10.5px] uppercase tracking-wider text-faint">Total</div>
                    <div className="text-[17px] font-semibold display">
                      <Money value={f.totals.expense} compact />
                    </div>
                  </div>
                </div>
              </div>
              <div className="space-y-1.5 mt-3">
                {donutData.slice(0, 5).map((c, i) => (
                  <button
                    key={c.id}
                    onClick={() => c.id !== 'other' && onNavigate(`section:${c.id}`)}
                    className="w-full flex items-center gap-2.5 text-[12.5px] py-1 rounded-lg transition-colors
                               hover:[background:var(--surface-hover)] px-1 -mx-1 animate-rise"
                    style={stagger(i)}
                  >
                    <span className="size-2 rounded-full shrink-0" style={{ background: c.color }} />
                    <span className="truncate flex-1 text-left">{c.label}</span>
                    <span className="text-faint tabular shrink-0">{formatPercent(c.share ?? 0)}</span>
                    <span className="tabular shrink-0 w-16 text-right">
                      <Money value={c.total} compact />
                    </span>
                  </button>
                ))}
              </div>
            </>
          )}
        </Card>
      </div>

      {/* ── Budgets + net worth ── */}
      <div className="grid lg:grid-cols-5 gap-4">
        <Card className="lg:col-span-3 p-5">
          <SectionTitle
            icon="target"
            sub="The line marks where you should be by now"
            action={
              <Button size="sm" variant="subtle" onClick={() => onNavigate('settings')}>
                Edit
              </Button>
            }
          >
            Budgets
          </SectionTitle>
          {f.budgets.filter((b) => b.cap > 0).length === 0 ? (
            <Empty
              icon="target"
              title="No budgets set"
              body="Budgets are what let this app warn you mid-month instead of reporting the damage afterwards."
              action={<Button variant="primary" size="sm" onClick={() => onNavigate('settings')}>Set budgets</Button>}
            />
          ) : (
            <div className="space-y-3.5">
              {f.budgets.filter((b) => b.cap > 0).slice(0, 6).map((b, i) => (
                <div key={b.id} className="animate-rise" style={stagger(i)}>
                  <Bar
                    label={b.label}
                    value={b.spent}
                    target={b.cap}
                    color={b.color}
                    pace={f.isCurrent ? f.progress : null}
                    right={
                      <>
                        <Money value={b.spent} compact /> <span className="text-faint">/ {formatMoney(b.cap, cur, { compact: true })}</span>
                      </>
                    }
                    sub={
                      b.status === 'over'
                        ? `Over by ${formatMoney(b.spent - b.cap, cur)}`
                        : b.status === 'ahead'
                        ? `Ahead of pace — on track for ${formatMoney(b.projected || 0, cur)}`
                        : `${formatMoney(Math.max(0, b.left), cur)} left`
                    }
                  />
                </div>
              ))}
            </div>
          )}
        </Card>

        <Card className="lg:col-span-2 p-5 flex flex-col">
          <SectionTitle icon="coins" sub="From the values you have entered">Net worth</SectionTitle>
          {inv.empty ? (
            <Empty
              icon="coins"
              title="No holdings yet"
              body="Add what you own and update it monthly to see it build."
              action={<Button variant="primary" size="sm" onClick={() => onNavigate('invest')}>Add a holding</Button>}
            />
          ) : (
            <>
              <div className="text-[30px] font-semibold display leading-none">
                <Money value={inv.netWorth} compact animate />
              </div>
              <div className="flex items-center gap-2 mt-2">
                <Delta change={inv.monthChange} suffix="this month" />
                <span className={`text-[12px] tabular ${inv.gain >= 0 ? 'text-good' : 'text-bad'}`}>
                  {inv.gain >= 0 ? '+' : '−'}
                  <Money value={Math.abs(inv.gain)} compact /> overall
                </span>
              </div>

              <Suspense fallback={<div className="h-24 mt-3 rounded-xl animate-pulse" style={{ background: 'var(--border)' }} />}>
                <NetWorthSpark data={inv.series} cur={cur} />
              </Suspense>

              <div className="space-y-1.5 mt-3">
                {inv.byClass.slice(0, 4).map((c) => (
                  <div key={c.id} className="flex items-center gap-2.5 text-[12.5px]">
                    <span className="size-2 rounded-full shrink-0" style={{ background: c.color }} />
                    <span className="truncate flex-1">{c.label}</span>
                    <span className="text-faint tabular">{formatPercent(c.share)}</span>
                  </div>
                ))}
              </div>

              <Button variant="subtle" size="sm" className="mt-auto pt-3" onClick={() => onNavigate('invest')}>
                Open investments
                <Icon name="chevR" className="size-3.5" />
              </Button>
            </>
          )}
        </Card>
      </div>

      {/* ── Recent ── */}
      <Card className="p-5">
        <SectionTitle
          icon="ledger"
          action={
            <Button size="sm" variant="subtle" onClick={() => onNavigate('ledger')}>
              Full ledger
              <Icon name="chevR" className="size-3.5" />
            </Button>
          }
        >
          Latest entries
        </SectionTitle>
        {f.entries.length === 0 ? (
          <Empty
            icon="ledger"
            title="Nothing logged this month"
            body="The daily log is where everything on this page comes from."
            action={<Button variant="primary" size="sm" onClick={() => onNavigate('compose')}>Log something</Button>}
          />
        ) : (
          <div className="divide-y divide-[color:var(--border)]">
            {f.entries.slice(0, 6).map((e, i) => {
              const cat = categoryById(e.category);
              const kind = kindById(e.kind);
              return (
                <div key={e.id} className="flex items-center gap-3 py-2.5 animate-rise" style={stagger(i)}>
                  <CategoryDot color={cat.color} icon={cat.icon} />
                  <div className="min-w-0 flex-1">
                    <div className="text-[13.5px] font-medium truncate">{e.title}</div>
                    <div className="text-[11.5px] text-faint truncate">
                      {cat.label} · {dayLabel(e.date)}
                      {e.note ? ` · ${e.note}` : ''}
                    </div>
                  </div>
                  <div className={`text-[13.5px] font-semibold tabular shrink-0 ${KIND_TEXT[kind.tone]}`}>
                    {kind.sign > 0 ? '+' : '−'}
                    <Money value={e.amount} />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Card>
    </div>
  );
}
