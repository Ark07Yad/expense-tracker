/**
 * The daily log.
 *
 * Two halves that answer different questions. The top is a single day — the one
 * you are logging right now — with a strip of recent days to move between and a
 * running total for each. The bottom is the searchable archive, because "how
 * much have I spent on cabs since April" is a different question from "what did
 * I spend today" and a single list serves neither well.
 */

import { useMemo, useRef, useState } from 'react';
import { useStore } from '../lib/store';
import { animateOut, stagger, useFlipList } from '../lib/motion';
import { KINDS, categoriesFor, categoryById, kindById } from '../lib/data';
import { addDays, dayLabel, formatMoney, parseKey, todayKey } from '../lib/calc';
import { totalsOf } from '../lib/useFinance';
import EntrySheet from './EntrySheet';
import { DueQueue, ScheduledList } from './Scheduled';
import {
  Badge, Button, Card, CategoryDot, Empty, Icon, IconButton, Input, Money,
  SectionTitle, Segmented, Select,
} from './ui';

const KIND_TEXT = { earn: 'text-earn', spend: 'text-spend', save: 'text-save' };

export default function Ledger({ date, setDate, toast }) {
  const { state, dispatch } = useStore();
  const [editing, setEditing] = useState(null);
  const [composerOpen, setComposerOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [kindFilter, setKindFilter] = useState('all');
  const [catFilter, setCatFilter] = useState('all');
  const [limit, setLimit] = useState(30);
  const cur = state.profile.currency;
  const today = todayKey();

  /* ── The selected day ── */

  const dayEntries = useMemo(
    () =>
      state.entries
        .filter((e) => e.date === date)
        .sort((a, b) => b.createdAt - a.createdAt),
    [state.entries, date]
  );
  const dayTotals = totalsOf(dayEntries);

  /** Fourteen days of context, so the strip shows a rhythm rather than a date. */
  const strip = useMemo(() => {
    const spend = new Map();
    for (const e of state.entries) {
      if (e.kind !== 'expense') continue;
      spend.set(e.date, (spend.get(e.date) || 0) + e.amount);
    }

    const days = Array.from({ length: 14 }, (_, i) => {
      const key = addDays(today, i - 13);
      return { key, value: spend.get(key) || 0, d: parseKey(key) };
    });

    /**
     * Square-root heights, not linear ones.
     *
     * Rent day is an order of magnitude above every other day. Scaled linearly
     * it flattens the other thirteen bars into invisible slivers; clamped to a
     * percentile instead, half the window clips flat at the top. A sqrt scale
     * compresses the tall end and lifts the short one, so a ₹500 coffee day is
     * still legible next to a ₹25,000 rent day and the ordering is preserved.
     */
    const peak = Math.max(1, ...days.map((x) => x.value));
    return days.map((x) => ({ ...x, height: Math.sqrt(x.value / peak) }));
  }, [state.entries, today]);

  /* ── The archive ── */

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return state.entries
      .filter((e) => {
        if (kindFilter !== 'all' && e.kind !== kindFilter) return false;
        if (catFilter !== 'all' && e.category !== catFilter) return false;
        if (!q) return true;
        return (
          e.title.toLowerCase().includes(q) ||
          e.note.toLowerCase().includes(q) ||
          categoryById(e.category).label.toLowerCase().includes(q)
        );
      })
      .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : b.createdAt - a.createdAt));
  }, [state.entries, query, kindFilter, catFilter]);

  const grouped = useMemo(() => {
    const out = [];
    let current = null;
    for (const e of filtered.slice(0, limit)) {
      if (!current || current.date !== e.date) {
        current = { date: e.date, entries: [] };
        out.push(current);
      }
      current.entries.push(e);
    }
    return out;
  }, [filtered, limit]);

  const filterTotals = totalsOf(filtered);
  const catOptions = kindFilter === 'all' ? Object.values(categoriesFor('expense')) : categoriesFor(kindFilter);

  const openEdit = (entry) => {
    setEditing(entry);
    setComposerOpen(true);
  };

  return (
    <div className="space-y-5">
      {/* Due first: it is the one thing on this screen that is waiting on you. */}
      <DueQueue toast={toast} />

      {/* ── Day picker ── */}
      <Card className="p-5">
        <div className="flex items-center justify-between gap-3 mb-4">
          <div className="min-w-0">
            <h1 className="text-[20px] font-semibold display truncate">{dayLabel(date)}</h1>
            <p className="text-[12.5px] text-faint mt-0.5">
              {parseKey(date).toLocaleDateString(undefined, {
                weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
              })}
            </p>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <IconButton name="chevL" label="Previous day" onClick={() => setDate(addDays(date, -1))} />
            <button
              onClick={() => setDate(today)}
              disabled={date === today}
              className="px-3 py-1.5 rounded-xl text-[12.5px] font-medium text-dim transition-all
                         hover:[background:var(--surface-hover)] disabled:opacity-30"
            >
              Today
            </button>
            <IconButton
              name="chevR"
              label="Next day"
              onClick={() => setDate(addDays(date, 1))}
              disabled={date >= today}
            />
          </div>
        </div>

        {/* Fourteen-day strip. The bars are spending, so the shape of a week is
            visible without reading a single number. */}
        <div className="flex items-end gap-1 sm:gap-1.5 mb-4">
          {strip.map((s) => {
            const active = s.key === date;
            return (
              <button
                key={s.key}
                onClick={() => setDate(s.key)}
                title={`${dayLabel(s.key)} · ${formatMoney(s.value, cur)}`}
                className={`flex-1 flex flex-col items-center gap-1.5 pt-1 pb-1.5 rounded-xl transition-all
                            ${active ? 'bg-brand-500/14' : 'hover:[background:var(--surface-hover)]'}`}
              >
                <span className="w-full h-10 flex items-end justify-center px-0.5">
                  <span
                    className="w-full rounded-sm transition-all"
                    style={{
                      height: `${Math.max(4, s.height * 100)}%`,
                      background: active ? 'var(--metal)' : 'var(--border-strong)',
                      opacity: s.value ? 1 : 0.35,
                    }}
                  />
                </span>
                <span className={`text-[9.5px] leading-none ${active ? 'text-brandy font-semibold' : 'text-faint'}`}>
                  {s.d.toLocaleDateString(undefined, { weekday: 'narrow' })}
                </span>
                <span className={`text-[10.5px] leading-none tabular ${active ? 'font-semibold' : 'text-faint'}`}>
                  {s.d.getDate()}
                </span>
              </button>
            );
          })}
        </div>

        <div className="grid grid-cols-3 gap-2.5">
          {KINDS.map((k) => (
            <div key={k.id} className="surface rounded-2xl p-3">
              <div className="flex items-center gap-1.5 text-[10.5px] uppercase tracking-wider text-faint mb-1">
                <Icon name={k.icon} className="size-3" />
                {k.label}
              </div>
              <div className={`text-[17px] font-semibold display ${KIND_TEXT[k.tone]}`}>
                <Money value={dayTotals[k.id]} compact />
              </div>
            </div>
          ))}
        </div>
      </Card>

      {/* ── Entries for the day ── */}
      <Card className="p-5">
        <SectionTitle
          icon="ledger"
          action={
            <Button
              size="sm"
              variant="primary"
              onClick={() => {
                setEditing(null);
                setComposerOpen(true);
              }}
            >
              <Icon name="plus" className="size-3.5" />
              Add
            </Button>
          }
        >
          {dayEntries.length} {dayEntries.length === 1 ? 'entry' : 'entries'}
        </SectionTitle>

        {dayEntries.length === 0 ? (
          <Empty
            icon="ledger"
            title={date === today ? 'Nothing logged today' : `Nothing logged on ${dayLabel(date)}`}
            body="Title, amount and a category is all it takes. The description is there for the ones you will not remember."
            action={
              <Button variant="primary" size="sm" onClick={() => { setEditing(null); setComposerOpen(true); }}>
                Log an entry
              </Button>
            }
          />
        ) : (
          <EntryList entries={dayEntries} onEdit={openEdit} dispatch={dispatch} toast={toast} />
        )}
      </Card>

      {/* ── Archive ── */}
      <Card className="p-5">
        <SectionTitle icon="search" sub="Everything you have logged, searchable">
          All entries
        </SectionTitle>

        <div className="flex flex-col sm:flex-row gap-2.5 mb-4">
          <div className="relative flex-1">
            <Icon name="search" className="size-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-faint pointer-events-none" />
            <Input
              value={query}
              onChange={(e) => { setQuery(e.target.value); setLimit(30); }}
              placeholder="Search titles, notes and categories"
              className="pl-10"
            />
          </div>
          <Segmented
            size="sm"
            value={kindFilter}
            onChange={(v) => { setKindFilter(v); setCatFilter('all'); setLimit(30); }}
            options={[
              { value: 'all', label: 'All' },
              ...KINDS.map((k) => ({ value: k.id, label: k.label })),
            ]}
          />
          <div className="sm:w-48">
            <Select value={catFilter} onChange={(e) => { setCatFilter(e.target.value); setLimit(30); }}>
              <option value="all">Every category</option>
              {catOptions.map((c) => (
                <option key={c.id} value={c.id}>{c.label}</option>
              ))}
            </Select>
          </div>
        </div>

        {(query || kindFilter !== 'all' || catFilter !== 'all') && (
          <div className="flex flex-wrap items-center gap-2 text-[12px] mb-3 pb-3 border-b border-hair">
            <span className="text-faint">
              {filtered.length} {filtered.length === 1 ? 'match' : 'matches'}
            </span>
            {filterTotals.expense > 0 && (
              <Badge tone="spend">
                <Money value={filterTotals.expense} compact /> spent
              </Badge>
            )}
            {filterTotals.earning > 0 && (
              <Badge tone="earn">
                <Money value={filterTotals.earning} compact /> earned
              </Badge>
            )}
            {filterTotals.saving > 0 && (
              <Badge tone="save">
                <Money value={filterTotals.saving} compact /> saved
              </Badge>
            )}
            <button
              onClick={() => { setQuery(''); setKindFilter('all'); setCatFilter('all'); }}
              className="ml-auto text-dim hover:text-[color:var(--text)] transition-colors"
            >
              Clear
            </button>
          </div>
        )}

        {grouped.length === 0 ? (
          <Empty
            icon="search"
            title="Nothing matches"
            body={query ? `No entry mentions "${query}".` : 'Try a different filter.'}
          />
        ) : (
          <div className="space-y-4">
            {grouped.map((g) => (
              <div key={g.date}>
                {/* The jump-to-day control lives on the date header, not on
                    every row — repeating it under each amount put a link on
                    every line of the archive for one action per group. */}
                <button
                  onClick={() => {
                    setDate(g.date);
                    window.scrollTo({ top: 0, behavior: 'smooth' });
                  }}
                  className="w-full flex items-baseline justify-between gap-3 mb-1.5 group/day rounded-lg
                             px-1 -mx-1 py-0.5 transition-colors hover:[background:var(--surface-hover)]"
                  title={`Open ${dayLabel(g.date)}`}
                >
                  <span className="text-[12px] font-semibold uppercase tracking-wider text-faint
                                   group-hover/day:text-[color:var(--text)] transition-colors">
                    {dayLabel(g.date)}
                  </span>
                  <span className="text-[11.5px] text-faint tabular">
                    {formatMoney(totalsOf(g.entries).expense, cur)} out
                  </span>
                </button>
                <EntryList entries={g.entries} onEdit={openEdit} dispatch={dispatch} toast={toast} />
              </div>
            ))}

            {filtered.length > limit && (
              <Button variant="ghost" className="w-full" onClick={() => setLimit((l) => l + 50)}>
                Show {Math.min(50, filtered.length - limit)} more
                <Icon name="chevD" className="size-4" />
              </Button>
            )}
          </div>
        )}
      </Card>

      <ScheduledList toast={toast} />

      <EntrySheet
        open={composerOpen}
        onClose={() => { setComposerOpen(false); setEditing(null); }}
        editing={editing}
        defaultDate={date}
        onSaved={toast}
      />
    </div>
  );
}

