/**
 * The one place an entry is created or edited.
 *
 * Shared by the floating add button, the ledger's own add button and every
 * row's edit action, so there is exactly one definition of what a valid entry
 * is and one keyboard flow to get right.
 *
 * The ordering is deliberate: amount first, because it is the only field you
 * cannot recall an hour later; then kind, which recolours the whole sheet;
 * then category, title, date, note. Everything after the amount has a sensible
 * default, so the fastest possible entry is a number and one tap.
 */

import { useEffect, useMemo, useState } from 'react';
import { useStore } from '../lib/store';
import { CURRENCIES, KINDS, QUICK_ADD, categoriesFor, categoryById, kindById } from '../lib/data';
import { FREQUENCIES } from '../lib/recurring';
import { goalsWithProgress } from '../lib/goals';
import { dayLabel, formatMoney, todayKey } from '../lib/calc';
import {
  Button, CategoryDot, Field, Icon, Input, MoneyInput, NumberInput, Segmented, Select,
  Sheet, Textarea, mix, toneColor,
} from './ui';

const blank = (date) => ({
  kind: 'expense',
  category: 'dining',
  title: '',
  note: '',
  amount: null,
  date: date || todayKey(),
  goalId: undefined,
  /**
   * Set only when the money was actually spent in another currency:
   * { currency, amount, rate }.
   *
   * `amount` on the entry itself always stays in the home currency, converted
   * once here. Every total, budget, chart and rule therefore needs no knowledge
   * of currencies at all — this block is provenance, not a second unit. Making
   * the ledger genuinely multi-unit would mean converting inside every
   * aggregation, at the cost of a rate lookup the app has no way to perform
   * offline and honestly.
   */
  fx: null,
});

