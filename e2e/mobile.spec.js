import { expect, test } from '@playwright/test';
import { startWithSampleData, watchForErrors } from './helpers';

/**
 * The phone layout.
 *
 * Every other journey runs at desktop size, where the tab bar and the + button
 * are hidden — so nothing else would notice if the phone's own furniture broke.
 */

test.use({ viewport: { width: 375, height: 812 }, hasTouch: true });

const bar = (page) => page.locator('nav.fixed');

test('the tab bar moves between screens and marks the current one', async ({ page }) => {
  const errors = watchForErrors(page);
  await startWithSampleData(page);

  for (const name of ['Trends', 'Invest', 'Ledger']) {
    const item = bar(page).getByRole('button', { name, exact: true });
    await item.click();
    await expect(item).toHaveAttribute('aria-current', 'page');

    // The ink rule sits centred over the current item.
    await expect
      .poll(async () => {
        const [rule, it] = await Promise.all([bar(page).locator('.thumb').boundingBox(), item.boundingBox()]);
        return Math.round(Math.abs(rule.x + rule.width / 2 - (it.x + it.width / 2)));
      }, { timeout: 4000 })
      .toBeLessThanOrEqual(1);
  }
  expect(errors).toEqual([]);
});

test('every tab target is big enough to hit with a thumb', async ({ page }) => {
  await startWithSampleData(page);
  for (const button of await bar(page).getByRole('button').all()) {
    const box = await button.boundingBox();
    expect(box.width, await button.textContent()).toBeGreaterThanOrEqual(44);
    expect(box.height, await button.textContent()).toBeGreaterThanOrEqual(44);
  }
  const plus = page.getByRole('button', { name: 'New entry' });
  const box = await plus.boundingBox();
  expect(box.width).toBeGreaterThanOrEqual(44);
});

test('the + button opens the composer as a sheet with a handle', async ({ page }) => {
  await startWithSampleData(page);
  await page.getByRole('button', { name: 'New entry' }).click();
  const sheet = page.getByRole('dialog');
  await expect(sheet).toBeVisible();
  await expect(sheet.getByText('New entry', { exact: true })).toBeVisible();
});

test('the last thing on a screen can be scrolled clear of the + button and the bar', async ({ page }) => {
  await startWithSampleData(page);
  for (const name of ['Home', 'Ledger', 'Trends', 'Invest']) {
    await bar(page).getByRole('button', { name, exact: true }).click();

    // Scroll until the bottom stops moving. A long screen is still laying out
    // when it first appears; one scroll lands on a bottom that then moves away.
    await expect
      .poll(() =>
        page.evaluate(() => {
          window.scrollTo(0, document.documentElement.scrollHeight);
          return Math.round(document.documentElement.scrollHeight - window.innerHeight - window.scrollY);
        }), { timeout: 5000 })
      .toBeLessThanOrEqual(1);
    await page.waitForTimeout(400);
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));

    const measures = await page.evaluate(() => {
      const main = document.querySelector('main');
      const kids = [...main.querySelectorAll(':scope > * > *, :scope > *')].filter((el) => el.getBoundingClientRect().height > 0);
      const lastBottom = Math.max(...kids.map((el) => el.getBoundingClientRect().bottom));
      const plus = document.querySelector('button[aria-label="New entry"]').getBoundingClientRect().top;
      const barTop = document.querySelector('nav.fixed').getBoundingClientRect().top;
      return { lastBottom, plus, barTop, sideways: document.documentElement.scrollWidth > window.innerWidth };
    });
    expect(measures.sideways, `${name} scrolls sideways`).toBe(false);
    expect(measures.lastBottom, `${name}: content ends under the + button`).toBeLessThanOrEqual(measures.plus + 1);
    expect(measures.lastBottom, `${name}: content ends under the bar`).toBeLessThanOrEqual(measures.barTop + 1);
  }
});
