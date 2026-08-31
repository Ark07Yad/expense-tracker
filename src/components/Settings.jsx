/**
 * Settings.
 *
 * Profile, budgets and the data itself. The data section is not an afterthought
 * — this app has no server, so export is the only backup that exists, and it
 * says so plainly rather than letting people find out the hard way.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { useStore, suggestBudgets } from '../lib/store';
import { CURRENCIES, categoriesFor } from '../lib/data';
import { buildDemo } from '../lib/demo';
import { formatMoney, formatPercent } from '../lib/calc';
import * as persist from '../lib/persist';
import {
  Badge, Bar, Button, Card, ConfirmButton, Empty, Field, Icon, Input, Money,
  MoneyInput, NumberInput, SectionTitle, Select, Sheet,
} from './ui';

export default function Settings({ toast }) {
  const { state, dispatch } = useStore();
  const cur = state.profile.currency;
  const fileRef = useRef(null);
  const [storage, setStorage] = useState(null);
  const [resetOpen, setResetOpen] = useState(false);

  useEffect(() => {
    persist.storageStatus().then(setStorage);
  }, [state.entries.length]);

  const budgets = state.profile.budgets;
  const budgetTotal = useMemo(
    () => Object.values(budgets).reduce((a, b) => a + (Number(b) || 0), 0),
    [budgets]
  );
  const income = state.profile.monthlyIncome || 0;
  const savingsTarget = (income * (state.profile.savingsTargetPct || 0)) / 100;
  const unallocated = income - budgetTotal - savingsTarget;

  const setProfile = (patch) => dispatch({ type: 'profile', patch });

  const exportData = async () => {
    const payload = { app: 'cointrack', version: state.version, exportedAt: new Date().toISOString(), state };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `cointrack-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast?.('Backup downloaded');
  };

  const importData = (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(String(reader.result));
        const next = parsed.state || parsed;
        if (!next || !Array.isArray(next.entries)) throw new Error('not a CoinTrack backup');
        dispatch({ type: 'replace', state: { ...next, onboarded: true } });
        toast?.(`Restored ${next.entries.length} entries`);
      } catch {
        toast?.('That file is not a CoinTrack backup');
      }
    };
    reader.readAsText(file);
    event.target.value = '';
  };

  const loadDemo = () => {
    const demo = buildDemo({ income: income || 85000 });
    dispatch({
      type: 'replace',
      state: {
        ...state,
        onboarded: true,
        entries: demo.entries,
        assets: demo.assets,
        profile: { ...state.profile, budgets: demo.budgets },
      },
    });
    toast?.('Sample data loaded');
  };

  return (
    <div className="space-y-5">
      {/* ── Profile ── */}
      <Card className="p-5">
        <SectionTitle icon="user" sub="Only ever stored on this device">Profile</SectionTitle>
        <div className="grid sm:grid-cols-2 gap-3">
          <Field label="Name">
            <Input
              value={state.profile.name}
              onChange={(e) => setProfile({ name: e.target.value })}
              placeholder="Your name"
              maxLength={30}
            />
          </Field>
          <Field label="Currency" hint="Changes formatting only — no amounts are converted.">
            <Select value={cur} onChange={(e) => setProfile({ currency: e.target.value })}>
              {CURRENCIES.map((c) => (
                <option key={c.code} value={c.code}>{c.symbol} {c.code} — {c.label}</option>
              ))}
            </Select>
          </Field>
          <Field label="Weeks start on">
            <Select
              value={state.profile.weekStart}
              onChange={(e) => setProfile({ weekStart: Number(e.target.value) })}
            >
              <option value={1}>Monday</option>
              <option value={0}>Sunday</option>
            </Select>
          </Field>
          <Field label="Monthly take-home" hint="Used to size budgets and the savings rate.">
            <MoneyInput
              size="md"
              value={state.profile.monthlyIncome}
              onChange={(v) => setProfile({ monthlyIncome: v })}
            />
          </Field>
        </div>

        <Field
          label="Savings target"
          className="mt-3"
          hint={
            income > 0
              ? `${formatMoney(savingsTarget, cur)} a month.`
              : 'Set your income above to see what this is worth in money.'
          }
        >
          <div className="flex items-center gap-4">
            <input
              type="range"
              min={0}
              max={60}
              value={state.profile.savingsTargetPct || 0}
              onChange={(e) => setProfile({ savingsTargetPct: Number(e.target.value) })}
              className="flex-1"
            />
            <div className="w-16 shrink-0">
              <NumberInput
                value={state.profile.savingsTargetPct}
                onChange={(v) => setProfile({ savingsTargetPct: Math.min(90, Math.max(0, v || 0)) })}
                min={0}
                max={90}
                className="text-center py-2 text-[15px] font-semibold"
              />
            </div>
          </div>
        </Field>
      </Card>

      {/* ── Budgets ── */}
      <Card className="p-5">
        <SectionTitle
          icon="target"
          sub="Monthly ceilings. The week, quarter and year views scale them for you."
          action={
            income > 0 && (
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  setProfile({ budgets: suggestBudgets(income, state.profile.savingsTargetPct) });
                  toast?.('Budgets proposed from your income');
                }}
              >
                <Icon name="spark" className="size-3.5" />
                Propose
              </Button>
            )
          }
        >
          Budgets
        </SectionTitle>

        {income > 0 && (
          <div className="surface rounded-2xl p-3.5 mb-4">
            <Bar
              value={budgetTotal + savingsTarget}
              target={income}
              color={unallocated < 0 ? 'var(--tone-bad)' : 'var(--tone-brand)'}
              label="Allocated"
              right={
                <>
                  <Money value={budgetTotal + savingsTarget} compact /> <span className="text-faint">of {formatMoney(income, cur, { compact: true })}</span>
                </>
              }
              sub={
                unallocated < 0
                  ? `Over-allocated by ${formatMoney(Math.abs(unallocated), cur)} — the plan cannot be met even if every category behaves.`
                  : `${formatMoney(unallocated, cur)} unallocated, on top of the ${formatMoney(savingsTarget, cur)} savings target.`
              }
            />
          </div>
        )}

        <div className="space-y-2">
          {categoriesFor('expense').map((c) => {
            const value = budgets[c.id];
            return (
              <div key={c.id} className="flex items-center gap-3">
                <span
                  className="size-8 rounded-xl grid place-items-center shrink-0"
                  style={{ background: `${c.color}1f`, color: c.color }}
                >
                  <Icon name={c.icon} className="size-4" />
                </span>
                <span className="text-[13px] flex-1 truncate">{c.label}</span>
                {value ? (
                  <span className="text-[11px] text-faint tabular hidden sm:block">
                    {income > 0 ? formatPercent((value / income) * 100) + ' of income' : ''}
                  </span>
                ) : (
                  <Badge tone="neutral" className="hidden sm:inline-flex">no cap</Badge>
                )}
                <div className="w-32 shrink-0">
                  <NumberInput
                    value={value ?? null}
                    onChange={(v) => dispatch({ type: 'budget', category: c.id, amount: v })}
                    min={0}
                    allowEmpty
                    placeholder="—"
                    className="text-right py-2 text-[13px]"
                  />
                </div>
              </div>
            );
          })}
        </div>
      </Card>

      {/* ── Data ── */}
      <Card className="p-5">
        <SectionTitle icon="shield" sub="There is no server. This device is the only copy.">
          Your data
        </SectionTitle>

        <div className="grid sm:grid-cols-3 gap-2.5 mb-4">
          <div className="surface rounded-2xl p-3.5">
            <div className="text-[10.5px] uppercase tracking-wider text-faint">Entries</div>
            <div className="text-[20px] font-semibold display mt-1">{state.entries.length}</div>
          </div>
          <div className="surface rounded-2xl p-3.5">
            <div className="text-[10.5px] uppercase tracking-wider text-faint">Holdings</div>
            <div className="text-[20px] font-semibold display mt-1">{state.assets.length}</div>
          </div>
          <div className="surface rounded-2xl p-3.5">
            <div className="text-[10.5px] uppercase tracking-wider text-faint">Storage</div>
            <div className="text-[13px] font-medium mt-1.5 truncate">{storage?.backend || 'checking…'}</div>
            <div className="text-[11px] text-faint mt-0.5">
              {storage?.persisted ? 'Protected from eviction' : 'Not yet protected'}
            </div>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button variant="ghost" size="sm" onClick={exportData}>
            <Icon name="download" className="size-3.5" />
            Export backup
          </Button>
          <Button variant="ghost" size="sm" onClick={() => fileRef.current?.click()}>
            <Icon name="upload" className="size-3.5" />
            Restore from file
          </Button>
          <input ref={fileRef} type="file" accept="application/json" className="hidden" onChange={importData} />
          <Button variant="ghost" size="sm" onClick={loadDemo}>
            <Icon name="spark" className="size-3.5" />
            Load sample data
          </Button>
          <Button variant="danger" size="sm" className="ml-auto" onClick={() => setResetOpen(true)}>
            <Icon name="trash" className="size-3.5" />
            Erase everything
          </Button>
        </div>

        <p className="text-[11.5px] text-faint mt-3 leading-relaxed">
          Loading sample data replaces every entry and holding you currently have. Export first if you want to
          keep them.
        </p>
      </Card>

      <Sheet
        open={resetOpen}
        onClose={() => setResetOpen(false)}
        title="Erase everything?"
        subtitle="This cannot be undone"
        size="sm"
        footer={
          <div className="flex items-center gap-2">
            <Button variant="subtle" onClick={() => setResetOpen(false)} className="flex-1">Keep my data</Button>
            <ConfirmButton
              label="Erase everything"
              confirmLabel="Yes, erase it"
              onConfirm={async () => {
                await persist.clearAll();
                dispatch({ type: 'reset' });
                setResetOpen(false);
              }}
            />
          </div>
        }
      >
        <Empty
          icon="alert"
          title={`${state.entries.length} entries and ${state.assets.length} holdings`}
          body="Everything will be deleted from this browser, including the daily snapshots. If you have not exported a backup, this is the moment."
          action={
            <Button variant="ghost" size="sm" onClick={exportData}>
              <Icon name="download" className="size-3.5" />
              Export first
            </Button>
          }
        />
      </Sheet>
    </div>
  );
}
