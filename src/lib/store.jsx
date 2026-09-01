/**
 * Application state: one object, persisted to the device, exposed through a
 * context. Everything the app knows about your money lives here — there is no
 * server, no account, and nothing leaves the browser.
 *
 * Writes go through `lib/persist`, which mirrors to IndexedDB and localStorage
 * and asks the browser not to evict either.
 */

import { createContext, useContext, useEffect, useMemo, useReducer, useRef } from 'react';
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

  /**
   * Recurring rules — entry templates with a schedule. See lib/recurring.js.
   *
   * Rent and subscriptions are the entries people retype twelve times a year
   * and then stop logging altogether, which quietly makes every total wrong.
   * Nothing here posts by itself: the app offers what is due and the user
   * confirms or skips.
   */
  recurring: [],

  /**
   * Savings goals. Progress comes from saving entries tagged with `goalId`,
   * not from a category — a shared "Goal savings" category covering three
   * different goals would make every figure on that screen a guess.
   */
  goals: [],

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
    recurring: Array.isArray(stored.recurring) ? stored.recurring : [],
    goals: Array.isArray(stored.goals) ? stored.goals : [],
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
      const e = action.entry;
      const entry = {
        id: uid(),
        date: e.date || todayKey(),
        kind: e.kind || 'expense',
        category: e.category,
        title: (e.title || '').trim() || 'Untitled',
        note: (e.note || '').trim(),
        amount: Math.abs(Number(e.amount) || 0),
        createdAt: Date.now(),
        /*
         * The optional fields are listed rather than spread, so a stray key
         * from a draft cannot become part of the stored shape. They do have to
         * be listed though — omitting them here is a silent drop: the composer
         * shows the goal selected, and the entry is saved without it.
         */
        ...(e.kind === 'saving' && e.goalId ? { goalId: e.goalId } : {}),
        ...(e.fx && Number(e.fx.amount) > 0 && Number(e.fx.rate) > 0
          ? { fx: { currency: e.fx.currency, amount: Number(e.fx.amount), rate: Number(e.fx.rate) } }
          : {}),
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

    /**
     * Bulk import. One action, because writing a few hundred entries as
     * individual dispatches would re-render and re-persist the whole state
     * once per row.
     */
    case 'importEntries': {
      const rows = action.entries || [];
      if (!rows.length) return state;
      const now = Date.now();
      const created = rows.map((r, i) => ({
        id: uid(),
        date: r.date,
        kind: r.kind || 'expense',
        category: r.category,
        title: (r.title || '').trim() || 'Imported',
        note: (r.note || '').trim(),
        amount: Math.abs(Number(r.amount) || 0),
        // Preserve file order within the same millisecond, so a statement's own
        // sequence survives into the ledger.
        createdAt: now + i,
        imported: true,
      }));
      return { ...state, entries: [...created, ...state.entries] };
    }

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

    /* ── Recurring ── */

    case 'addRecurring': {
      const r = action.rule;
      const rule = {
        id: uid(),
        kind: r.kind || 'expense',
        category: r.category,
        title: (r.title || '').trim() || 'Untitled',
        note: (r.note || '').trim(),
        amount: Math.abs(Number(r.amount) || 0),
        frequency: r.frequency || 'monthly',
        anchorDate: r.anchorDate || todayKey(),
        /*
         * A rule created from an entry that was just logged must not
         * immediately offer that same date back. Seeding `lastResolved` with
         * the anchor is what makes "log rent, repeat monthly" produce one entry
         * now and the next one next month, rather than a duplicate on the spot.
         */
        lastResolved: r.lastResolved ?? null,
        active: true,
        createdAt: Date.now(),
      };
      return { ...state, recurring: [...state.recurring, rule] };
    }

    case 'updateRecurring':
      return {
        ...state,
        recurring: state.recurring.map((r) =>
          r.id === action.id
            ? {
                ...r,
                ...action.patch,
                amount:
                  action.patch.amount !== undefined
                    ? Math.abs(Number(action.patch.amount) || 0)
                    : r.amount,
              }
            : r
        ),
      };

    case 'deleteRecurring':
      return { ...state, recurring: state.recurring.filter((r) => r.id !== action.id) };

    /**
     * Resolve a batch of due occurrences in one go.
     *
     * One action rather than one per row: posting six months of a missed rule
     * as six dispatches would rewrite and persist the whole state six times,
     * and a half-applied batch would leave rules and entries disagreeing about
     * what had already been handled.
     */
    case 'resolveDue': {
      const items = action.items || [];
      if (!items.length) return state;

      const created = [];
      const resolvedTo = new Map();

      for (const { ruleId, date, post } of items) {
        const rule = state.recurring.find((r) => r.id === ruleId);
        if (!rule) continue;

        if (post) {
          created.push({
            id: uid(),
            date,
            kind: rule.kind,
            category: rule.category,
            title: rule.title,
            note: rule.note,
            amount: Math.abs(Number(rule.amount) || 0),
            createdAt: Date.now(),
            /** Marks the entry as generated, so the ledger can say where it came from. */
            fromRule: rule.id,
          });
        }

        // Skipped occurrences advance the marker too — that is what stops a
        // cancelled subscription reappearing every month.
        const prev = resolvedTo.get(ruleId);
        if (!prev || date > prev) resolvedTo.set(ruleId, date);
      }

      return {
        ...state,
        entries: [...created, ...state.entries],
        recurring: state.recurring.map((r) =>
          resolvedTo.has(r.id) ? { ...r, lastResolved: resolvedTo.get(r.id) } : r
        ),
      };
    }

    /* ── Goals ── */

    case 'addGoal': {
      const g = action.goal;
      return {
        ...state,
        goals: [
          ...state.goals,
          {
            id: uid(),
            name: (g.name || '').trim() || 'Untitled goal',
            target: Math.max(0, Number(g.target) || 0),
            /** Money already set aside before the goal was created here. */
            opening: Math.max(0, Number(g.opening) || 0),
            deadline: g.deadline || null,
            note: (g.note || '').trim(),
            createdAt: Date.now(),
            archived: false,
          },
        ],
      };
    }

    case 'updateGoal':
      return {
        ...state,
        goals: state.goals.map((g) => (g.id === action.id ? { ...g, ...action.patch } : g)),
      };

    /**
     * Deleting a goal leaves its contributions alone.
     *
     * Those are real savings that really happened; erasing them because the
     * goal was abandoned would silently change the savings rate for every past
     * month. They simply become untagged.
     */
    case 'deleteGoal':
      return {
        ...state,
        goals: state.goals.filter((g) => g.id !== action.id),
        entries: state.entries.map((e) =>
          e.goalId === action.id ? { ...e, goalId: undefined } : e
        ),
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

  /**
   * True while the next state change is one we just read *from* storage rather
   * than one the user made.
   *
   * Without this, adopting another tab's write immediately saves it again,
   * which broadcasts, which makes the other tab adopt and save, and the two
   * tabs write to storage forever — measurably, about twice a second with both
   * sitting idle. Worse than the noise: a `load()` still in flight can land on
   * top of an edit made a moment ago, so the loop does not just spin, it eats
   * entries.
   */
  const adopting = useRef(false);

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
      if ((stored.savedAt || 0) > mirrorAt) {
        adopting.current = true;
        dispatch({ type: 'replace', state: stored });
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // Persist every change the *user* makes. Debounced inside `persist`, so typing
  // an amount does not open an IndexedDB transaction per keystroke. A state that
  // came from storage is skipped — writing it back is what starts the echo.
  useEffect(() => {
    if (adopting.current) {
      adopting.current = false;
      return;
    }
    persist.save(state);
  }, [state]);

  /*
   * Adopt writes made in another tab.
   *
   * Two tabs each hold the whole state and each save the whole state, so
   * without this the second tab to write wins and the first tab's entries
   * vanish with no error. On hearing about a newer write we re-read storage
   * rather than trusting the message, so there is still exactly one definition
   * of which copy is authoritative — the one in `persist.load`.
   *
   * The `savedAt` comparison also covers the case that matters most: a message
   * that arrives while this tab has an unsaved edit in flight is ignored,
   * because our own pending write will be the newer one.
   */
  useEffect(() =>
    persist.watchOtherTabs(() => {
      persist.load().then((stored) => {
        if (stored && (stored.savedAt || 0) > persist.lastWriteAt()) {
          adopting.current = true;
          dispatch({ type: 'replace', state: stored });
        }
      });
    }), []);

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
