/**
 * Recurring entries: the review queue and the rule list.
 *
 * The queue is the important half. It shows exactly what a rule wants to add,
 * and every row is a decision — post it, or skip it. Nothing is written until
 * the user says so, and skipping advances the rule just as posting does, so a
 * cancelled subscription stops asking.
 */

import { useMemo, useState } from 'react';
import { useStore } from '../lib/store';
import { KINDS, categoriesFor, categoryById, kindById } from '../lib/data';
import { dayLabel, formatMoney, todayKey } from '../lib/calc';
import {
  FREQUENCIES, describeRule, dueList, dueTotals, nextOccurrence,
} from '../lib/recurring';
import {
  Badge, Button, Card, CategoryDot, ConfirmButton, Empty, Field, Icon, IconButton,
  Input, Money, MoneyInput, SectionTitle, Segmented, Sheet, Textarea, mix, stagger, toneColor,
} from './ui';

const KIND_TEXT = { earn: 'text-earn', spend: 'text-spend', save: 'text-save' };

/* ─────────────────────────────── Review queue ─────────────────────────────── */

/**
 * What is due, one row per occurrence.
 *
 * Rows default to "post", because the common case is that the rent did in fact
 * go out — but each can be flipped to "skip", and nothing is committed until
 * the button at the bottom is pressed.
 */