export default function EntrySheet({ open, onClose, editing = null, defaultDate, onSaved }) {
  const { state, dispatch } = useStore();
  const [draft, setDraft] = useState(() => blank(defaultDate));
  const [error, setError] = useState('');
  /** 'none', or a frequency id — creating a schedule alongside this entry. */
  const [repeat, setRepeat] = useState('none');
  const [fxOpen, setFxOpen] = useState(false);

  // Re-seed whenever the sheet opens, so a cancelled edit never leaks into the
  // next entry and the date follows whichever day the ledger is showing.
  useEffect(() => {
    if (!open) return;
    setError('');
    setRepeat('none');
    setDraft(editing ? { ...editing } : blank(defaultDate));
    setFxOpen(!!editing?.fx);
  }, [open, editing, defaultDate]);

  const kind = kindById(draft.kind);
  const cats = categoriesFor(draft.kind);
  const goals = useMemo(() => goalsWithProgress(state, todayKey()).filter((g) => !g.complete), [state]);
  const patch = (p) => setDraft((d) => ({ ...d, ...p }));

  const home = state.profile.currency;
  const fx = draft.fx;

  /** Editing either the foreign amount or the rate recomputes the home amount. */
  const patchFx = (p) => {
    setDraft((d) => {
      const next = { currency: 'USD', amount: null, rate: null, ...d.fx, ...p };
      const converted = Number(next.amount) * Number(next.rate);
      return {
        ...d,
        fx: next,
        amount: Number.isFinite(converted) && converted > 0 ? Math.round(converted * 100) / 100 : d.amount,
      };
    });
  };

  const toggleFx = () => {
    if (fxOpen) {
      setFxOpen(false);
      patch({ fx: null });
    } else {
      setFxOpen(true);
      patchFx({ currency: home === 'USD' ? 'EUR' : 'USD' });
    }
  };

  // Switching kind has to move the category too — "Groceries" is not a valid
  // kind of earning, and leaving it selected would silently file the entry
  // under a category that view never shows.
  const setKind = (id) => {
    const next = categoriesFor(id);
    patch({
      kind: id,
      category: next.some((c) => c.id === draft.category) ? draft.category : next[0].id,
      // Only a saving can belong to a goal. Leaving the tag on after a switch
      // would credit a goal with an expense.
      goalId: id === 'saving' ? draft.goalId : undefined,
    });
  };

  const recent = useMemo(() => {
    const seen = new Map();
    for (const e of state.entries) {
      const key = `${e.kind}:${e.category}:${e.title.toLowerCase()}`;
      if (!seen.has(key)) seen.set(key, e);
      if (seen.size >= 40) break;
    }
    return [...seen.values()];
  }, [state.entries]);

  const suggestions = useMemo(() => {
    const q = draft.title.trim().toLowerCase();
    if (q.length < 2) return [];
    return recent.filter((e) => e.title.toLowerCase().includes(q) && e.title.toLowerCase() !== q).slice(0, 4);
  }, [draft.title, recent]);

  const save = () => {
    const amount = Number(draft.amount) || 0;
    if (amount <= 0) {
      setError('Enter an amount above zero.');
      return;
    }
    if (editing) {
      dispatch({ type: 'updateEntry', id: editing.id, patch: { ...draft, amount } });
      onSaved?.(`Updated "${draft.title.trim() || 'entry'}"`);
    } else {
      dispatch({ type: 'addEntry', entry: { ...draft, amount } });

      if (repeat !== 'none') {
        /*
         * The entry just logged *is* this period's occurrence, so the rule is
         * anchored on it and marked resolved for that date. Without that, the
         * queue would immediately offer the same day back and the user would
         * have logged rent twice on their first attempt at scheduling it.
         */
        dispatch({
          type: 'addRecurring',
          rule: {
            ...draft,
            amount,
            frequency: repeat,
            anchorDate: draft.date,
            lastResolved: draft.date,
          },
        });
      }

      onSaved?.(
        repeat === 'none'
          ? `${kind.label} logged — ${draft.title.trim() || categoryById(draft.category).label}`
          : `${kind.label} logged and scheduled ${repeat}`
      );
    }
    onClose();
  };

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={editing ? 'Edit entry' : 'New entry'}
      subtitle={editing ? dayLabel(draft.date) : kind.blurb}
      footer={
        <div className="flex items-center gap-2">
          <Button variant="subtle" onClick={onClose} className="flex-1 sm:flex-none">Cancel</Button>
          <Button variant="primary" onClick={save} className="flex-1">
            <Icon name="check" className="size-4" />
            {editing ? 'Save changes' : `Log ${kind.label.toLowerCase()}`}
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        {/* Kind — recolours everything below it. */}
        <div className="grid grid-cols-3 gap-2">
          {KINDS.map((k) => {
            const active = draft.kind === k.id;
            return (
              <button
                key={k.id}
                onClick={() => setKind(k.id)}
                className={`rounded-2xl p-3 border text-left transition-all active:scale-[0.98]
                  ${active ? '' : 'surface border-hair hover:[background:var(--surface-hover)]'}`}
                style={
                  active
                    ? {
                        background: mix(toneColor(k.tone), 14),
                        borderColor: mix(toneColor(k.tone), 55),
                        color: toneColor(k.tone),
                      }
                    : undefined
                }
              >
                <Icon name={k.icon} className={`size-[18px] mb-1.5 ${active ? '' : 'text-faint'}`} />
                <div className="text-[13px] font-semibold">{k.label}</div>
              </button>
            );
          })}
        </div>

        <Field label="Amount">
          <MoneyInput
            value={draft.amount}
            onChange={(v) => patch({ amount: v, fx: null })}
            autoFocus
            disabled={fxOpen}
          />
        </Field>
        {error && <p className="text-[12px] text-bad -mt-2">{error}</p>}

        <div>
          <button
            onClick={toggleFx}
            className="inline-flex items-center gap-1.5 text-[12px] text-dim hover:text-[color:var(--text)] transition-colors"
          >
            <Icon name={fxOpen ? 'minus' : 'plus'} className="size-3.5" />
            {fxOpen ? 'Not a foreign payment' : 'Paid in another currency'}
          </button>

          {fxOpen && fx && (
            <div className="surface rounded-2xl p-3 mt-2 space-y-3">
              <div className="grid grid-cols-3 gap-2.5">
                <Field label="Currency">
                  <Select
                    value={fx.currency}
                    onChange={(e) => patchFx({ currency: e.target.value })}
                    className="py-2 text-[13px]"
                  >
                    {CURRENCIES.filter((c) => c.code !== home).map((c) => (
                      <option key={c.code} value={c.code}>{c.code}</option>
                    ))}
                  </Select>
                </Field>
                <Field label="Paid">
                  <NumberInput
                    value={fx.amount}
                    onChange={(v) => patchFx({ amount: v })}
                    min={0}
                    allowEmpty
                    placeholder="0"
                    className="py-2 text-[13px] text-right tabular"
                  />
                </Field>
                <Field label="Rate">
                  <NumberInput
                    value={fx.rate}
                    onChange={(v) => patchFx({ rate: v })}
                    min={0}
                    allowEmpty
                    placeholder="0"
                    className="py-2 text-[13px] text-right tabular"
                  />
                </Field>
              </div>
              <p className="text-[11.5px] text-faint leading-relaxed">
                {Number(draft.amount) > 0 ? (
                  <>
                    Logged as{' '}
                    <span className="font-medium text-[color:var(--text)]">
                      {formatMoney(draft.amount, home)}
                    </span>{' '}
                    at {fx.rate || 0} {home} per {fx.currency}. The rate is stored with the entry, so a
                    later change never rewrites history.
                  </>
                ) : (
                  <>Enter the amount you paid and the rate you got. Your ledger stays in {home}.</>
                )}
              </p>
            </div>
          )}
        </div>

        {!editing && (
          <div className="flex gap-1.5 flex-wrap">
            {QUICK_ADD.map((q, i) => (
              <button
                key={i}
                onClick={() => patch({ kind: q.kind, category: q.category, title: q.title })}
                className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-full text-[12px] surface text-dim
                           hover:text-[color:var(--text)] transition-all active:scale-95 border border-hair"
              >
                <Icon name={categoryById(q.category).icon} className="size-3.5" style={{ color: categoryById(q.category).color }} />
                {q.title}
              </button>
            ))}
          </div>
        )}

        <div>
          <span className="block text-[12px] font-medium text-dim mb-1.5">Category</span>
          <div className="flex gap-1.5 flex-wrap">
            {cats.map((c) => {
              const active = draft.category === c.id;
              return (
                <button
                  key={c.id}
                  onClick={() => patch({ category: c.id })}
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

        {/* Only savings can be tagged, and only when there is something to tag
            to — an empty picker would just be a question with no answers. */}
        {draft.kind === 'saving' && goals.length > 0 && (
          <div>
            <span className="block text-[12px] font-medium text-dim mb-1.5">Toward a goal</span>
            <div className="flex gap-1.5 flex-wrap">
              <button
                onClick={() => patch({ goalId: undefined })}
                className={`px-2.5 py-1.5 rounded-full text-[12.5px] font-medium transition-all active:scale-95 border
                            ${!draft.goalId ? 'bg-brand-500/18 border-brand-400/50 text-brandy' : 'surface border-hair text-dim hover:text-[color:var(--text)]'}`}
              >
                General savings
              </button>
              {goals.map((g) => {
                const active = draft.goalId === g.id;
                return (
                  <button
                    key={g.id}
                    onClick={() => patch({ goalId: g.id })}
                    className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-full text-[12.5px] font-medium
                                transition-all active:scale-95 border
                                ${active ? 'bg-sky-500/18 border-sky-400/50 text-save' : 'surface border-hair text-dim hover:text-[color:var(--text)]'}`}
                  >
                    <Icon name="target" className="size-3.5" />
                    {g.name}
                    <span className="text-faint">{formatMoney(g.remaining, state.profile.currency, { compact: true })} to go</span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        <div className="relative">
          <Field label="Title" hint="A few words you will recognise in three months.">
            <Input
              value={draft.title}
              onChange={(e) => patch({ title: e.target.value })}
              placeholder={categoryById(draft.category).label}
              maxLength={60}
            />
          </Field>
          {suggestions.length > 0 && (
            <div className="absolute z-10 left-0 right-0 mt-1 rounded-2xl overflow-hidden surface"
                 style={{ background: 'var(--bg-elev)' }}>
              {suggestions.map((s) => (
                <button
                  key={s.id}
                  onClick={() => patch({ title: s.title, category: s.category, kind: s.kind })}
                  className="w-full flex items-center gap-2.5 px-3 py-2 text-left text-[13px]
                             hover:[background:var(--surface-hover)] transition-colors"
                >
                  <CategoryDot size="sm" color={categoryById(s.category).color} icon={categoryById(s.category).icon} />
                  <span className="truncate">{s.title}</span>
                  <span className="ml-auto text-[11px] text-faint shrink-0">{categoryById(s.category).label}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="grid sm:grid-cols-2 gap-3">
          <Field label="Date">
            <Input type="date" value={draft.date} max={todayKey()} onChange={(e) => patch({ date: e.target.value || todayKey() })} />
          </Field>
          <Field label="Description" hint="Optional.">
            <Textarea
              rows={2}
              value={draft.note}
              onChange={(e) => patch({ note: e.target.value })}
              placeholder="What was it for?"
              maxLength={180}
            />
          </Field>
        </div>

        {/* Offered only when creating. Turning an existing entry into a
            schedule retroactively raises questions about what it means for the
            entries already logged, and the Scheduled list is the honest place
            to set one up. */}
        {!editing && (
          <div>
            <span className="block text-[12px] font-medium text-dim mb-1.5">Repeats</span>
            <Segmented
              size="sm"
              value={repeat}
              onChange={setRepeat}
              options={[
                { value: 'none', label: 'One-off' },
                ...FREQUENCIES.map((f) => ({ value: f.id, label: f.label })),
              ]}
            />
            {repeat !== 'none' && (
              <p className="text-[11.5px] text-faint mt-1.5 leading-relaxed">
                This one is logged now. The next will be offered on schedule — you confirm or skip each time.
              </p>
            )}
          </div>
        )}
      </div>
    </Sheet>
  );
}
