/**
 * Application state: one object, persisted to the device, exposed through a
 * context. Everything the app knows about your money lives here — there is no
 * server, no account, and nothing leaves the browser.
 *
 * Writes go through `lib/persist`, which mirrors to IndexedDB and localStorage
 * and asks the browser not to evict either.
 */

import { createContext, useContext, useEffect, useMemo, useReducer } from 'react';
import { categoriesFor } from './data';
import { monthKey, todayKey } from './calc';
import * as persist from './persist';

export const uid = () => Math.random().toString(36).slice(2, 10);

const initialState = {
  version: 1,
  onboarded: false,
  theme: 'dark',

  profile: {
    name: '',
    currency: 'INR',
    /** 1 = weeks run Monday–Sunday, 0 = Sunday–Saturday. */
    weekStart: 1,
    /** Expected monthly take-home. Used for budget seeding and savings rate. */
    monthlyIncome: 0,
    /** The share of income you intend to keep, as a percentage. */
    savingsTargetPct: 20,
    /** Monthly ceiling per expense category: { [categoryId]: amount }. */
    budgets: {},
  },

  /**
   * The ledger. One flat array rather than a map keyed by day.
   *
   * Every view here is a *range* — this week, this quarter, the last twelve
   * months — and a flat array filtered by a string comparison on `date` is both
   * simpler and faster for that than walking a nested object. Day-keyed storage
   * only wins when the app is overwhelmingly about a single day, which a
   * tracker with quarterly and yearly views is not.
   *
   * Shape: { id, date, kind, category, title, note, amount, createdAt }
   * `amount` is always stored positive; `kind` carries the direction.
   */
  entries: [],

  /**
   * Investments. Each asset keeps its own month-by-month history:
   *
   *   { id, name, class, note, createdAt,
   *     history: { 'YYYY-MM': { contributed, value } } }
   *
   * `contributed` is what you put in *that month*; `value` is what the holding
   * was worth at the end of it. Keeping both is what separates "my portfolio
   * went up" from "I paid in more money" — without the contribution column,
   * every deposit looks like a gain.
   */
  assets: [],

  /** Free-text notes the user pins in the advisor. */
  notes: [],

  /** Suggestion ids the user has dismissed, so they stop coming back. */
  dismissed: [],
};

/* ─────────────────────────────── Hydration ─────────────────────────────── */

/**
 * Merge a stored state into the current shape.
 *
 * Deliberately field-by-field rather than a deep spread: a stored object from
 * an older version is missing keys that the UI now assumes exist, and a shallow
 * `{...initial, ...stored}` would drop the new defaults inside `profile`.
 */
function hydrate(stored) {
  if (!stored || typeof stored !== 'object') return initialState;
  return {
    ...initialState,
    ...stored,
    profile: { ...initialState.profile, ...stored.profile },
    entries: Array.isArray(stored.entries) ? stored.entries : [],
    assets: Array.isArray(stored.assets)
      ? stored.assets.map((a) => ({ ...a, history: a.history || {} }))
      : [],
    notes: Array.isArray(stored.notes) ? stored.notes : [],
    dismissed: Array.isArray(stored.dismissed) ? stored.dismissed : [],
  };
}

/* ──────────────────────────────── Reducer ──────────────────────────────── */

function reducer(state, action) {
  switch (action.type) {
    case 'replace':
      return hydrate(action.state);

    case 'reset':
      return { ...initialState, theme: state.theme };

    case 'theme':
      return { ...state, theme: action.theme };

    case 'onboard':
      return {
        ...state,
        onboarded: true,
        profile: { ...state.profile, ...action.profile },
      };

    case 'profile':
      return { ...state, profile: { ...state.profile, ...action.patch } };

    case 'budget': {
      const budgets = { ...state.profile.budgets };
      if (action.amount === null || action.amount === undefined || action.amount === '')
        delete budgets[action.category];
      else budgets[action.category] = Math.max(0, Number(action.amount) || 0);
      return { ...state, profile: { ...state.profile, budgets } };
    }

    /* ── Ledger ── */

    case 'addEntry': {
      const entry = {
        id: uid(),
        date: action.entry.date || todayKey(),
        kind: action.entry.kind || 'expense',
        category: action.entry.category,
        title: (action.entry.title || '').trim() || 'Untitled',
        note: (action.entry.note || '').trim(),
        amount: Math.abs(Number(action.entry.amount) || 0),
        createdAt: Date.now(),
      };
      return { ...state, entries: [entry, ...state.entries] };
    }

    case 'updateEntry':
      return {
        ...state,
        entries: state.entries.map((e) =>
          e.id === action.id
            ? {
                ...e,
                ...action.patch,
                amount:
                  action.patch.amount !== undefined
                    ? Math.abs(Number(action.patch.amount) || 0)
                    : e.amount,
              }
            : e
        ),
      };

    case 'deleteEntry':
      return { ...state, entries: state.entries.filter((e) => e.id !== action.id) };

    /* ── Investments ── */

    case 'addAsset': {
      const asset = {
        id: uid(),
        name: (action.asset.name || '').trim() || 'Untitled holding',
        class: action.asset.class || 'fund',
        note: (action.asset.note || '').trim(),
        createdAt: Date.now(),
        history: {},
      };
      // An opening position is the common case — you add a holding because you
      // already own some of it — so seed this month rather than making the user
      // add the asset and then immediately update it.
      if (action.asset.value || action.asset.contributed) {
        asset.history[action.asset.month || monthKey(todayKey())] = {
          contributed: Math.max(0, Number(action.asset.contributed) || 0),
          value: Math.max(0, Number(action.asset.value) || 0),
        };
      }
      return { ...state, assets: [...state.assets, asset] };
    }

    case 'updateAsset':
      return {
        ...state,
        assets: state.assets.map((a) => (a.id === action.id ? { ...a, ...action.patch } : a)),
      };

    case 'deleteAsset':
      return { ...state, assets: state.assets.filter((a) => a.id !== action.id) };

    case 'setSnapshot':
      return {
        ...state,
        assets: state.assets.map((a) =>
          a.id === action.assetId
            ? {
                ...a,
                history: {
                  ...a.history,
                  [action.month]: {
                    contributed: Math.max(0, Number(action.contributed) || 0),
                    value: Math.max(0, Number(action.value) || 0),
                  },
                },
              }
            : a
        ),
      };

    case 'deleteSnapshot':
      return {
        ...state,
        assets: state.assets.map((a) => {
          if (a.id !== action.assetId) return a;
          const history = { ...a.history };
          delete history[action.month];
          return { ...a, history };
        }),
      };

    /* ── Advisor ── */

    case 'addNote':
      return {
        ...state,
        notes: [
          { id: uid(), section: action.section || 'overall', text: action.text, at: Date.now() },
          ...state.notes,
        ],
      };

    case 'deleteNote':
      return { ...state, notes: state.notes.filter((n) => n.id !== action.id) };

    case 'dismiss':
      return state.dismissed.includes(action.id)
        ? state
        : { ...state, dismissed: [...state.dismissed, action.id] };

    case 'restoreDismissed':
      return { ...state, dismissed: [] };

    default:
      return state;
  }
}

