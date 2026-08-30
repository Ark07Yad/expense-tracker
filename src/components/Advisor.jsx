/**
 * The suggestion box.
 *
 * Pick a part of your finances and get suggestions computed from your own
 * entries. Every card names a figure you can go and verify — that is the whole
 * design constraint, and it is what keeps this from being a horoscope.
 *
 * Cards can be dismissed, and dismissals stick by rule id rather than by a
 * random key, so something you have decided you are fine with does not come
 * back next month wearing a new hat. Your own notes live alongside them,
 * because half of managing a category is remembering why you decided what you
 * decided.
 */

import { useMemo, useState } from 'react';
import { useStore } from '../lib/store';
import { SECTIONS, liveSuggestions } from '../lib/insights';
import { useFinance } from '../lib/useFinance';
import { categoryById } from '../lib/data';
import { formatPercent } from '../lib/calc';
import {
  Badge, Button, Card, Empty, Icon, IconButton, Money,
  SectionTitle, Textarea, stagger,
} from './ui';

const TONE_LABEL = {
  bad: 'Needs attention',
  warn: 'Heads up',
  info: 'Worth knowing',
  good: 'Going well',
};

export default function Advisor({ section, setSection, onNavigate, toast }) {
  const { state, dispatch } = useStore();
  const f = useFinance('month', 0);
  const [note, setNote] = useState('');

  const { shown, hidden } = useMemo(() => liveSuggestions(state, section), [state, section]);

  // Category chips are driven by what the user actually spends on, biggest
  // first — a fixed list of fourteen categories would bury the three that
  // matter.
  const catSections = useMemo(
    () => f.expenseCats.slice(0, 8).map((c) => ({ id: c.id, label: c.label, icon: c.icon, color: c.color, total: c.total })),
    [f.expenseCats]
  );

  const isCat = !SECTIONS.some((s) => s.id === section);
  const meta = isCat ? categoryById(section) : SECTIONS.find((s) => s.id === section);
  const notes = state.notes.filter((n) => n.section === section);

  const addNote = () => {
    const text = note.trim();
    if (!text) return;
    dispatch({ type: 'addNote', section, text });
    setNote('');
    toast?.('Note saved');
  };

  return (
    <div className="space-y-5">
      {/* ── Section picker ── */}
      <Card className="p-5">
        <SectionTitle icon="compass" sub="Pick a part of your finances to look at">
          Suggestion box
        </SectionTitle>

        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-2">
          {SECTIONS.map((s) => {
            const active = section === s.id;
            return (
              <button
                key={s.id}
                onClick={() => setSection(s.id)}
                className={`flex items-start gap-3 p-3 rounded-2xl text-left border transition-all active:scale-[0.99]
                  ${active
                    ? 'bg-brand-500/14 border-brand-400/40'
                    : 'surface border-hair hover:[background:var(--surface-hover)]'}`}
              >
                <span className={`size-8 rounded-xl grid place-items-center shrink-0 ${active ? 'text-brandy' : 'text-faint'}`}
                      style={{ background: active ? 'color-mix(in srgb, var(--tone-brand) 16%, transparent)' : 'var(--surface)' }}>
                  <Icon name={s.icon} className="size-4" />
                </span>
                <span className="min-w-0">
                  <span className={`block text-[13.5px] font-medium ${active ? 'text-brandy' : ''}`}>{s.label}</span>
                  <span className="block text-[11.5px] text-faint leading-snug mt-0.5">{s.blurb}</span>
                </span>
              </button>
            );
          })}
        </div>

        {catSections.length > 0 && (
          <>
            <div className="text-[11px] uppercase tracking-wider text-faint mt-5 mb-2">
              Or a single category
            </div>
            <div className="flex gap-1.5 flex-wrap">
              {catSections.map((c) => {
                const active = section === c.id;
                return (
                  <button
                    key={c.id}
                    onClick={() => setSection(c.id)}
                    className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-full text-[12.5px] font-medium
                                transition-all active:scale-95 border
                                ${active ? '' : 'surface border-hair text-dim hover:text-[color:var(--text)]'}`}
                    style={active ? { background: `${c.color}26`, borderColor: `${c.color}88`, color: c.color } : undefined}
                  >
                    <Icon name={c.icon} className="size-3.5" />
                    {c.label}
                    <span className="text-faint tabular">
                      <Money value={c.total} compact />
                    </span>
                  </button>
                );
              })}
            </div>
          </>
        )}
      </Card>

      {/* ── Suggestions ── */}
      <div>
        <SectionTitle
          icon={meta?.icon || 'compass'}
          sub={`Computed from ${f.totals.count} ${f.totals.count === 1 ? 'entry' : 'entries'} this month${
            f.totals.earning > 0 ? ` and ${formatPercent(f.totals.savingsRate)} kept` : ''
          }`}
          action={
            hidden > 0 && (
              <Button size="sm" variant="subtle" onClick={() => dispatch({ type: 'restoreDismissed' })}>
                <Icon name="undo" className="size-3.5" />
                Restore {hidden} dismissed
              </Button>
            )
          }
        >
          {meta?.label || 'Suggestions'}
        </SectionTitle>

        {shown.length === 0 ? (
          <Card className="p-5">
            <Empty
              icon="check"
              title="Nothing to flag here"
              body={
                hidden > 0
                  ? `Everything for this section has been dismissed. Restore them above if you want another look.`
                  : 'No rule fired for this section — either it is in good shape or there is not enough logged yet to say.'
              }
            />
          </Card>
        ) : (
          <div className="grid md:grid-cols-2 gap-3">
            {shown.map((s, i) => (
              <Card key={s.id} className="p-4 animate-rise" style={stagger(i)}>
                <div className="flex items-start gap-3">
                  <span
                    className="size-9 rounded-xl grid place-items-center shrink-0"
                    style={{
                      background: `color-mix(in srgb, var(--tone-${s.tone}) 15%, transparent)`,
                      color: `var(--tone-${s.tone})`,
                    }}
                  >
                    <Icon name={s.icon} className="size-[17px]" />
                  </span>

                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <Badge tone={s.tone === 'bad' ? 'bad' : s.tone === 'warn' ? 'warn' : s.tone === 'good' ? 'good' : 'info'}>
                        {TONE_LABEL[s.tone]}
                      </Badge>
                    </div>
                    <h3 className="text-[14px] font-semibold leading-snug">{s.title}</h3>
                    <p className="text-[12.5px] text-dim mt-1.5 leading-relaxed">{s.body}</p>

                    {s.action && (
                      <Button size="sm" variant="ghost" className="mt-3" onClick={() => onNavigate(s.action.to)}>
                        {s.action.label}
                        <Icon name="chevR" className="size-3.5" />
                      </Button>
                    )}
                  </div>

                  <IconButton
                    name="x"
                    label="Dismiss"
                    className="size-7 shrink-0 -mt-1 -mr-1"
                    onClick={() => dispatch({ type: 'dismiss', id: s.id })}
                  />
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* ── Your own notes ── */}
      <Card className="p-5">
        <SectionTitle icon="edit" sub={`Kept against ${meta?.label?.toLowerCase() || 'this section'}`}>
          Your notes
        </SectionTitle>

        <div className="flex flex-col sm:flex-row gap-2.5">
          <Textarea
            rows={2}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder={
              isCat
                ? `What you have decided about ${meta.label.toLowerCase()} — a rule, a cap, a reason.`
                : 'A decision, a plan, or something to check next month.'
            }
            maxLength={280}
            className="flex-1"
            onKeyDown={(e) => {
              if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') addNote();
            }}
          />
          <Button variant="primary" onClick={addNote} disabled={!note.trim()} className="sm:self-start">
            <Icon name="plus" className="size-4" />
            Add note
          </Button>
        </div>

        {notes.length > 0 && (
          <div className="mt-4 space-y-2">
            {notes.map((n, i) => (
              <div
                key={n.id}
                className="group flex items-start gap-3 surface rounded-2xl p-3 animate-rise"
                style={stagger(i)}
              >
                <span className="size-1.5 rounded-full bg-brand-400 mt-2 shrink-0" />
                <p className="text-[13px] leading-relaxed flex-1 min-w-0 whitespace-pre-wrap">{n.text}</p>
                <div className="flex items-center gap-2 shrink-0">
                  <span className="text-[11px] text-faint whitespace-nowrap">
                    {new Date(n.at).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}
                  </span>
                  <IconButton
                    name="trash"
                    label="Delete note"
                    className="size-7 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity"
                    onClick={() => dispatch({ type: 'deleteNote', id: n.id })}
                  />
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      <p className="text-[11.5px] text-faint leading-relaxed px-1 pb-2">
        Every suggestion here is a rule applied to the entries you have logged — there is no model and nothing
        leaves your browser. The investments section describes the holdings you recorded; it does not value them
        for you and it is not financial advice.
      </p>
    </div>
  );
}
