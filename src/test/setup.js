/**
 * Test environment shims.
 *
 * jsdom implements the DOM, not the browser around it. Everything here is an
 * API the app legitimately uses that jsdom does not provide — not a behaviour
 * being faked to make a test pass. Each would otherwise throw during render and
 * fail every component test for a reason unrelated to the component.
 *
 * The whole file no-ops under the node environment, which is where the engine
 * tests run: they have no document to clean up and no window to shim.
 */

import { afterEach, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';

const isDom = typeof window !== 'undefined';

if (isDom) {
  /** The store resolves the theme through this on mount. */
  if (!window.matchMedia) {
    window.matchMedia = (query) => ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    });
  }

  /** Recharts measures its container with one; jsdom has no layout at all. */
  if (!window.ResizeObserver) {
    window.ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    };
  }

  /** Navigation smooth-scrolls after a tab change. */
  window.scrollTo = window.scrollTo || (() => {});
  Element.prototype.scrollIntoView = Element.prototype.scrollIntoView || (() => {});

  /**
   * Storage.
   *
   * Vitest's jsdom environment does not expose `localStorage`, on any jsdom
   * version tried — the property is declared on `window` but reads as
   * undefined. jsdom itself provides a working one when constructed directly,
   * so this is a gap in the environment rather than in the app.
   *
   * The app reads and writes storage through `lib/persist`, whose own
   * behaviour is covered separately and exercised for real in the browser;
   * what component tests need from it is somewhere faithful to put a seeded
   * state. This is the Storage surface the app actually uses, backed by a Map.
   */
  if (!window.localStorage) {
    const store = new Map();
    const storage = {
      getItem: (k) => (store.has(String(k)) ? store.get(String(k)) : null),
      setItem: (k, v) => store.set(String(k), String(v)),
      removeItem: (k) => store.delete(String(k)),
      clear: () => store.clear(),
      key: (i) => [...store.keys()][i] ?? null,
      get length() {
        return store.size;
      },
    };
    // Both, and via defineProperty: the existing declaration is read-only, so
    // a plain assignment throws.
    Object.defineProperty(window, 'localStorage', { value: storage, configurable: true });
    Object.defineProperty(globalThis, 'localStorage', { value: storage, configurable: true });
  }

  /** Attachments and the JSON export both go through object URLs. */
  if (!URL.createObjectURL) {
    URL.createObjectURL = () => `blob:test/${Math.random().toString(36).slice(2)}`;
    URL.revokeObjectURL = () => {};
  }
}

afterEach(async () => {
  /*
   * Always hand the timers back.
   *
   * A test that installs fake timers and then times out never reaches its own
   * cleanup, and every later `userEvent` call hangs waiting on a setTimeout
   * that will never fire — one broken test silently breaking the rest of the
   * file.
   */
  vi.useRealTimers();

  if (isDom) {
    const { cleanup } = await import('@testing-library/react');
    cleanup();
    localStorage.clear();
  }
  vi.restoreAllMocks();
});
