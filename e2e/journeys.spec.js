import { expect, test } from '@playwright/test';
import {
  baseState, go, logEntry, persistedTitles, seedLedger, settledState, startEmpty,
  startWithSampleData, watchForErrors,
} from './helpers';

/**
 * The journeys a person actually takes.
 *
 * These are deliberately few and whole. Unit and component tests already cover
 * the pieces; what only an end-to-end test can show is that the pieces are
 * wired to each other — that an entry typed into a form reaches the dashboard's
 * arithmetic, survives a reload, and is still there after the bundle it was
 * typed into has been replaced.
 */

test.describe('a new user', () => {
  test('sets up, logs an entry, and sees it counted', async ({ page }) => {
    const errors = watchForErrors(page);
    await startEmpty(page, { name: 'Aryan' });

    // The greeting uses the name given during setup.
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Aryan');

    // Nothing logged: the dashboard should say so rather than showing zeros
    // dressed up as insight.
    await expect(page.getByText('Nothing logged this month')).toBeVisible();

    await logEntry(page, { amount: 2500, title: 'Weekly shop', category: 'Groceries' });

    // The entry reaches the ledger, the totals and the category mix.
    await expect(page.getByText('Weekly shop').first()).toBeVisible();
    await expect(page.locator('main')).toContainText('₹2,500');

    const state = await settledState(page, 1);
    expect(state.entries[0]).toMatchObject({ amount: 2500, title: 'Weekly shop', category: 'groceries' });
    expect(errors).toEqual([]);
  });

  test('keeps the currency it was given, everywhere', async ({ page }) => {
    // The bug this covers: the currency chosen on the first onboarding step was
    // not used by the field on the next one.
    await page.goto('/');
    await page.getByLabel('Currency').selectOption('EUR');
    await page.getByRole('button', { name: /^Continue/ }).click();

    // Income step: the symbol must already be the euro, not the default rupee.
    const incomeField = page.locator('label').filter({ hasText: 'Monthly take-home' });
    await expect(incomeField).toContainText('€');
    await expect(incomeField).not.toContainText('₹');

    await page.getByPlaceholder('0').first().fill('4200');
    await page.getByRole('button', { name: /Suggest budgets/ }).click();
    await expect(page.getByText(/€ of/)).toBeVisible();

    await page.getByRole('button', { name: /Start tracking/ }).click();
    await expect(page.getByRole('heading', { name: /Good |Still up/ })).toBeVisible();

    await logEntry(page, { amount: 30, title: 'Coffee' });
    await expect(page.locator('main')).toContainText('€');
  });
});

test.describe('the local-first promise', () => {
  test('data survives a reload', async ({ page }) => {
    await startEmpty(page);
    await logEntry(page, { amount: 1234, title: 'Survives a reload' });

    await page.reload();
    await expect(page.getByRole('heading', { name: /Good |Still up/ })).toBeVisible();
    await expect(page.getByText('Survives a reload').first()).toBeVisible();
  });

  test('data survives being closed and reopened in a new page', async ({ page, context }) => {
    // A different page in the same context is the closest thing to quitting the
    // browser and coming back: same origin storage, entirely new document.
    await startEmpty(page);
    await logEntry(page, { amount: 999, title: 'Still here tomorrow' });
    await page.close();

    const reopened = await context.newPage();
    await reopened.goto('/');
    await expect(reopened.getByText('Still here tomorrow').first()).toBeVisible();
  });

  test('two tabs do not overwrite each other', async ({ page, context }) => {
    // Each tab holds and saves the whole state, so without coordination the
    // second one to write wipes the first one's entry, with no error.
    await startEmpty(page);
    await logEntry(page, { amount: 111, title: 'From tab A' });

    const tabB = await context.newPage();
    await tabB.goto('/');
    await expect(tabB.getByText('From tab A').first()).toBeVisible();

    await logEntry(tabB, { amount: 222, title: 'From tab B' });

    // Both entries must exist, in both tabs.
    await expect.poll(() => persistedTitles(tabB), { timeout: 8000 })
      .toEqual(['From tab A', 'From tab B']);

    await expect(page.getByText('From tab B').first()).toBeVisible({ timeout: 10_000 });
  });
});