export function DueQueue({ toast, onNavigate }) {
  const { state, dispatch } = useStore();
  const cur = state.profile.currency;
  const items = useMemo(() => dueList(state, todayKey()), [state]);
  const [skipped, setSkipped] = useState(() => new Set());

  if (!items.length) return null;

  const totals = dueTotals(items.filter((i) => !skipped.has(i.key)));
  const toggle = (key) =>
    setSkipped((s) => {
      const next = new Set(s);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  const confirm = () => {
    const posted = items.filter((i) => !skipped.has(i.key)).length;
    dispatch({
      type: 'resolveDue',
      items: items.map((i) => ({ ruleId: i.rule.id, date: i.date, post: !skipped.has(i.key) })),
    });
    setSkipped(new Set());
    toast?.(
      posted === items.length
        ? `${posted} scheduled ${posted === 1 ? 'entry' : 'entries'} added`
        : `${posted} added, ${items.length - posted} skipped`
    );
  };

  return (
    <Card
      className="p-5"
      style={{ background: `color-mix(in srgb, var(--tone-brand) 7%, var(--surface))` }}
    >
      <SectionTitle
        icon="repeat"
        sub="Nothing is added until you confirm. Tap a row to skip it instead."
        action={
          onNavigate && (
            <Button size="sm" variant="subtle" onClick={() => onNavigate('ledger')}>
              Review
              <Icon name="chevR" className="size-3.5" />
            </Button>
          )
        }
      >
        {items.length} scheduled {items.length === 1 ? 'entry' : 'entries'} due
      </SectionTitle>

      <div className="space-y-1.5">
        {items.map((item, i) => {
          const cat = categoryById(item.rule.category);
          const kind = kindById(item.rule.kind);
          const isSkipped = skipped.has(item.key);
          return (
            <button
              key={item.key}
              onClick={() => toggle(item.key)}
              className={`w-full flex items-center gap-3 p-2.5 rounded-2xl text-left transition-all
                          active:scale-[0.99] surface animate-rise
                          ${isSkipped ? 'opacity-45' : 'hover:[background:var(--surface-hover)]'}`}
              style={stagger(i)}
              title={isSkipped ? 'Tap to add this one' : 'Tap to skip this one'}
            >
              <span
                className="size-5 rounded-md grid place-items-center shrink-0 border"
                style={
                  isSkipped
                    ? { borderColor: 'var(--border-strong)' }
                    : {
                        background: mix(toneColor('brand'), 22),
                        borderColor: mix(toneColor('brand'), 60),
                        color: 'var(--tone-brand)',
                      }
                }
              >
                {!isSkipped && <Icon name="check" className="size-3.5" />}
              </span>

              <CategoryDot size="sm" color={cat.color} icon={cat.icon} />

              <div className="min-w-0 flex-1">
                <div className={`text-[13.5px] font-medium truncate ${isSkipped ? 'line-through' : ''}`}>
                  {item.rule.title}
                </div>
                <div className="text-[11.5px] text-faint truncate">
                  {cat.label} · {dayLabel(item.date)}
                </div>
              </div>

              <div className={`text-[13.5px] font-semibold tabular shrink-0 ${KIND_TEXT[kind.tone]}`}>
                {kind.sign > 0 ? '+' : '−'}
                <Money value={item.rule.amount} />
              </div>
            </button>
          );
        })}
      </div>

      <div className="flex flex-wrap items-center gap-3 mt-4 pt-3 border-t border-hair">
        <div className="text-[12px] text-dim min-w-0">
          {totals.count === 0 ? (
            'Everything skipped'
          ) : (
            <>
              Adding <span className="font-semibold text-[color:var(--text)]">{totals.count}</span>
              {totals.expense > 0 && <> · {formatMoney(totals.expense, cur, { compact: true })} out</>}
              {totals.earning > 0 && <> · {formatMoney(totals.earning, cur, { compact: true })} in</>}
              {totals.saving > 0 && <> · {formatMoney(totals.saving, cur, { compact: true })} saved</>}
            </>
          )}
        </div>
        <Button variant="primary" size="sm" className="ml-auto" onClick={confirm}>
          <Icon name="check" className="size-3.5" />
          {totals.count === items.length
            ? `Add all ${items.length}`
            : totals.count === 0
            ? 'Skip all'
            : `Add ${totals.count}, skip ${items.length - totals.count}`}
        </Button>
      </div>
    </Card>
  );
}

/** A one-line prompt for the dashboard, where the full queue would dominate. */
export function DueBanner({ onNavigate }) {
  const { state } = useStore();
  const items = useMemo(() => dueList(state, todayKey()), [state]);
  if (!items.length) return null;

  return (
    <button
      onClick={() => onNavigate('ledger')}
      className="w-full surface rounded-2xl p-3.5 flex items-center gap-3 text-left transition-all
                 hover:[background:var(--surface-hover)] active:scale-[0.995]"
      style={{ background: 'color-mix(in srgb, var(--tone-brand) 8%, var(--surface))' }}
    >
      <span
        className="size-9 rounded-xl grid place-items-center shrink-0 text-brandy"
        style={{ background: mix(toneColor('brand'), 16) }}
      >
        <Icon name="repeat" className="size-4" />
      </span>
      <div className="min-w-0 flex-1">
        <div className="text-[13.5px] font-medium">
          {items.length} scheduled {items.length === 1 ? 'entry is' : 'entries are'} waiting
        </div>
        <p className="text-[12px] text-dim truncate">
          {items.slice(0, 3).map((i) => i.rule.title).join(', ')}
          {items.length > 3 ? ` and ${items.length - 3} more` : ''}
        </p>
      </div>
      <Icon name="chevR" className="size-4 text-faint shrink-0" />
    </button>
  );
}

/* ──────────────────────────────── Rule list ──────────────────────────────── */

export function ScheduledList({ toast }) {
  const { state, dispatch } = useStore();
  const cur = state.profile.currency;
  const [editing, setEditing] = useState(null);
  const [open, setOpen] = useState(false);
  const rules = state.recurring || [];

  const openNew = () => {
    setEditing(null);
    setOpen(true);
  };

  return (
    <Card className="p-5">
      <SectionTitle
        icon="repeat"
        sub="Templates that offer themselves on a schedule"
        action={
          <Button size="sm" variant="ghost" onClick={openNew}>
            <Icon name="plus" className="size-3.5" />
            New
          </Button>
        }
      >
        Scheduled
      </SectionTitle>

      {rules.length === 0 ? (
        <Empty
          icon="repeat"
          title="Nothing scheduled"
          body="Rent, a phone bill, a monthly transfer to savings — set them up once and confirm them in a tap each month."
          action={<Button variant="primary" size="sm" onClick={openNew}>Add a schedule</Button>}
        />
      ) : (
        <div className="space-y-2">
          {rules.map((rule, i) => {
            const cat = categoryById(rule.category);
            const kind = kindById(rule.kind);
            const next = nextOccurrence(rule, todayKey());
            return (
              <div
                key={rule.id}
                className="group surface rounded-2xl p-3 flex items-center gap-3 animate-rise"
                style={stagger(i)}
              >
                <CategoryDot color={cat.color} icon={cat.icon} className={rule.active ? '' : 'opacity-40'} />
                <button onClick={() => { setEditing(rule); setOpen(true); }} className="min-w-0 flex-1 text-left">
                  <div className={`text-[13.5px] font-medium truncate ${rule.active ? '' : 'text-faint'}`}>
                    {rule.title}
                  </div>
                  <div className="text-[11.5px] text-faint truncate">
                    {describeRule(rule)}
                    {rule.active && next ? ` · next ${dayLabel(next)}` : ''}
                  </div>
                </button>

                {!rule.active && <Badge tone="neutral">Paused</Badge>}

                <div className={`text-[13.5px] font-semibold tabular shrink-0 ${KIND_TEXT[kind.tone]} ${rule.active ? '' : 'opacity-40'}`}>
                  {kind.sign > 0 ? '+' : '−'}
                  {formatMoney(rule.amount, cur)}
                </div>

                <div className="flex items-center shrink-0 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
                  <IconButton
                    name={rule.active ? 'minus' : 'check'}
                    label={rule.active ? 'Pause' : 'Resume'}
                    className="size-8"
                    onClick={() => {
                      dispatch({ type: 'updateRecurring', id: rule.id, patch: { active: !rule.active } });
                      toast?.(rule.active ? `Paused ${rule.title}` : `Resumed ${rule.title}`);
                    }}
                  />
                  <IconButton name="edit" label="Edit" className="size-8" onClick={() => { setEditing(rule); setOpen(true); }} />
                </div>
              </div>
            );
          })}
        </div>
      )}

      <RecurringSheet
        open={open}
        editing={editing}
        onClose={() => { setOpen(false); setEditing(null); }}
        onSaved={toast}
      />
    </Card>
  );
}

/* ───────────────────────────── Create / edit rule ────────────────────────── */

const blankRule = () => ({
  kind: 'expense',
  category: 'housing',
  title: '',
  note: '',
  amount: null,
  frequency: 'monthly',
  anchorDate: todayKey(),
});

export function RecurringSheet({ open, editing, onClose, onSaved }) {
  const { state, dispatch } = useStore();
  const cur = state.profile.currency;
  const [draft, setDraft] = useState(blankRule);
  const [error, setError] = useState('');

  // Seed on the open transition. Same lesson as the investment sheets: a key
  // compared during render never resets on close, so a cancelled edit comes
  // back the next time the same rule is opened.
  const [wasOpen, setWasOpen] = useState(false);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setDraft(editing ? { ...editing } : blankRule());
      setError('');
    }
  }

  const patch = (p) => setDraft((d) => ({ ...d, ...p }));
  const kind = kindById(draft.kind);
  const cats = categoriesFor(draft.kind);

  const setKind = (id) => {
    const next = categoriesFor(id);
    patch({ kind: id, category: next.some((c) => c.id === draft.category) ? draft.category : next[0].id });
  };

  const save = () => {
    if (!(Number(draft.amount) > 0)) {
      setError('Enter an amount above zero.');
      return;
    }
    if (editing) {
      dispatch({ type: 'updateRecurring', id: editing.id, patch: draft });
      onSaved?.(`Updated ${draft.title.trim() || 'schedule'}`);
    } else {
      dispatch({
        type: 'addRecurring',
        // Anchored today with nothing resolved, so the first occurrence is
        // offered straight away rather than a month from now.
        rule: { ...draft, lastResolved: null },
      });
      onSaved?.(`Scheduled ${draft.title.trim() || 'entry'}`);
    }
    onClose();
  };

  const preview = { ...draft, amount: Number(draft.amount) || 0 };

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={editing ? 'Edit schedule' : 'New schedule'}
      subtitle={editing ? describeRule(preview) : 'It will offer itself; you confirm each time'}
      size="sm"
      footer={
        <div className="flex items-center gap-2">
          {editing && (
            <ConfirmButton
              label="Delete"
              onConfirm={() => {
                dispatch({ type: 'deleteRecurring', id: editing.id });
                onSaved?.(`Deleted ${editing.title}`);
                onClose();
              }}
            />
          )}
          <Button variant="subtle" onClick={onClose} className="ml-auto">Cancel</Button>
          <Button variant="primary" onClick={save}>
            <Icon name="check" className="size-4" />
            {editing ? 'Save' : 'Schedule it'}
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
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
          <MoneyInput value={draft.amount} onChange={(v) => patch({ amount: v })} autoFocus />
        </Field>
        {error && <p className="text-[12px] text-bad -mt-2">{error}</p>}

        <Field label="Title">
          <Input
            value={draft.title}
            onChange={(e) => patch({ title: e.target.value })}
            placeholder={categoryById(draft.category).label}
            maxLength={60}
          />
        </Field>

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

        <div className="grid sm:grid-cols-2 gap-3">
          <div>
            <span className="block text-[12px] font-medium text-dim mb-1.5">Repeats</span>
            <Segmented
              size="sm"
              value={draft.frequency}
              onChange={(v) => patch({ frequency: v })}
              options={FREQUENCIES.map((f) => ({ value: f.id, label: f.label }))}
            />
          </div>
          <Field label="Starting" hint="The day of the month or week comes from this date.">
            <Input
              type="date"
              value={draft.anchorDate}
              onChange={(e) => patch({ anchorDate: e.target.value || todayKey() })}
            />
          </Field>
        </div>

        <Field label="Description" hint="Optional.">
          <Textarea
            rows={2}
            value={draft.note}
            onChange={(e) => patch({ note: e.target.value })}
            placeholder="What is it for?"
            maxLength={180}
          />
        </Field>

        <div className="surface rounded-2xl p-3 text-[12px] text-dim leading-relaxed">
          <span className="font-medium text-[color:var(--text)]">{describeRule(preview)}</span>
          {' — '}
          {kind.label.toLowerCase()} of {formatMoney(preview.amount, cur)}.
          Each one waits for you to confirm it; skipping is one tap and it will not ask again for that date.
        </div>
      </div>
    </Sheet>
  );
}
