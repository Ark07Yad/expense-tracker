/**
 * What you owe.
 *
 * Deliberately the mirror of the holdings card, because it is the same monthly
 * action: read a number off a statement and write it down. Keeping the amount
 * paid separate from the balance left is what distinguishes paying a debt down
 * from watching its interest outrun you — a month where you paid 400 and the
 * balance fell by 250 is a fact worth being able to see.
 */

import { useEffect, useState } from 'react';
import { useStore } from '../lib/store';
import { useDebts } from '../lib/useFinance';
import { DEBT_CLASSES, debtClassById } from '../lib/data';
import { formatMoney, formatPercent, monthLabel } from '../lib/calc';
import {
  Badge, Bar, Button, Card, CategoryDot, ConfirmButton, Empty, Field, Icon,
  IconButton, Input, Money, MoneyInput, NumberInput, SectionTitle, Sheet, Textarea, stagger,
} from './ui';

export default function Debts({ toast }) {
  const { state } = useStore();
  const cur = state.profile.currency;
  const debts = useDebts(12);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(null);

  const openNew = () => {
    setEditing(null);
    setOpen(true);
  };

  return (
    <Card className="p-5">
      <SectionTitle
        icon="bank"
        sub={
          debts.empty
            ? 'Mortgages, cards, loans — anything that comes off what you own'
            : `${formatMoney(debts.owed, cur, { compact: true })} outstanding across ${debts.rows.length} ${debts.rows.length === 1 ? 'debt' : 'debts'}` +
              (debts.monthlyInterest > 0
                ? ` · about ${formatMoney(debts.monthlyInterest, cur, { compact: true })} a month in interest`
                : '')
        }
        action={
          <Button size="sm" variant="ghost" onClick={openNew}>
            <Icon name="plus" className="size-3.5" />
            Add debt
          </Button>
        }
      >
        What you owe
      </SectionTitle>

      {debts.empty ? (
        <Empty
          icon="bank"
          title="Nothing recorded"
          body="If you have a mortgage, a card balance or a loan, adding it here is what turns what you own into what you are actually worth."
          action={<Button variant="primary" size="sm" onClick={openNew}>Add a debt</Button>}
        />
      ) : (
        <div className="space-y-3">
          {debts.rows.map((d, i) => {
            const progress = d.opening > 0 ? (d.clearedSoFar / d.opening) * 100 : 0;
            return (
              <div key={d.id} className="group surface rounded-2xl p-3.5 animate-rise" style={stagger(i)}>
                <div className="flex items-center gap-3">
                  <CategoryDot color={d.meta.color} icon={d.meta.icon} />
                  <div className="min-w-0 flex-1">
                    <div className="text-[13.5px] font-medium truncate">{d.name}</div>
                    <div className="text-[11.5px] text-faint truncate">
                      {d.meta.label}
                      {d.lastMonth ? ` · as of ${monthLabel(d.lastMonth)}` : ' · never updated'}
                      {d.note ? ` · ${d.note}` : ''}
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="text-[14px] font-semibold display tabular text-bad">
                      <Money value={d.balance} compact />
                    </div>
                    {d.paidThisMonth > 0 && (
                      <div className="text-[11.5px] tabular text-good">
                        {formatMoney(d.paidThisMonth, cur, { compact: true })} paid
                      </div>
                    )}
                  </div>
                  <div className="flex items-center shrink-0 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
                    <IconButton name="edit" label="Edit debt" className="size-8" onClick={() => { setEditing(d); setOpen(true); }} />
                  </div>
                </div>

                {d.opening > 0 && (
                  <div className="mt-2.5">
                    <Bar value={d.clearedSoFar} target={d.opening} color="var(--tone-good)" overTone="good" compact />
                    <div className="flex items-center justify-between text-[11px] text-faint mt-1.5">
                      <span>
                        {formatPercent(progress)} cleared of {formatMoney(d.opening, cur, { compact: true })}
                      </span>
                      {d.monthsStale >= 2 && <Badge tone="warn">{d.monthsStale} months since an update</Badge>}
                    </div>
                  </div>
                )}

                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] mt-2">
                  {d.rate !== null && (
                    <span className="text-faint">
                      {formatPercent(d.rate, 1)} a year ·{' '}
                      <span className="text-bad">
                        {formatMoney(d.payoff.monthlyInterest, cur)} a month in interest
                      </span>
                    </span>
                  )}

                  {/* The number that explains a debt paid diligently for a year
                      that has barely moved. */}
                  {d.interestThisMonth > 0 && (
                    <span className="text-faint">
                      of {formatMoney(d.paidThisMonth, cur, { compact: true })} paid,{' '}
                      {formatMoney(d.interestThisMonth, cur, { compact: true })} was interest
                    </span>
                  )}

                  {d.payoff.neverClears ? (
                    <Badge tone="bad">Payments are below the interest</Badge>
                  ) : d.payoff.months ? (
                    <span className="text-faint">
                      clear in {d.payoff.months} {d.payoff.months === 1 ? 'month' : 'months'} at{' '}
                      {formatMoney(d.typicalPayment, cur, { compact: true })} a month
                    </span>
                  ) : null}

                  {d.paymentMismatch && (
                    <Badge tone="warn">
                      ledger says {formatMoney(d.loggedThisMonth, cur, { compact: true })}
                    </Badge>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <DebtSheet
        open={open}
        editing={editing}
        onClose={() => { setOpen(false); setEditing(null); }}
        onSaved={toast}
      />
    </Card>
  );
}

/* ─────────────────────────────── Add / edit ─────────────────────────────── */

const blankDebt = () => ({ name: '', class: 'personal', note: '', balance: null, rate: null });

function DebtSheet({ open, editing, onClose, onSaved }) {
  const { dispatch } = useStore();
  const [draft, setDraft] = useState(blankDebt);
  const [error, setError] = useState('');

  // Seeded from an effect on the open transition, so a cancelled edit does not
  // come back the next time the same debt is opened.
  useEffect(() => {
    if (!open) return;
    setDraft(
      editing
        ? { name: editing.name, class: editing.class, note: editing.note || '', balance: null, rate: editing.rate ?? null }
        : blankDebt()
    );
    setError('');
  }, [open, editing]);

  const patch = (p) => setDraft((d) => ({ ...d, ...p }));

  const save = () => {
    if (!draft.name.trim()) {
      setError('Give the debt a name.');
      return;
    }
    if (editing) {
      dispatch({
        type: 'updateDebt',
        id: editing.id,
        patch: {
          name: draft.name.trim(),
          class: draft.class,
          note: draft.note.trim(),
          rate: draft.rate === null || draft.rate === '' ? null : Number(draft.rate),
        },
      });
      onSaved?.(`Updated ${draft.name.trim()}`);
    } else {
      dispatch({ type: 'addDebt', debt: draft });
      onSaved?.(`Added ${draft.name.trim()}`);
    }
    onClose();
  };

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={editing ? 'Edit debt' : 'Add a debt'}
      subtitle={editing ? 'Balances are updated in the monthly update' : 'What is left to pay, not what you borrowed'}
      size="sm"
      footer={
        <div className="flex items-center gap-2">
          {editing && (
            <ConfirmButton
              label="Delete"
              onConfirm={() => {
                dispatch({ type: 'deleteDebt', id: editing.id });
                onSaved?.(`Deleted ${editing.name}`);
                onClose();
              }}
            />
          )}
          <Button variant="subtle" onClick={onClose} className="ml-auto">Cancel</Button>
          <Button variant="primary" onClick={save}>
            <Icon name="check" className="size-4" />
            {editing ? 'Save' : 'Add debt'}
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        <Field label="Name">
          <Input
            value={draft.name}
            onChange={(e) => patch({ name: e.target.value })}
            placeholder="e.g. Mortgage, Visa card, Car loan"
            maxLength={50}
            autoFocus
          />
        </Field>

        <div>
          <span className="block text-[12px] font-medium text-dim mb-1.5" id="debt-class-label">Type</span>
          <div className="flex gap-1.5 flex-wrap" role="group" aria-labelledby="debt-class-label">
            {DEBT_CLASSES.map((c) => {
              const active = draft.class === c.id;
              return (
                <button
                  key={c.id}
                  onClick={() => patch({ class: c.id })}
                  className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-full text-[12.5px] font-medium
                              transition-all active:scale-95 border
                              ${active ? '' : 'surface border-hair text-dim hover:text-[color:var(--text)]'}`}
                  style={active ? { background: `${c.color}26`, borderColor: `${c.color}88`, color: c.color } : undefined}
                >
                  <Icon name={c.icon} className="size-3.5" />
                  {c.label}
                </button>
              );
            })}
          </div>
        </div>

        <div className="grid sm:grid-cols-2 gap-3">
          {!editing && (
            <Field label="Outstanding now" hint="What is still left to pay.">
              <MoneyInput size="md" value={draft.balance} onChange={(v) => patch({ balance: v })} />
            </Field>
          )}
          <Field
            label="Interest rate"
            suffix="% a year"
            hint="Optional. With it, CoinTrack can work out when this clears."
          >
            <NumberInput
              value={draft.rate}
              onChange={(v) => patch({ rate: v })}
              min={0}
              max={200}
              allowEmpty
              placeholder="—"
              className="pr-20"
            />
          </Field>
        </div>

        <Field label="Note" hint="Optional — the rate, when it ends.">
          <Textarea rows={2} value={draft.note} onChange={(e) => patch({ note: e.target.value })} maxLength={120} />
        </Field>

        {error && <p className="text-[12px] text-bad">{error}</p>}
      </div>
    </Sheet>
  );
}

/* ─────────────────────────── Monthly debt update ────────────────────────── */

/**
 * The debt half of the monthly ritual. Rendered inside the holdings update
 * sheet rather than as a second one, because reading four statements is one
 * task, not two.
 */
export function DebtUpdateRows({ debts, draft, setDraft }) {
  if (!debts.length) return null;

  return (
    <>
      <div className="text-[11px] uppercase tracking-wider text-faint pt-2">What you owe</div>
      <div className="hidden sm:grid grid-cols-[1fr_8rem_8rem] gap-3 text-[11px] uppercase tracking-wider text-faint px-1">
        <span>Debt</span>
        <span className="text-right">Paid</span>
        <span className="text-right">Left</span>
      </div>

      <div className="space-y-2.5">
        {debts.map((d) => {
          const row = draft[d.id] || {};
          const meta = debtClassById(d.class);
          return (
            <div key={d.id} className="grid sm:grid-cols-[1fr_8rem_8rem] gap-2 sm:gap-3 items-center">
              <div className="flex items-center gap-2.5 min-w-0">
                <CategoryDot size="sm" color={meta.color} icon={meta.icon} />
                <div className="min-w-0">
                  <div className="text-[13px] font-medium truncate">{d.name}</div>
                  <div className="text-[11px] text-faint truncate">
                    {d.lastMonth ? `last ${monthLabel(d.lastMonth)}` : 'no balance yet'}
                  </div>
                </div>
              </div>
              <MoneyInput
                value={row.paid}
                onChange={(v) => setDraft((s) => ({ ...s, [d.id]: { ...s[d.id], paid: v } }))}
              />
              <MoneyInput
                value={row.balance}
                onChange={(v) => setDraft((s) => ({ ...s, [d.id]: { ...s[d.id], balance: v } }))}
              />
            </div>
          );
        })}
      </div>
    </>
  );
}

