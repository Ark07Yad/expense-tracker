/**
 * Search and jump.
 *
 * One box that reaches everything: any screen, the common actions, the AI
 * advisor's topics, a section of suggestions, or a particular entry. The app
 * already had single-key shortcuts, but shortcuts only help people who have
 * learned them — this is the same reach for everyone else, and it says what
 * each thing is called.
 *
 * Built as a combobox over a listbox, the pattern screen readers already know:
 * focus never leaves the input, and the highlighted row is announced through
 * `aria-activedescendant`. That also makes the focus trap trivial — there is
 * exactly one thing to focus.
 *
 * Mounted only while open, so every opening starts clean without an effect
 * having to reset anything.
 */

import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Icon } from './ui';

/**
 * How well a query matches a label. Higher is better, 0 is no match.
 *
 * Start of the label beats start of a word beats anywhere inside; failing
 * those, the first letters of consecutive words ("jt" → Jump to today).
 *
 * Deliberately *not* "these letters, in order, anywhere". That was the first
 * version, and typing "tre" returned ten rows because "Suggestions: Whole
 * picTuRE" qualified. Predictable beats clever in a list this short: if a row
 * is there, you should be able to see why.
 */
export function score(query, text) {
  if (!query) return 1;
  const hay = String(text || '').toLowerCase();
  const at = hay.indexOf(query);
  if (at === 0) return 100;
  if (at > 0) return /[\s:—-]/.test(hay[at - 1]) ? 80 : 60;

  const initials = hay.split(/[\s:—-]+/).filter(Boolean).map((word) => word[0]).join('');
  return initials.includes(query) ? 40 : 0;
}

/** Commands that match, best first. With no query, the list as given. */
export function rank(commands, query) {
  const q = query.trim().toLowerCase();
  if (!q) return commands;
  return commands
    // The label is what you can see, so it outranks the hidden keywords.
    .map((command, index) => ({
      command,
      index,
      s: Math.max(score(q, command.label), command.keywords ? score(q, command.keywords) * 0.5 : 0),
    }))
    .filter((x) => x.s > 0)
    // Ties keep their original order, so the list does not shuffle as you type.
    .sort((a, b) => b.s - a.s || a.index - b.index)
    .map((x) => x.command);
}

const MAX_WHEN_SEARCHING = 8;