/* ──────────────────────────────── Provider ─────────────────────────────── */

const StoreContext = createContext(null);

export function StoreProvider({ children }) {
  // The synchronous mirror is read during the very first render so a returning
  // user never sees an empty app flash before IndexedDB resolves.
  const [state, dispatch] = useReducer(reducer, undefined, () => hydrate(persist.loadSync()));

  // Authoritative read: whichever backend holds the newer copy wins. Skipped if
  // the user has already started typing, so a slow IDB read cannot clobber
  // fresh input.
  useEffect(() => {
    let cancelled = false;
    persist.load().then((stored) => {
      if (cancelled || !stored) return;
      // Re-reading the mirror here rather than trusting the one from mount is
      // what stops a slow IndexedDB read from clobbering edits made in the
      // meantime: by now the mirror carries them and is the newer copy.
      const mirrorAt = persist.loadSync()?.savedAt || 0;
      if ((stored.savedAt || 0) > mirrorAt) dispatch({ type: 'replace', state: stored });
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // Persist every change. Debounced inside `persist`, so typing an amount does
  // not open an IndexedDB transaction per keystroke.
  useEffect(() => {
    persist.save(state);
  }, [state]);

  // A tab being hidden or closed is the moment a debounced write would be lost.
  useEffect(() => {
    const flush = () => persist.flushNow();
    window.addEventListener('pagehide', flush);
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') flush();
    });
    return () => window.removeEventListener('pagehide', flush);
  }, []);

  // Ask the browser to stop evicting this origin once the user has real data in
  // it. Asking on first paint is both premature and more likely to be refused.
  useEffect(() => {
    if (state.entries.length >= 3 || state.assets.length) persist.requestPersistence();
  }, [state.entries.length, state.assets.length]);

  // Resolve the theme onto <html>, and follow the system when set to 'system'.
  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const apply = () => {
      const resolved = state.theme === 'system' ? (mq.matches ? 'dark' : 'light') : state.theme;
      document.documentElement.dataset.theme = resolved;
      document
        .querySelector('meta[name="theme-color"]')
        ?.setAttribute('content', resolved === 'dark' ? '#0a0912' : '#f7f7fa');
    };
    apply();
    if (state.theme !== 'system') return;
    mq.addEventListener('change', apply);
    return () => mq.removeEventListener('change', apply);
  }, [state.theme]);

  const value = useMemo(() => ({ state, dispatch }), [state]);
  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useStore() {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error('useStore must be used inside <StoreProvider>');
  return ctx;
}

/* ───────────────────────────────── Helpers ─────────────────────────────── */

/** Propose an opening budget from income, using the planning shares in data.js. */
export function suggestBudgets(monthlyIncome, savingsTargetPct = 20) {
  const income = Number(monthlyIncome) || 0;
  if (income <= 0) return {};
  // Everything is scaled so the proposed budgets plus the savings target come
  // to exactly the income. Handing someone a plan that adds up to 118% of what
  // they earn is worse than handing them nothing.
  const spendable = income * (1 - Math.min(0.9, Math.max(0, savingsTargetPct / 100)));
  const cats = categoriesFor('expense').filter((c) => c.share > 0);
  const totalShare = cats.reduce((t, c) => t + c.share, 0);
  const out = {};
  for (const c of cats) {
    const raw = (c.share / totalShare) * spendable;
    // Round to something a person would actually write down.
    const step = raw > 20000 ? 1000 : raw > 2000 ? 500 : 100;
    out[c.id] = Math.max(step, Math.round(raw / step) * step);
  }
  return out;
}
