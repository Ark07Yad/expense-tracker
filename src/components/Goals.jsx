/**
 * Savings goals.
 *
 * The bar shows where you are; the line under it is the one that decides
 * anything — what you would have to set aside each month from here to land on
 * the date, against what you have actually been putting aside lately. A goal
 * that is quietly unreachable should say so while there is still time to change
 * either the amount or the date.
 */

import { useState } from 'react';
import { useStore } from '../lib/store';
import { goalsSummary, goalsWithProgress } from '../lib/goals';
import { addDays, dayLabel, formatMoney, formatPercent, todayKey } from '../lib/calc';
import {
  Badge, Bar, Button, Card, ConfirmButton, Empty, Field, Icon, Input,
  Money, MoneyInput, SectionTitle, Sheet, Textarea, stagger,
} from './ui';

export default function Goals({ toast }) {
  const { state } = useStore();
  const cur = state.profile.currency;
  const rows = goalsWithProgress(state, todayKey());
  const summary = goalsSummary(rows);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(null);

  const openNew = () => {
    setEditing(null);
    setOpen(true);
  };

  return (
    <Card className="p-5">
      <SectionTitle
        icon="target"
        sub={
          rows.length
            ? `${formatMoney(summary.saved, cur, { compact: true })} of ${formatMoney(summary.target, cur, { compact: true })} across ${summary.count} ${summary.count === 1 ? 'goal' : 'goals'}`
            : 'A target, a date, and what it takes to get there'
        }
        action={
          <Button size="sm" variant="ghost" onClick={openNew}>
            <Icon name="plus" className="size-3.5" />
            New goal
          </Button>
        }
      >
        Savings goals
      </SectionTitle>

      {rows.length === 0 ? (
        <Empty
          icon="target"
          title="No goals yet"
          body="An emergency fund, a trip, a deposit. Tag savings entries to a goal and this works out whether the date is realistic."
          action={<Button variant="primary" size="sm" onClick={openNew}>Set a goal</Button>}
        />
      ) : (
        <div className="space-y-3.5">
          {rows.map((g, i) => (
            <button
              key={g.id}
              onClick={() => { setEditing(g); setOpen(true); }}
              className="w-full text-left rounded-2xl p-3 -m-0.5 transition-all animate-rise
                         hover:[background:var(--surface-hover)]"
              style={stagger(i)}
            >
              <div className="flex items-center gap-2.5 mb-2">
                <span className="text-[13.5px] font-medium truncate flex-1">{g.name}</span>
                {g.complete && <Badge tone="good">Reached</Badge>}
                {!g.complete && g.overdue && <Badge tone="bad">Past its date</Badge>}
                {!g.complete && !g.overdue && g.onTrack === true && <Badge tone="good">On track</Badge>}
                {!g.complete && !g.overdue && g.onTrack === false && <Badge tone="warn">Behind</Badge>}
                <span className="text-[13px] font-semibold tabular shrink-0">
                  <Money value={g.saved} compact />
                  <span className="text-faint font-normal"> / {formatMoney(g.target, cur, { compact: true })}</span>
                </span>
              </div>

              <Bar
                value={g.saved}
                target={g.target || 1}
                color={g.complete ? 'var(--tone-good)' : g.onTrack === false ? 'var(--tone-warn)' : 'var(--tone-save)'}
                overTone="good"
                compact
              />

              <div className="text-[11.5px] text-faint mt-1.5 leading-relaxed">
                {g.complete ? (
                  <>Reached{g.deadline ? ` — the date was ${dayLabel(g.deadline)}` : ''}.</>
                ) : g.requiredPerMonth ? (
                  <>
                    {formatPercent(g.pct)} there ·{' '}
                    <span className="text-[color:var(--text-dim)]">
                      {formatMoney(g.requiredPerMonth, cur)} a month
                    </span>{' '}
                    to land on {dayLabel(g.deadline)}
                    {g.perMonthRecent > 0 && (
                      <> · lately {formatMoney(g.perMonthRecent, cur)}</>
                    )}
                  </>
                ) : g.deadline ? (
                  <>
                    {formatMoney(g.remaining, cur)} still to go, due {dayLabel(g.deadline)}
                  </>
                ) : (
                  <>
                    {formatPercent(g.pct)} there · {formatMoney(g.remaining, cur)} to go
                    {g.perMonthRecent > 0 && g.monthsAtCurrentRate
                      ? ` · about ${Math.ceil(g.monthsAtCurrentRate)} months at your recent pace`
                      : ' · no date set'}
                  </>
                )}
              </div>
            </button>
          ))}
        </div>
      )}

      <GoalSheet
        open={open}
        editing={editing}
        onClose={() => { setOpen(false); setEditing(null); }}
        onSaved={toast}
      />
    </Card>
  );
}

