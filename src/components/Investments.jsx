/**
 * Investments and net worth.
 *
 * The model is deliberately manual: you tell it what a holding is worth at the
 * end of each month, and what you paid in that month. No price feed, no
 * brokerage connection, no pretending to know today's value to the rupee.
 *
 * Keeping *contributed* separate from *value* is the one thing this screen
 * insists on. Without it every deposit reads as growth, which flatters a
 * portfolio that is merely being fed — the grey dashed line on the chart is
 * what you paid in, and the gap above it is the only part that is actually a
 * return.
 */

import { useEffect, useMemo, useState } from 'react';
import {
  Area, AreaChart, CartesianGrid, Cell, Line, Pie, PieChart, ResponsiveContainer,
  Tooltip, XAxis, YAxis,
} from 'recharts';
import { useStore } from '../lib/store';
import { useInvestments } from '../lib/useFinance';
import { ASSET_CLASSES, assetClassById } from '../lib/data';
import { addMonthKeys, formatMoney, formatPercent, monthKey, monthLabel, todayKey } from '../lib/calc';
import Goals from './Goals';
import {
  Badge, Bar, Button, Card, CategoryDot, ConfirmButton, Empty, Field, Icon,
  IconButton, Input, Money, MoneyInput, SectionTitle, Select, Sheet, Stat,
  Textarea, stagger, tooltipStyle,
} from './ui';