export default function CommandPalette({ onClose, commands, findEntries, returnFocusTo = null }) {
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const input = useRef(null);
  const list = useRef(null);
  const listId = useId();

  const q = query.trim().toLowerCase();

  const results = useMemo(() => {
    const matched = rank(commands, query);
    if (!q) return matched;
    const entries = q.length >= 2 && findEntries ? findEntries(q) : [];
    return [...matched.slice(0, MAX_WHEN_SEARCHING), ...entries];
  }, [commands, findEntries, query, q]);

  // The highlight cannot point past the end of a list that just got shorter.
  const current = Math.min(active, Math.max(0, results.length - 1));

  useEffect(() => {
    /*
     * Where focus goes back to. Passed in when a button opened this, because
     * Safari does not focus a button on click — `document.activeElement` there
     * is <body>, and focus would be dropped at the top of the page.
     */
    const restoreTo = returnFocusTo || document.activeElement;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    input.current?.focus();
    return () => {
      document.body.style.overflow = overflow;
      // Back to whatever opened it — unless running a command moved focus on.
      if (restoreTo instanceof HTMLElement && document.body.contains(restoreTo)) restoreTo.focus();
    };
    // Mounted once per opening; the return target is fixed at that moment.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    list.current?.querySelector(`[data-index="${current}"]`)?.scrollIntoView?.({ block: 'nearest' });
  }, [current]);

  const run = (item) => {
    if (!item) return;
    onClose();
    item.run();
  };

  const onKeyDown = (event) => {
    const last = results.length - 1;
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActive(current >= last ? 0 : current + 1);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActive(current <= 0 ? last : current - 1);
    } else if (event.key === 'Home') {
      event.preventDefault();
      setActive(0);
    } else if (event.key === 'End') {
      event.preventDefault();
      setActive(last);
    } else if (event.key === 'Enter') {
      event.preventDefault();
      run(results[current]);
    } else if (event.key === 'Escape') {
      event.preventDefault();
      onClose();
    } else if (event.key === 'Tab') {
      // One focusable thing in here; Tab would only walk out into the page behind.
      event.preventDefault();
    }
  };

  const optionId = (index) => `${listId}-option-${index}`;

  return createPortal(
    <div className="fixed inset-0 z-[60] flex items-start justify-center px-4 pt-[10vh] sm:pt-[14vh]">
      <div
        className="absolute inset-0 bg-black/60 animate-[pop_0.18s_ease-out]"
        onClick={onClose}
        aria-hidden="true"
      />

      <div
        role="dialog"
        aria-modal="true"
        aria-label="Search and jump"
        className="relative w-full max-w-xl rounded-3xl border border-hair overflow-hidden animate-pop"
        style={{ background: 'var(--bg-elev)', boxShadow: 'var(--shadow-pop)' }}
      >
        <div className="flex items-center gap-3 px-4 border-b border-hair">
          <Icon name="search" className="size-[18px] text-faint shrink-0" />
          <input
            ref={input}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setActive(0);
            }}
            onKeyDown={onKeyDown}
            role="combobox"
            aria-expanded="true"
            aria-controls={listId}
            aria-activedescendant={results.length ? optionId(current) : undefined}
            aria-autocomplete="list"
            aria-label="Search screens, actions and entries"
            placeholder="Search screens, actions, entries…"
            autoComplete="off"
            spellCheck={false}
            className="flex-1 min-w-0 bg-transparent outline-none py-4 text-[15px] placeholder:text-[color:var(--text-faint)]"
          />
          <kbd className="text-[10.5px] px-1.5 py-0.5 rounded surface text-faint shrink-0">esc</kbd>
        </div>

        <ul
          ref={list}
          id={listId}
          role="listbox"
          aria-label="Results"
          className="max-h-[min(52vh,26rem)] overflow-y-auto overscroll-contain p-2"
        >
          {results.length === 0 && (
            <li role="presentation" className="px-3 py-8 text-center text-[13px] text-dim">
              Nothing matches “{query.trim()}”.
            </li>
          )}

          {results.map((item, index) => {
            const selected = index === current;
            // Group headings only make sense while the list is in its own order.
            const heading = !q && item.group && item.group !== results[index - 1]?.group ? item.group : null;
            return (
              <li key={item.id} role="presentation">
                {heading && (
                  <div className="px-3 pt-3 pb-1.5 text-[10.5px] uppercase tracking-wider text-faint">
                    {heading}
                  </div>
                )}
                <div
                  id={optionId(index)}
                  role="option"
                  aria-selected={selected}
                  data-index={index}
                  onMouseMove={() => setActive(index)}
                  onClick={() => run(item)}
                  className={`flex items-center gap-3 px-3 py-2.5 rounded-2xl cursor-pointer text-[13.5px]
                              ${selected ? '[background:var(--surface-hover)]' : ''}`}
                >
                  <Icon name={item.icon || 'chevR'} className={`size-[17px] shrink-0 ${selected ? '' : 'text-faint'}`} />
                  <span className="truncate font-medium">{item.label}</span>
                  {item.hint && (
                    <span className="ml-auto pl-3 text-[11.5px] text-faint whitespace-nowrap tabular">{item.hint}</span>
                  )}
                </div>
              </li>
            );
          })}
        </ul>

        <div className="flex items-center gap-4 px-4 py-2.5 border-t border-hair text-[11px] text-faint">
          <span><kbd className="px-1 rounded surface">↑</kbd> <kbd className="px-1 rounded surface">↓</kbd> move</span>
          <span><kbd className="px-1 rounded surface">↵</kbd> open</span>
          <span className="ml-auto hidden sm:inline">Type two letters to search your entries</span>
        </div>
      </div>
    </div>,
    document.body
  );
}
