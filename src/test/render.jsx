/**
 * Rendering helpers for component tests.
 *
 * State is seeded through localStorage rather than by injecting a mock store,
 * so the tests exercise the real hydration path — the same one a returning user
 * takes. A test that bypasses it would pass while hydration was broken.
 */

import { render } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { StoreProvider, useStore } from '../lib/store';

export const LS_KEY = 'cointrack.v1';

let seq = 0;
export const entry = (over = {}) => ({
  id: `e${seq++}`,
  date: '2026-09-02',
  kind: 'expense',
  category: 'dining',
  title: 'Lunch',
  note: '',
  amount: 250,
  createdAt: seq,
  ...over,
});

export const seedState = (over = {}) => ({
  version: 1,
  onboarded: true,
  theme: 'dark',
  profile: {
    name: '', currency: 'INR', weekStart: 1, monthlyIncome: 85000,
    savingsTargetPct: 20, budgets: {}, ...over.profile,
  },
  entries: over.entries || [],
  assets: over.assets || [],
  recurring: over.recurring || [],
  goals: over.goals || [],
  notes: [],
  dismissed: [],
  savedAt: Date.now(),
});

/** Put a state into storage before mounting, the way a real reload does. */
export function seed(over = {}) {
  const state = seedState(over);
  localStorage.setItem(LS_KEY, JSON.stringify(state));
  return state;
}

/**
 * Exposes the live store to assertions, so a test can check what was actually
 * committed rather than inferring it from the DOM.
 */
let latest = null;
function Probe() {
  latest = useStore();
  return null;
}

export const store = () => latest;

export function renderWithStore(ui, options) {
  const user = userEvent.setup();
  const result = render(
    <StoreProvider>
      <Probe />
      {ui}
    </StoreProvider>,
    options
  );
  return { user, ...result };
}
