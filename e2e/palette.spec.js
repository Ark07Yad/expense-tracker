import { expect, test } from '@playwright/test';
import { baseState, seedLedger, startWithSampleData, watchForErrors } from './helpers';

/**
 * Search and jump, the way a person uses it: open it from the keyboard, type a
 * few letters, press Enter. Everything here is driven by keys except where the
 * point of the test is that a click works too.
 */

const palette = (page) => page.getByRole('dialog', { name: 'Search and jump' });
const current = (page) => page.locator('aside').locator('[aria-current="page"]');

test('opens from the keyboard and jumps to a screen', async ({ page }) => {
  const errors = watchForErrors(page);
  await startWithSampleData(page);

  await page.keyboard.press('ControlOrMeta+k');
  await expect(palette(page)).toBeVisible();
  await expect(palette(page).getByRole('combobox')).toBeFocused();

  await page.keyboard.type('tre');
  // Trends leads and is the highlighted row. Entries containing "tre" may
  // follow it, so the count is not asserted — only that nothing unrelated
  // outranks the screen you asked for.
  const first = palette(page).getByRole('option').first();
  await expect(first).toContainText('Trends');
  await expect(first).toHaveAttribute('aria-selected', 'true');
  await expect(palette(page).getByRole('option', { name: /Suggestions/ })).toHaveCount(0);
  await page.keyboard.press('Enter');

  await expect(palette(page)).toBeHidden();
  await expect(current(page)).toHaveText(/Trends/);
  expect(errors).toEqual([]);
});

test('opens from the sidebar, and Escape puts focus back on the button that opened it', async ({ page }) => {
  await startWithSampleData(page);

  const trigger = page.locator('aside').getByRole('button', { name: /Search or jump/ });
  await trigger.click();
  await expect(palette(page)).toBeVisible();

  await page.keyboard.press('Escape');
  await expect(palette(page)).toBeHidden();
  await expect(trigger).toBeFocused();

  // And the single-key shortcuts work again straight away.
  await page.keyboard.press('2');
  await expect(current(page)).toHaveText(/Ledger/);
});

test('finds an entry and opens the ledger on its day', async ({ page }) => {
  await seedLedger(page, baseState({
    entries: [
      { id: 'a', date: '2026-03-14', kind: 'expense', category: 'dining', title: 'Anniversary dinner', note: '', amount: 4200, createdAt: 1 },
      { id: 'b', date: '2026-05-02', kind: 'expense', category: 'transport', title: 'Cab home', note: '', amount: 300, createdAt: 2 },
    ],
  }));

  await page.keyboard.press('/');
  await expect(palette(page)).toBeVisible();
  await page.keyboard.type('anniv');

  const hit = palette(page).getByRole('option', { name: /Anniversary dinner/ });
  await expect(hit).toBeVisible();
  await hit.click();

  await expect(current(page)).toHaveText(/Ledger/);
  // The ledger is on that day, with that entry in it.
  await expect(page.locator('main')).toContainText('March 14');
  await expect(page.locator('main')).toContainText('Anniversary dinner');
});

test('does not open on top of another dialog', async ({ page }) => {
  await startWithSampleData(page);
  await page.locator('aside').getByRole('button', { name: 'New entry' }).click();
  await expect(page.getByRole('dialog')).toBeVisible();

  await page.keyboard.press('ControlOrMeta+k');
  await expect(palette(page)).toBeHidden();
  await expect(page.getByRole('dialog')).toHaveCount(1);
});

test('the selection highlight follows the screen you are on', async ({ page }) => {
  await startWithSampleData(page);
  const thumb = page.locator('aside nav .thumb');
  await expect(thumb).toBeVisible();

  const box = async (locator) => {
    const b = await locator.boundingBox();
    return { x: Math.round(b.x), y: Math.round(b.y), w: Math.round(b.width), h: Math.round(b.height) };
  };

  for (const name of ['Invest', 'Home', 'Settings']) {
    const item = page.locator('aside nav').getByRole('button', { name, exact: true });
    await item.click();
    // Polled: the highlight glides there rather than jumping.
    await expect.poll(async () => box(thumb), { timeout: 4000 }).toEqual(await box(item));
  }
});
