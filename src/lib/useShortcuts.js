/**
 * Keyboard shortcuts.
 *
 * Single keys, no modifiers. That is only safe because of the guard below: the
 * moment focus is in a field, every key belongs to that field and none of them
 * belong to us. Getting this wrong means typing "n" in a description silently
 * opening a dialog and losing the entry, which is exactly the kind of bug that
 * makes people stop trusting an app.
 */

import { useEffect } from 'react';

/** True when the key should be left entirely to whatever has focus. */
function typingInto(target) {
  if (!target) return false;
  const tag = target.tagName;
  return (
    tag === 'INPUT' ||
    tag === 'TEXTAREA' ||
    tag === 'SELECT' ||
    target.isContentEditable === true
  );
}

export function useShortcuts(handlers, { enabled = true } = {}) {
  useEffect(() => {
    if (!enabled) return;

    const onKey = (event) => {
      // Anything with a modifier belongs to the browser or the OS.
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      if (typingInto(event.target)) return;

      const key = event.key;
      const handler = handlers[key];
      if (!handler) return;

      event.preventDefault();
      handler(event);
    };

    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [handlers, enabled]);
}

/** The list, kept next to the bindings so the help sheet cannot drift from them. */
export const SHORTCUTS = [
  { keys: ['1'], label: 'Home' },
  { keys: ['2'], label: 'Ledger' },
  { keys: ['3'], label: 'Trends' },
  { keys: ['4'], label: 'Invest' },
  { keys: ['5'], label: 'Advice' },
  { keys: ['6'], label: 'Settings' },
  { keys: ['n'], label: 'New entry' },
  { keys: ['t'], label: 'Jump to today' },
  { keys: ['d'], label: 'Switch theme' },
  { keys: ['?'], label: 'This list' },
  { keys: ['Esc'], label: 'Close a dialog' },
];