/* ─────────────────────────────── Entry rows ─────────────────────────────── */

function EntryList({ entries, onEdit, dispatch, toast }) {
  const ref = useFlipList([entries.map((e) => e.id).join(',')]);

  return (
    <div ref={ref} className="divide-y divide-[color:var(--border)]">
      {entries.map((e, i) => (
        <EntryRow key={e.id} entry={e} index={i} onEdit={onEdit} dispatch={dispatch} toast={toast} />
      ))}
    </div>
  );
}

function EntryRow({ entry, index, onEdit, dispatch, toast }) {
  const node = useRef(null);
  const [armed, setArmed] = useState(false);
  const cat = categoryById(entry.category);
  const kind = kindById(entry.kind);

  // Deletion is inverted: play the collapse first, dispatch when it finishes,
  // because React cannot animate a node it has already unmounted.
  const remove = () => {
    animateOut(node.current, () => {
      dispatch({ type: 'deleteEntry', id: entry.id });
      toast?.(`Deleted "${entry.title}"`);
    });
  };

  return (
    <div
      ref={node}
      data-flip-key={entry.id}
      className="group flex items-center gap-3 py-2.5 animate-rise"
      style={stagger(index)}
    >
      <CategoryDot color={cat.color} icon={cat.icon} />

      <button
        onClick={() => onEdit(entry)}
        className="min-w-0 flex-1 text-left"
        title="Edit this entry"
      >
        <div className="text-[13.5px] font-medium truncate">{entry.title}</div>
        <div className="text-[11.5px] text-faint truncate">
          {cat.label}
          {entry.note ? ` · ${entry.note}` : ''}
        </div>
      </button>

      <div className="text-right shrink-0">
        <div className={`text-[13.5px] font-semibold tabular ${KIND_TEXT[kind.tone]}`}>
          {kind.sign > 0 ? '+' : '−'}
          <Money value={entry.amount} />
        </div>
      </div>

      <div className="flex items-center shrink-0 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
        <IconButton name="edit" label="Edit" className="size-8" onClick={() => onEdit(entry)} />
        {armed ? (
          <IconButton
            name="check"
            label="Confirm delete"
            className="size-8 text-bad"
            onClick={remove}
            onBlur={() => setArmed(false)}
          />
        ) : (
          <IconButton name="trash" label="Delete" className="size-8" onClick={() => setArmed(true)} />
        )}
      </div>
    </div>
  );
}
