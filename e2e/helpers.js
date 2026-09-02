/**
 * Shared plumbing for the end-to-end journeys.
 *
 * Deliberately thin. An end-to-end test earns its cost by using the app the way
 * a person does, so these helpers wrap the app's own controls rather than
 * reaching into state — the one exception is `seedLedger`, which exists so a
 * test about *reading* a year of data does not have to spend a minute writing
 * it through the form first.
 */

import { expect } from '@playwright/test';

export const CURRENCIES = { INR: '₹', EUR: '€', GBP: '£' };

/** Complete onboarding the quick way: the sample-data path. */
export async function startWithSampleData(page) {
  await page.goto('/');
  await page.getByRole('button', { name: /sample data first/ }).click();
  await expect(page.getByRole('heading', { name: /Good |Still up/ })).toBeVisible();
}

/** Complete onboarding as a new user would, with no data. */
export async function startEmpty(page, { currency = 'INR', name = '' } = {}) {
  await page.goto('/');
  if (name) await page.getByPlaceholder('Your name').fill(name);
  if (currency !== 'INR') {
    await page.getByLabel('Currency').selectOption(currency);
  }
  await page.getByRole('button', { name: /^Continue/ }).click();
  await page.getByRole('button', { name: /Skip —/ }).click();
  await expect(page.getByRole('heading', { name: /Good |Still up/ })).toBeVisible();
}

export const go = (page, tab) =>
  page.locator('aside').getByRole('button', { name: tab, exact: true }).click();

/** Log one entry through the composer, the way a person would. */
export async function logEntry(page, { amount, title, kind = 'Expense', category, repeat, goal }) {
  await page.locator('aside').getByRole('button', { name: 'New entry' }).click();
  const sheet = page.getByRole('dialog');
  await expect(sheet).toBeVisible();

  if (kind !== 'Expense') {
    await sheet.getByRole('group', { name: 'Kind' })
      .getByRole('button', { name: new RegExp(`^${kind}`) }).click();
  }
  await sheet.getByPlaceholder('0').first().fill(String(amount));
  if (category) {
    // Scoped to the category group: several category names also appear as
    // quick-add chips.
    await sheet.getByRole('group', { name: 'Category' })
      .getByRole('button', { name: category, exact: true }).click();
  }
  if (title) {
    await sheet.locator('input:not([inputmode="decimal"]):not([type="date"])').first().fill(title);
  }
  if (goal) {
    await sheet.getByRole('group', { name: 'Toward a goal' })
      .getByRole('button', { name: new RegExp(goal) }).click();
  }
  if (repeat) await sheet.getByRole('tab', { name: repeat }).click();

  await sheet.getByRole('button', { name: /^Log / }).click();
  await expect(sheet).toBeHidden();
}

/** Read the state the app has actually persisted, right now. */
export const readState = (page) =>
  page.evaluate(() => JSON.parse(localStorage.getItem('cointrack.v1') || 'null'));

/**
 * The persisted entry titles, polled.
 *
 * Writes are debounced by 400ms, so reading storage the instant the UI updates
 * reliably returns the *previous* state — which looks exactly like a lost
 * write. Anything asserting on what was persisted has to poll rather than
 * sample once.
 */
export const persistedTitles = (page) =>
  page.evaluate(() => {
    const s = JSON.parse(localStorage.getItem('cointrack.v1') || '{}');
    return (s.entries || []).map((e) => e.title).sort();
  });

/** Waits for the debounce, then hands back the settled state. */
export async function settledState(page, expectedEntryCount) {
  await expect
    .poll(async () => (await readState(page))?.entries?.length ?? -1, { timeout: 6000 })
    .toBe(expectedEntryCount);
  return readState(page);
}

/**
 * Write a ledger directly, then reload.
 *
 * Only for tests whose subject is reading or analysing data, never for tests
 * about entering it.
 */
export async function seedLedger(page, state) {
  /*
   * Written before any app code runs, via an init script.
   *
   * Setting it after a first load and then reloading looks equivalent and is
   * not: the app persists on a 400ms debounce, so its own empty state can land
   * on top of the seed in the gap before the reload. The seeded run then starts
   * at onboarding with nothing, and the failure looks like a product bug.
   */
  await page.addInitScript((s) => {
    localStorage.setItem('cointrack.v1', JSON.stringify(s));
  }, state);
  await page.goto('/');
}

export const baseState = (over = {}) => ({
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

/**
 * Collect page errors and console errors for the life of a test.
 *
 * A journey that renders the right text while throwing in the background has
 * not passed; several screens in this app only fail on a code path a smoke test
 * would otherwise walk straight past.
 */
export function watchForErrors(page) {
  const errors = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(`console: ${m.text()}`);
  });
  return errors;
}