/* ────────────────────────────── Create / edit ────────────────────────────── */

const blankGoal = () => ({ name: '', target: null, opening: null, deadline: '', note: '' });

function GoalSheet({ open, editing, onClose, onSaved }) {
  const { state, dispatch } = useStore();
  const cur = state.profile.currency;
  const [draft, setDraft] = useState(blankGoal);
  const [error, setError] = useState('');

  // Seed on the open transition, so a cancelled edit does not come back.
  const [wasOpen, setWasOpen] = useState(false);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setDraft(
        editing
          ? {
              name: editing.name,
              target: editing.target,
              opening: editing.opening || null,
              deadline: editing.deadline || '',
              note: editing.note || '',
            }
          : blankGoal()
      );
      setError('');
    }
  }

  const patch = (p) => setDraft((d) => ({ ...d, ...p }));

  const save = () => {
    if (!draft.name.trim()) {
      setError('Give the goal a name.');
      return;
    }
    if (!(Number(draft.target) > 0)) {
      setError('Set a target above zero.');
      return;
    }
    const payload = { ...draft, deadline: draft.deadline || null };
    if (editing) {
      dispatch({ type: 'updateGoal', id: editing.id, patch: payload });
      onSaved?.(`Updated ${draft.name.trim()}`);
    } else {
      dispatch({ type: 'addGoal', goal: payload });
      onSaved?.(`Goal set — ${draft.name.trim()}`);
    }
    onClose();
  };

  const target = Number(draft.target) || 0;
  const opening = Number(draft.opening) || 0;
  const remaining = Math.max(0, target - opening);

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={editing ? 'Edit goal' : 'New savings goal'}
      subtitle={editing ? `${editing.contributionCount} contributions tagged so far` : 'Tag savings entries to it as you go'}
      size="sm"
      footer={
        <div className="flex items-center gap-2">
          {editing && (
            <ConfirmButton
              label="Delete"
              onConfirm={() => {
                dispatch({ type: 'deleteGoal', id: editing.id });
                onSaved?.(`Deleted ${editing.name} — its contributions were kept`);
                onClose();
              }}
            />
          )}
          <Button variant="subtle" onClick={onClose} className="ml-auto">Cancel</Button>
          <Button variant="primary" onClick={save}>
            <Icon name="check" className="size-4" />
            {editing ? 'Save' : 'Set goal'}
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        <Field label="What is it for?">
          <Input
            value={draft.name}
            onChange={(e) => patch({ name: e.target.value })}
            placeholder="Emergency fund, deposit, a trip"
            maxLength={50}
            autoFocus
          />
        </Field>

        <div className="grid sm:grid-cols-2 gap-3">
          <Field label="Target">
            <MoneyInput size="md" value={draft.target} onChange={(v) => patch({ target: v })} />
          </Field>
          <Field label="Already saved" hint="Money set aside before you started tracking it here.">
            <MoneyInput size="md" value={draft.opening} onChange={(v) => patch({ opening: v })} />
          </Field>
        </div>

        <Field
          label="Target date"
          hint="Optional. With a date, CoinTrack works out what it takes per month."
        >
          <Input
            type="date"
            value={draft.deadline}
            min={addDays(todayKey(), 1)}
            onChange={(e) => patch({ deadline: e.target.value })}
          />
        </Field>

        {target > 0 && (
          <div className="surface rounded-2xl p-3 text-[12px] text-dim leading-relaxed">
            {formatMoney(remaining, cur)} to go
            {draft.deadline
              ? ` by ${dayLabel(draft.deadline)}.`
              : '. Add a date and this becomes a monthly figure.'}
            {' '}Tag a saving entry to this goal and it counts toward the total.
          </div>
        )}

        <Field label="Note" hint="Optional.">
          <Textarea rows={2} value={draft.note} onChange={(e) => patch({ note: e.target.value })} maxLength={140} />
        </Field>

        {error && <p className="text-[12px] text-bad">{error}</p>}
      </div>
    </Sheet>
  );
}