export default function Investments({ toast }) {
  const { state } = useStore();
  const inv = useInvestments(12);
  const cur = state.profile.currency;
  const [addOpen, setAddOpen] = useState(false);
  const [updateOpen, setUpdateOpen] = useState(false);
  const [editing, setEditing] = useState(null);

  const nowMonth = monthKey(todayKey());

  return (
    <div className="space-y-5">
      {/* ── Hero ── */}
      <Card glow sheen className="p-5 sm:p-6">
        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 mb-5">
          <div>
            <h1 className="text-[20px] font-semibold display">What you own</h1>
            <p className="text-[13px] text-dim mt-1">
              {inv.empty
                ? 'Add your holdings and update them once a month.'
                : `${inv.rows.length} ${inv.rows.length === 1 ? 'holding' : 'holdings'}, last updated ${
                    inv.lastUpdated ? monthLabel(inv.lastUpdated) : 'never'
                  }`}
            </p>
          </div>
          <div className="flex gap-2 shrink-0">
            <Button variant="ghost" size="sm" onClick={() => setAddOpen(true)}>
              <Icon name="plus" className="size-3.5" />
              Add holding
            </Button>
            {!inv.empty && (
              <Button variant="primary" size="sm" onClick={() => setUpdateOpen(true)}>
                <Icon name="calendar" className="size-3.5" />
                Monthly update
              </Button>
            )}
          </div>
        </div>

        {inv.empty ? (
          <Empty
            icon="coins"
            title="No holdings recorded"
            body="Funds, deposits, gold, property, a crypto wallet — anything you would count toward what you are worth. You enter the values; nothing here connects to a bank."
            action={<Button variant="primary" onClick={() => setAddOpen(true)}>Add your first holding</Button>}
          />
        ) : (
          <>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5">
              <Stat
                label="Net worth" icon="coins" tone="invest"
                value={<Money value={inv.netWorth} compact animate />}
                delta={inv.monthChange} sub="vs last month"
              />
              <Stat
                label="Paid in" icon="upload"
                value={<Money value={inv.invested} compact animate />}
                sub={`${formatMoney(inv.contributedThisMonth, cur, { compact: true })} this month`}
              />
              <Stat
                label="Gain" icon={inv.gain >= 0 ? 'trendUp' : 'trendDown'} tone={inv.gain >= 0 ? 'good' : 'bad'}
                value={<Money value={inv.gain} compact animate sign />}
                sub={`${formatPercent(inv.gainPct, 1)} on what you put in`}
              />
              <Stat
                label="This month" icon="wave" tone={inv.monthDelta >= 0 ? 'good' : 'bad'}
                value={<Money value={inv.monthDelta} compact animate sign />}
                sub="change in value"
              />
            </div>

            <div className="h-56 mt-5 -ml-2">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={inv.series} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
                  <defs>
                    <linearGradient id="invWorth" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="var(--tone-invest)" stopOpacity={0.42} />
                      <stop offset="100%" stopColor="var(--tone-invest)" stopOpacity={0.02} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid vertical={false} strokeDasharray="3 3" />
                  <XAxis dataKey="short" axisLine={false} tickLine={false} minTickGap={14} />
                  <YAxis
                    axisLine={false} tickLine={false} width={54}
                    domain={[(min) => Math.max(0, min * 0.9), (max) => max * 1.04]}
                    tickFormatter={(v) => formatMoney(v, cur, { compact: true, decimals: 0 })}
                  />
                  <Tooltip
                    contentStyle={tooltipStyle}
                    labelFormatter={(_, p) => p?.[0]?.payload?.label ?? ''}
                    formatter={(v, n) => [formatMoney(v, cur), n === 'invested' ? 'Paid in' : n === 'gain' ? 'Gain' : 'Value']}
                  />
                  <Area
                    type="monotone" dataKey="value" stroke="var(--tone-invest)" strokeWidth={2.4}
                    fill="url(#invWorth)" isAnimationActive={false}
                  />
                  <Line
                    type="monotone" dataKey="invested" stroke="var(--text-faint)" strokeWidth={1.6}
                    strokeDasharray="5 4" dot={false} isAnimationActive={false}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
            <p className="text-[11.5px] text-faint mt-2 text-center">
              Solid line is value. Dashed line is what you have paid in — the gap between them is the return.
            </p>
          </>
        )}
      </Card>

      {/* Goals sit above holdings: money you are building toward, then money
          you already hold. Both belong on this screen; neither belongs in the
          other's card. */}
      <Goals toast={toast} />

      {!inv.empty && (
        <>
          {inv.staleAssets.length > 0 && (
            <Card className="p-4 border-amber-400/25" style={{ background: 'color-mix(in srgb, var(--tone-warn) 8%, var(--surface))' }}>
              <div className="flex items-start gap-3">
                <span className="size-8 rounded-xl grid place-items-center shrink-0 text-warn"
                      style={{ background: 'color-mix(in srgb, var(--tone-warn) 16%, transparent)' }}>
                  <Icon name="clock" className="size-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="text-[13.5px] font-medium">
                    {inv.staleAssets.length} {inv.staleAssets.length === 1 ? 'holding needs' : 'holdings need'} a fresh value
                  </div>
                  <p className="text-[12px] text-dim mt-1 leading-relaxed">
                    {inv.staleAssets.map((a) => a.name).join(', ')}. Their last known value is being carried forward,
                    which quietly distorts the whole net-worth line.
                  </p>
                </div>
                <Button size="sm" variant="ghost" className="shrink-0" onClick={() => setUpdateOpen(true)}>
                  Update
                </Button>
              </div>
            </Card>
          )}

          {/* ── Allocation ── */}
          <div className="grid lg:grid-cols-5 gap-4">
            <Card className="lg:col-span-2 p-5">
              <SectionTitle icon="pie" sub="Share of total value">Allocation</SectionTitle>
              <div className="h-48 relative">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={inv.byClass} dataKey="value" nameKey="label"
                      innerRadius="60%" outerRadius="95%" paddingAngle={2} stroke="none" isAnimationActive={false}
                    >
                      {inv.byClass.map((c) => <Cell key={c.id} fill={c.color} />)}
                    </Pie>
                    <Tooltip contentStyle={tooltipStyle} formatter={(v, n) => [formatMoney(v, cur), n]} />
                  </PieChart>
                </ResponsiveContainer>
                <div className="absolute inset-0 grid place-items-center pointer-events-none">
                  <div className="text-center">
                    <div className="text-[10.5px] uppercase tracking-wider text-faint">Total</div>
                    <div className="text-[17px] font-semibold display">
                      <Money value={inv.netWorth} compact />
                    </div>
                  </div>
                </div>
              </div>
              <div className="space-y-2 mt-3">
                {inv.byClass.map((c) => (
                  <div key={c.id} className="flex items-center gap-2.5 text-[12.5px]">
                    <span className="size-2 rounded-full shrink-0" style={{ background: c.color }} />
                    <span className="truncate flex-1">{c.label}</span>
                    <span className="text-faint tabular">{formatPercent(c.share)}</span>
                    <span className="tabular w-16 text-right"><Money value={c.value} compact /></span>
                  </div>
                ))}
              </div>
            </Card>

            <Card className="lg:col-span-3 p-5">
              <SectionTitle icon="layers" sub="Value against what you paid in, per holding">
                Holdings
              </SectionTitle>
              <div className="space-y-3">
                {inv.rows.map((r, i) => (
                  <div
                    key={r.id}
                    className="group surface rounded-2xl p-3.5 animate-rise"
                    style={stagger(i)}
                  >
                    <div className="flex items-center gap-3">
                      <CategoryDot color={r.meta.color} icon={r.meta.icon} />
                      <div className="min-w-0 flex-1">
                        <div className="text-[13.5px] font-medium truncate">{r.name}</div>
                        <div className="text-[11.5px] text-faint truncate">
                          {r.meta.label}
                          {r.lastMonth ? ` · valued ${monthLabel(r.lastMonth)}` : ' · never valued'}
                          {r.note ? ` · ${r.note}` : ''}
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <div className="text-[14px] font-semibold display tabular">
                          <Money value={r.value} compact />
                        </div>
                        <div className={`text-[11.5px] tabular ${r.gain >= 0 ? 'text-good' : 'text-bad'}`}>
                          {r.gain >= 0 ? '+' : '−'}
                          {formatMoney(Math.abs(r.gain), cur, { compact: true })} ({formatPercent(r.gainPct, 1)})
                        </div>
                      </div>
                      <div className="flex items-center shrink-0 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
                        <IconButton name="edit" label="Edit holding" className="size-8" onClick={() => setEditing(r)} />
                      </div>
                    </div>

                    <div className="mt-2.5">
                      <Bar
                        value={Math.min(r.invested, r.value)}
                        target={Math.max(r.invested, r.value, 1)}
                        color={r.meta.color}
                        compact
                      />
                      <div className="flex items-center justify-between text-[11px] text-faint mt-1.5">
                        <span>Paid in {formatMoney(r.invested, cur, { compact: true })}</span>
                        {r.monthsStale >= 2 && (
                          <Badge tone="warn">{r.monthsStale} months since a value</Badge>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          </div>

          {/* ── Contribution history ── */}
          <Card className="p-5">
            <SectionTitle icon="calendar" sub="What you paid in each month, per holding">
              Contribution history
            </SectionTitle>
            <ContributionTable assets={inv.assets} currency={cur} onEdit={() => setUpdateOpen(true)} />
          </Card>
        </>
      )}

      <AssetSheet
        open={addOpen || !!editing}
        editing={editing}
        onClose={() => { setAddOpen(false); setEditing(null); }}
        onSaved={toast}
      />
      <MonthlyUpdateSheet
        open={updateOpen}
        onClose={() => setUpdateOpen(false)}
        assets={inv.rows}
        defaultMonth={nowMonth}
        onSaved={toast}
      />
    </div>
  );
}

/* ────────────────────────────  Add / edit holding  ──────────────────────── */

const blankAsset = () => ({ name: '', class: 'fund', note: '', contributed: null, value: null });

function AssetSheet({ open, editing, onClose, onSaved }) {
  const { dispatch } = useStore();
  const [draft, setDraft] = useState(blankAsset);
  const [error, setError] = useState('');

  /*
   * Re-seed every time the sheet opens.
   *
   * This used to compare an `open`-derived key during render, which never
   * reset while the sheet was closed: reopening the *same* holding matched the
   * previous key and skipped the seed, so a cancelled edit stayed in the form.
   * The discarded text was then one Save away from being committed — the sheet
   * showed a name the holding did not have. Keying on the open transition
   * itself is what makes cancel actually mean cancel.
   */
  useEffect(() => {
    if (!open) return;
    setDraft(
      editing
        ? { name: editing.name, class: editing.class, note: editing.note || '', contributed: null, value: null }
        : blankAsset()
    );
    setError('');
  }, [open, editing]);

  const patch = (p) => setDraft((d) => ({ ...d, ...p }));

  const save = () => {
    if (!draft.name.trim()) {
      setError('Give the holding a name.');
      return;
    }
    if (editing) {
      dispatch({ type: 'updateAsset', id: editing.id, patch: { name: draft.name.trim(), class: draft.class, note: draft.note.trim() } });
      onSaved?.(`Updated ${draft.name.trim()}`);
    } else {
      dispatch({ type: 'addAsset', asset: draft });
      onSaved?.(`Added ${draft.name.trim()}`);
    }
    onClose();
  };

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={editing ? 'Edit holding' : 'Add a holding'}
      subtitle={editing ? 'Values are edited from the monthly update' : 'Anything you would count toward what you are worth'}
      size="sm"
      footer={
        <div className="flex items-center gap-2">
          {editing && (
            <ConfirmButton
              label="Delete"
              onConfirm={() => {
                dispatch({ type: 'deleteAsset', id: editing.id });
                onSaved?.(`Deleted ${editing.name}`);
                onClose();
              }}
            />
          )}
          <Button variant="subtle" onClick={onClose} className="ml-auto">Cancel</Button>
          <Button variant="primary" onClick={save}>
            <Icon name="check" className="size-4" />
            {editing ? 'Save' : 'Add holding'}
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        <Field label="Name">
          <Input
            value={draft.name}
            onChange={(e) => patch({ name: e.target.value })}
            placeholder="e.g. Index fund, Fixed deposit, Gold"
            maxLength={50}
            autoFocus
          />
        </Field>

        <div>
          <span className="block text-[12px] font-medium text-dim mb-1.5">Type</span>
          <div className="flex gap-1.5 flex-wrap">
            {ASSET_CLASSES.map((a) => {
              const active = draft.class === a.id;
              return (
                <button
                  key={a.id}
                  onClick={() => patch({ class: a.id })}
                  className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-full text-[12.5px] font-medium
                              transition-all active:scale-95 border
                              ${active ? '' : 'surface border-hair text-dim hover:text-[color:var(--text)]'}`}
                  style={active ? { background: `${a.color}26`, borderColor: `${a.color}88`, color: a.color } : undefined}
                >
                  <Icon name={a.icon} className="size-3.5" />
                  {a.label}
                </button>
              );
            })}
          </div>
        </div>

        {!editing && (
          <div className="grid sm:grid-cols-2 gap-3">
            <Field label="Paid in so far" hint="Everything you have put in to date.">
              <MoneyInput value={draft.contributed} onChange={(v) => patch({ contributed: v })} />
            </Field>
            <Field label="Worth today" hint="Your best current estimate.">
              <MoneyInput value={draft.value} onChange={(v) => patch({ value: v })} />
            </Field>
          </div>
        )}

        <Field label="Note" hint="Optional — where it is held, when it matures.">
          <Textarea rows={2} value={draft.note} onChange={(e) => patch({ note: e.target.value })} maxLength={120} />
        </Field>

        {error && <p className="text-[12px] text-bad">{error}</p>}
      </div>
    </Sheet>
  );
}

/* ─────────────────────────────  Monthly update  ─────────────────────────── */

/**
 * The monthly ritual.
 *
 * One sheet, every holding, two numbers each. Values are pre-filled with the
 * last known figure so an unchanged holding is confirmed by doing nothing,
 * while contributions start blank — carrying a contribution forward would
 * silently invent money you never paid in.
 */
function MonthlyUpdateSheet({ open, onClose, assets, defaultMonth, onSaved }) {
  const { state, dispatch } = useStore();
  const cur = state.profile.currency;
  const [month, setMonth] = useState(defaultMonth);
  const [draft, setDraft] = useState({});

  /*
   * Re-seed on open, and whenever the month is changed while open.
   *
   * Same fix as AssetSheet: the previous render-time key never reset on close,
   * so reopening on the same month restored whatever had been typed and
   * abandoned last time.
   *
   * `assets` and `state.assets` are deliberately not dependencies. They change
   * identity on any state update, and re-seeding from them mid-edit would wipe
   * figures the user is in the middle of typing. The effect closes over the
   * values from the render that opened the sheet, which are the current ones.
   */
  useEffect(() => {
    if (!open) return;
    const next = {};
    for (const a of assets) {
      const existing = state.assets.find((x) => x.id === a.id)?.history?.[month];
      next[a.id] = {
        contributed: existing ? existing.contributed : null,
        value: existing ? existing.value : a.value || null,
      };
    }
    setDraft(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, month]);

  const months = useMemo(
    () => Array.from({ length: 13 }, (_, i) => addMonthKeys(defaultMonth, -i)),
    [defaultMonth]
  );

  const totals = Object.values(draft).reduce(
    (t, d) => ({
      contributed: t.contributed + (Number(d?.contributed) || 0),
      value: t.value + (Number(d?.value) || 0),
    }),
    { contributed: 0, value: 0 }
  );

  const save = () => {
    let touched = 0;
    for (const a of assets) {
      const d = draft[a.id];
      if (!d) continue;
      const contributed = Number(d.contributed) || 0;
      const value = Number(d.value) || 0;
      // Skip rows the user left completely empty rather than writing zeros,
      // which would record "this is worth nothing" for a holding they simply
      // did not get to.
      if (!contributed && !value) continue;
      dispatch({ type: 'setSnapshot', assetId: a.id, month, contributed, value });
      touched += 1;
    }
    onSaved?.(`${monthLabel(month)} updated — ${touched} ${touched === 1 ? 'holding' : 'holdings'}`);
    onClose();
  };

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Monthly update"
      subtitle="What each holding is worth, and what you paid in"
      footer={
        <div className="flex items-center gap-3">
          <div className="text-[12px] text-dim min-w-0">
            <div className="tabular">
              Total <span className="font-semibold text-[color:var(--text)]">{formatMoney(totals.value, cur, { compact: true })}</span>
            </div>
            <div className="text-faint tabular">
              {formatMoney(totals.contributed, cur, { compact: true })} paid in
            </div>
          </div>
          <Button variant="subtle" onClick={onClose} className="ml-auto">Cancel</Button>
          <Button variant="primary" onClick={save}>
            <Icon name="check" className="size-4" />
            Save {monthLabel(month)}
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        <Field label="Month" hint="Back-fill an earlier month if you are catching up.">
          <Select value={month} onChange={(e) => setMonth(e.target.value)}>
            {months.map((m) => (
              <option key={m} value={m}>
                {monthLabel(m)}
                {m === defaultMonth ? ' — this month' : ''}
              </option>
            ))}
          </Select>
        </Field>

        <div className="hidden sm:grid grid-cols-[1fr_8rem_8rem] gap-3 text-[11px] uppercase tracking-wider text-faint px-1">
          <span>Holding</span>
          <span className="text-right">Paid in</span>
          <span className="text-right">Worth</span>
        </div>

        <div className="space-y-2.5">
          {assets.map((a) => {
            const d = draft[a.id] || {};
            const meta = assetClassById(a.class);
            return (
              <div key={a.id} className="grid sm:grid-cols-[1fr_8rem_8rem] gap-2 sm:gap-3 items-center">
                <div className="flex items-center gap-2.5 min-w-0">
                  <CategoryDot size="sm" color={meta.color} icon={meta.icon} />
                  <div className="min-w-0">
                    <div className="text-[13px] font-medium truncate">{a.name}</div>
                    <div className="text-[11px] text-faint truncate">
                      {a.lastMonth ? `last ${monthLabel(a.lastMonth)} · ${formatMoney(a.value, cur, { compact: true })}` : 'no value yet'}
                    </div>
                  </div>
                </div>
                <MoneyInput
                  value={d.contributed}
                  onChange={(v) => setDraft((s) => ({ ...s, [a.id]: { ...s[a.id], contributed: v } }))}
                />
                <MoneyInput
                  value={d.value}
                  onChange={(v) => setDraft((s) => ({ ...s, [a.id]: { ...s[a.id], value: v } }))}
                />
              </div>
            );
          })}
        </div>

        <p className="text-[11.5px] text-faint leading-relaxed">
          Leave a row blank to skip it — the previous value carries forward. "Paid in" is only this month's
          contribution, not the running total.
        </p>
      </div>
    </Sheet>
  );
}

/* ───────────────────────────  Contribution table  ──────────────────────── */

function ContributionTable({ assets, currency, onEdit }) {
  const months = useMemo(() => {
    const set = new Set();
    for (const a of assets) for (const m of Object.keys(a.history || {})) set.add(m);
    return [...set].sort().slice(-6);
  }, [assets]);

  if (!months.length) {
    return <Empty icon="calendar" title="No monthly records yet" body="Run a monthly update to start the history." action={<Button size="sm" variant="primary" onClick={onEdit}>Monthly update</Button>} />;
  }

  return (
    <div className="overflow-x-auto -mx-1 px-1">
      <table className="w-full text-[13px] min-w-[34rem]">
        <thead>
          <tr className="text-[11px] uppercase tracking-wider text-faint">
            <th className="text-left font-medium pb-2">Holding</th>
            {months.map((m) => (
              <th key={m} className="text-right font-medium pb-2">{monthLabel(m)}</th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-[color:var(--border)]">
          {assets.map((a) => (
            <tr key={a.id}>
              <td className="py-2.5 pr-3">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="size-2 rounded-full shrink-0" style={{ background: assetClassById(a.class).color }} />
                  <span className="truncate">{a.name}</span>
                </div>
              </td>
              {months.map((m) => {
                const h = a.history?.[m];
                return (
                  <td key={m} className="py-2.5 text-right tabular">
                    {h ? (
                      <>
                        <div className={h.contributed ? 'text-good' : 'text-faint'}>
                          {h.contributed ? `+${formatMoney(h.contributed, currency, { compact: true })}` : '—'}
                        </div>
                        <div className="text-[11px] text-faint">{formatMoney(h.value, currency, { compact: true })}</div>
                      </>
                    ) : (
                      <span className="text-faint">·</span>
                    )}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
      <p className="text-[11.5px] text-faint mt-3">
        Green is what you paid in that month; the figure beneath it is what the holding was worth.
      </p>
    </div>
  );
}
