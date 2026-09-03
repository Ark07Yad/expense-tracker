/**
 * The daily log.
 *
 * Two halves that answer different questions. The top is a single day — the one
 * you are logging right now — with a strip of recent days to move between and a
 * running total for each. The bottom is the searchable archive, because "how
 * much have I spent on cabs since April" is a different question from "what did
 * I spend today" and a single list serves neither well.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { useStore } from '../lib/store';
import { animateOut, stagger, useFlipList } from '../lib/motion';
import { KINDS, categoriesFor, categoryById, kindById } from '../lib/data';
import { addDays, dayLabel, formatMoney, parseKey, todayKey } from '../lib/calc';
import { totalsOf } from '../lib/useFinance';
import EntrySheet from './EntrySheet';
import { DueQueue, ScheduledList } from './Scheduled';
import { formatBytes, openAttachment } from '../lib/attachments';
import {
  Badge, Button, Card, CategoryDot, Empty, Icon, IconButton, Input, Money,
  SectionTitle, Segmented, Select, Sheet,
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
  const [viewing, setViewing] = useState(null);
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
          <EntryList entries={dayEntries} onEdit={openEdit} dispatch={dispatch} toast={toast} onView={setViewing} />
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
                    {daySummary(totalsOf(g.entries), cur)}
                  </span>
                </button>
                <EntryList entries={g.entries} onEdit={openEdit} dispatch={dispatch} toast={toast} onView={setViewing} />
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

      <AttachmentViewer entry={viewing} onClose={() => setViewing(null)} />

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

/**
 * One line describing a day.
 *
 * Reporting only expenses meant a day holding a salary and a transfer to
 * savings summed to "0 € out" — a day where a great deal of money moved,
 * described as a day where none did. Savings leave the account too, and income
 * deserves a mention of its own.
 */
function daySummary(totals, cur) {
  const out = totals.expense + totals.saving;
  const parts = [];
  if (totals.earning > 0) parts.push(`${formatMoney(totals.earning, cur, { compact: true })} in`);
  if (out > 0) parts.push(`${formatMoney(out, cur, { compact: true })} out`);
  return parts.length ? parts.join(' · ') : 'nothing moved';
}

/* ─────────────────────────────── Entry rows ─────────────────────────────── */

function EntryList({ entries, onEdit, dispatch, toast, onView }) {
  const ref = useFlipList([entries.map((e) => e.id).join(',')]);

  return (
    <div ref={ref} className="divide-y divide-[color:var(--border)]">
      {entries.map((e, i) => (
        <EntryRow key={e.id} entry={e} index={i} onEdit={onEdit} dispatch={dispatch} toast={toast} onView={onView} />
      ))}
    </div>
  );
}

function EntryRow({ entry, index, onEdit, dispatch, toast, onView }) {
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
          {/* What was actually paid, where that differs from the home currency
              the ledger is kept in. */}
          {entry.fx ? ` · ${formatMoney(entry.fx.amount, entry.fx.currency)}` : ''}
          {entry.note ? ` · ${entry.note}` : ''}
        </div>
      </button>

      <div className="text-right shrink-0">
        <div className={`text-[13.5px] font-semibold tabular ${KIND_TEXT[kind.tone]}`}>
          {kind.sign > 0 ? '+' : '−'}
          <Money value={entry.amount} />
        </div>
      </div>

      {/* Always visible, unlike edit and delete: it is the only sign the entry
          has a receipt at all. */}
      {entry.attachments?.length > 0 && (
        <IconButton
          name="flag"
          label={`View ${entry.attachments.length} attached ${entry.attachments.length === 1 ? 'file' : 'files'}`}
          className="size-8 shrink-0 text-brandy"
          onClick={() => onView?.(entry)}
        />
      )}

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

/* ───────────────────────────── Attachment viewer ─────────────────────────── */

/**
 * Shows the receipts attached to an entry.
 *
 * Object URLs are created when the sheet opens and revoked when it closes.
 * Leaving them alive holds the whole blob in memory for the life of the tab,
 * which for a session spent scrolling a year of receipts adds up to real
 * memory for images nobody is looking at any more.
 */
function AttachmentViewer({ entry, onClose }) {
  const [urls, setUrls] = useState({});

  useEffect(() => {
    if (!entry) return;
    let cancelled = false;
    const made = [];

    Promise.all(
      (entry.attachments || []).map(async (a) => {
        const url = await openAttachment(a.id);
        if (url) made.push(url);
        return [a.id, url];
      })
    ).then((pairs) => {
      if (cancelled) {
        for (const url of made) URL.revokeObjectURL(url);
        return;
      }
      setUrls(Object.fromEntries(pairs));
    });

    return () => {
      cancelled = true;
      for (const url of made) URL.revokeObjectURL(url);
      setUrls({});
    };
  }, [entry]);

  if (!entry) return null;

  return (
    <Sheet open onClose={onClose} title={entry.title} subtitle={`${dayLabel(entry.date)} · attached files`}>
      <div className="space-y-3">
        {(entry.attachments || []).map((a) => {
          const url = urls[a.id];
          return (
            <div key={a.id} className="surface rounded-2xl overflow-hidden">
              <div className="flex items-center gap-2.5 px-3 py-2.5 border-b border-hair">
                <Icon name={a.type === 'application/pdf' ? 'ledger' : 'flag'} className="size-4 text-faint" />
                <span className="text-[13px] font-medium truncate flex-1">{a.name}</span>
                <span className="text-[11px] text-faint">{formatBytes(a.size)}</span>
              </div>

              {url === undefined ? (
                <div className="h-40 animate-pulse" style={{ background: 'var(--border)' }} />
              ) : url === null ? (
                <p className="text-[12.5px] text-dim p-4 leading-relaxed">
                  This file is not on this device. Attachments are stored locally and are not
                  included in a JSON backup, so they do not travel with a restore.
                </p>
              ) : a.type === 'application/pdf' ? (
                <object data={url} type="application/pdf" className="w-full h-[60vh]" aria-label={a.name}>
                  <p className="text-[12.5px] text-dim p-4">This browser cannot preview PDFs inline.</p>
                </object>
              ) : (
                <img src={url} alt={a.name} className="w-full max-h-[60vh] object-contain bg-black/20" />
              )}
            </div>
          );
        })}
      </div>
    </Sheet>
  );
}
