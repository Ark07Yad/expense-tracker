/**
 * Link to ARC — opt-in live sync to ARC, the owner's personal dashboard,
 * when both run on the same Mac.
 *
 * Off by default and stored per browser, so nobody using the deployed app is
 * affected. When on, every change is sent (two seconds after the last edit)
 * to ARC's local server at 127.0.0.1:8795, which accepts it only from this
 * app's localhost address. Notes, receipts, FX details and recurring rules
 * never leave: ARC needs entries, budgets, holdings, debts and goals.
 */

const KEY = 'arc-link';
const URL_ = 'http://127.0.0.1:8795/api/bridge/push/cointrack';
const DELAY = 2000;

let status = { state: 'off', at: null };
const listeners = new Set();
const emit = (next) => {
  status = { ...status, ...next };
  listeners.forEach((fn) => fn(status));
};

export function isArcLinkOn() {
  try {
    return localStorage.getItem(KEY) === 'on';
  } catch {
    return false;
  }
}

export function setArcLink(on, state) {
  try {
    if (on) localStorage.setItem(KEY, 'on');
    else localStorage.removeItem(KEY);
  } catch {
    /* private mode: the link just stays off */
  }
  emit({ state: on ? 'waiting' : 'off' });
  if (on && state) send(state); // first sync right away
}

export function onArcLink(fn) {
  listeners.add(fn);
  fn(status);
  return () => listeners.delete(fn);
}

/** The minimum ARC uses — what leaves this app. */
export function arcPayload(state) {
  return {
    app: 'cointrack',
    version: state.version,
    exportedAt: new Date().toISOString(),
    state: {
      profile: {
        currency: state.profile?.currency,
        monthlyIncome: state.profile?.monthlyIncome,
        savingsTargetPct: state.profile?.savingsTargetPct,
        budgets: state.profile?.budgets,
      },
      entries: (state.entries || []).map(({ id, date, kind, category, title, amount, goalId }) => ({ id, date, kind, category, title, amount, goalId })),
      assets: (state.assets || []).map(({ name, class: cls, history }) => ({ name, class: cls, history })),
      debts: (state.debts || []).map(({ name, class: cls, history }) => ({ name, class: cls, history })),
      goals: (state.goals || []).map(({ id, name, target, opening, deadline }) => ({ id, name, target, opening, deadline })),
    },
  };
}

async function send(state, fetchImpl = fetch) {
  emit({ state: 'sending' });
  try {
    const res = await fetchImpl(URL_, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-arc-bridge': '1' },
      body: JSON.stringify(arcPayload(state)),
    });
    emit(res.ok ? { state: 'ok', at: Date.now() } : { state: 'refused' });
  } catch {
    emit({ state: 'offline' }); // ARC isn't running — the next change tries again
  }
}

let timer = null;
/** Called on every saved state; sends after edits settle. A no-op while the link is off. */
export function scheduleArcSync(state, fetchImpl = fetch) {
  if (!isArcLinkOn()) return;
  clearTimeout(timer);
  timer = setTimeout(() => send(state, fetchImpl), DELAY);
}