test.describe('with a full ledger', () => {
  test('every screen renders without throwing', async ({ page }) => {
    const errors = watchForErrors(page);
    await startWithSampleData(page);

    for (const tab of ['Ledger', 'Trends', 'Invest', 'Advice', 'Settings', 'Home']) {
      await go(page, tab);
      await expect(page.locator('main')).not.toBeEmpty();
      // Lazy routes arrive as separate chunks; wait for real content, not the
      // skeleton that stands in for it.
      await expect(page.locator('main')).toContainText(/\w{4,}/);
    }
    expect(errors).toEqual([]);
  });

  test('the four period levels all resolve', async ({ page }) => {
    const errors = watchForErrors(page);
    await startWithSampleData(page);
    await go(page, 'Trends');

    for (const period of ['Week', 'Month', 'Quarter', 'Year']) {
      await page.getByRole('tab', { name: period, exact: true }).click();
      // Stepping back must not throw at a period boundary.
      await page.getByRole('button', { name: 'Previous period' }).click();
      await page.getByRole('button', { name: 'Previous period' }).click();
      await expect(page.locator('main')).toContainText(/Earned|Nothing logged/);
      await page.getByRole('button', { name: 'Now', exact: true }).click();
    }
    expect(errors).toEqual([]);
  });

  test('filtering Trends narrows the whole page at once', async ({ page }) => {
    await startWithSampleData(page);
    await go(page, 'Trends');

    // Year, so the assertion does not depend on which day of the month the
    // suite happens to run on — the demo's rent falls on the 3rd.
    await page.getByRole('tab', { name: 'Year', exact: true }).click();

    // The card containing that heading. Filtering by text would also match the
    // controls card, whose category select has an "Every category" option.
    const categoryTable = page.locator('main .surface')
      .filter({ has: page.getByRole('heading', { name: 'Every category' }) });

    await expect(page.getByText(/^\d+ categories in play$/)).toBeVisible();
    const before = await categoryTable.textContent();
    expect(before).toContain('Rent & Housing');
    expect(before).toContain('Food & Dining');

    await page.locator('main').getByRole('combobox').selectOption('dining');
    await expect(page.getByText(/Showing Food & Dining only/)).toBeVisible();

    // Not just the table: the breakdown, the movers and the totals must all be
    // describing the same slice, or a chart ends up showing one category
    // against a headline for every category.
    await expect(page.getByText('1 category in play')).toBeVisible();
    const after = await categoryTable.textContent();
    expect(after).toContain('Food & Dining');
    expect(after).not.toContain('Rent & Housing');
  });
});

test.describe('keyboard', () => {
  test('navigates, and stays out of the way while typing', async ({ page }) => {
    await startWithSampleData(page);

    await page.keyboard.press('3');
    await expect(page.locator('aside').getByRole('button', { name: 'Trends' })).toHaveAttribute('aria-current', 'page');

    await page.keyboard.press('2');
    await expect(page.locator('aside').getByRole('button', { name: 'Ledger' })).toHaveAttribute('aria-current', 'page');

    // The guard: with focus in the search box, every shortcut key must be text.
    const search = page.getByPlaceholder(/Search titles/);
    await search.click();
    await search.type('n123');
    await expect(search).toHaveValue('n123');
    await expect(page.locator('aside').getByRole('button', { name: 'Ledger' })).toHaveAttribute('aria-current', 'page');
    await expect(page.getByRole('dialog')).toBeHidden();

    // And out of the field, they work again.
    await page.keyboard.press('Escape');
    await page.locator('main').getByRole('heading').first().click({ force: true });
    await page.keyboard.press('n');
    await expect(page.getByRole('dialog')).toBeVisible();

    // Escape closes it and focus comes back into the page.
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toBeHidden();
  });

  test('a dialog holds focus', async ({ page }) => {
    await startWithSampleData(page);
    await page.locator('aside').getByRole('button', { name: 'New entry' }).click();
    const sheet = page.getByRole('dialog');
    await expect(sheet).toBeVisible();

    // Opens on the amount field, and Tab never leaves the dialog.
    await expect(sheet.getByPlaceholder('0').first()).toBeFocused();
    for (let i = 0; i < 12; i++) {
      await page.keyboard.press('Tab');
      const inside = await sheet.evaluate((el) => el.contains(document.activeElement));
      expect(inside, `focus escaped on Tab ${i + 1}`).toBe(true);
    }
  });
});

test.describe('budgets and advice', () => {
  test('a budget set in Settings changes what the dashboard and advisor say', async ({ page }) => {
    const today = new Date();
    const day = (n) => `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(n).padStart(2, '0')}`;

    await seedLedger(page, baseState({
      entries: [
        { id: 'a', date: day(1), kind: 'earning', category: 'salary', title: 'Salary', note: '', amount: 85000, createdAt: 1 },
        { id: 'b', date: day(2), kind: 'expense', category: 'dining', title: 'Dinner', note: '', amount: 9000, createdAt: 2 },
      ],
    }));

    await go(page, 'Settings');
    const diningRow = page.locator('div').filter({ hasText: /^Food & Dining/ }).last();
    await diningRow.getByPlaceholder('—').fill('4000');
    await diningRow.getByPlaceholder('—').blur();

    await go(page, 'Home');
    // The budget is blown, and the dashboard says so with the real numbers.
    await expect(page.locator('main')).toContainText('Food & Dining');
    await expect(page.locator('main')).toContainText(/Over by/);

    await go(page, 'Advice');
    await page.getByRole('button', { name: /Budgets/ }).click();
    await expect(page.locator('main')).toContainText(/blown/);
  });
});
