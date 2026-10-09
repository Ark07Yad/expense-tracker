import { expect, test } from '@playwright/test';
import { go, startWithSampleData } from './helpers';

/**
 * The interaction layer: focus ring, skip link, the gliding highlight and the
 * pointer spotlight.
 *
 * All of it is enhancement, so the tests that matter most are the ones about
 * what happens when it is *not* wanted — reduced motion, and a keyboard with no
 * pointer at all.
 */

const sameBox = async (a, b) => {
  const [x, y] = await Promise.all([a.boundingBox(), b.boundingBox()]);
  const round = (r) => ({ x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) });
  return JSON.stringify(round(x)) === JSON.stringify(round(y));
};

test('keyboard focus is drawn in the brand colour, not the browser default', async ({ page }) => {
  await startWithSampleData(page);

  // A key press first, so the browser treats what follows as keyboard use.
  await page.keyboard.press('Tab');
  const ledger = page.locator('aside nav').getByRole('button', { name: 'Ledger', exact: true });
  await ledger.focus();

  const read = () =>
    ledger.evaluate((el) => {
      const cs = getComputedStyle(el);
      const brand = getComputedStyle(document.documentElement).getPropertyValue('--tone-brand').trim();
      // Resolve the token the same way the browser resolved the outline.
      const probe = document.createElement('span');
      probe.style.color = brand;
      document.body.appendChild(probe);
      const expected = getComputedStyle(probe).color;
      probe.remove();
      return { visible: el.matches(':focus-visible'), style: cs.outlineStyle, width: cs.outlineWidth, color: cs.outlineColor, expected };
    });

  const ring = await read();
  expect(ring.visible).toBe(true);
  expect(ring.style).toBe('solid');
  expect(ring.width).toBe('2px');
  // Polled: these buttons transition their colours, the outline's included, so
  // the ring fades from the text colour to the brand colour over ~150ms.
  await expect.poll(async () => (await read()).color).toBe(ring.expected);
});

test('anything you can press shows a pointer', async ({ page }) => {
  await startWithSampleData(page);
  const cursor = (locator) => locator.evaluate((el) => getComputedStyle(el).cursor);
  expect(await cursor(page.locator('aside nav').getByRole('button', { name: 'Ledger', exact: true }))).toBe('pointer');
  await go(page, 'Trends');
  expect(await cursor(page.locator('main').getByRole('tab', { name: 'Year', exact: true }))).toBe('pointer');
});

test('a mouse click does not leave a focus ring behind', async ({ page }) => {
  await startWithSampleData(page);
  const trends = page.locator('aside nav').getByRole('button', { name: 'Trends', exact: true });
  await trends.click();
  expect(await trends.evaluate((el) => el.matches(':focus-visible'))).toBe(false);
});

test('the skip link appears on focus and moves focus into the content', async ({ page }) => {
  await startWithSampleData(page);
  const skip = page.getByRole('link', { name: 'Skip to content' });

  // Off screen until it is focused.
  expect((await skip.boundingBox()).y).toBeLessThan(0);

  await page.keyboard.press('Tab');
  await skip.focus();
  await expect.poll(async () => (await skip.boundingBox()).y).toBeGreaterThanOrEqual(0);

  await page.keyboard.press('Enter');
  await expect(page.locator('#main')).toBeFocused();
});

test('the tab highlight sits exactly on the selected tab', async ({ page }) => {
  await startWithSampleData(page);
  await go(page, 'Trends');

  const tabs = page.locator('main').getByRole('tablist').first();
  const thumb = tabs.locator('.thumb');
  for (const name of ['Year', 'Week', 'Quarter']) {
    const tab = tabs.getByRole('tab', { name, exact: true });
    await tab.click();
    await expect(tab).toHaveAttribute('aria-selected', 'true');
    await expect.poll(() => sameBox(thumb, tab), { timeout: 4000 }).toBe(true);
  }
});

test('a card follows the pointer with its spotlight', async ({ page }) => {
  await startWithSampleData(page);
  const card = page.locator('[data-spot]').first();
  const box = await card.boundingBox();
  await page.mouse.move(box.x + 60, box.y + 40);
  await page.mouse.move(box.x + 120, box.y + 50);
  await expect.poll(() => card.evaluate((el) => el.style.getPropertyValue('--mx'))).toBe('120px');
});

test.describe('with reduced motion', () => {
  test('nothing follows the pointer, and the highlight still lands in the right place', async ({ page }) => {
    // Before the app loads: it decides whether to listen at all when it mounts.
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await startWithSampleData(page);
    expect(await page.evaluate(() => matchMedia('(prefers-reduced-motion: reduce)').matches)).toBe(true);

    const card = page.locator('[data-spot]').first();
    const box = await card.boundingBox();
    await page.mouse.move(box.x + 60, box.y + 40);
    await page.mouse.move(box.x + 120, box.y + 50);
    // Give a listener every chance to fire, if one had been installed.
    await page.waitForTimeout(250);
    expect(await card.evaluate((el) => el.style.getPropertyValue('--mx'))).toBe('');

    // The selection is still shown — it just arrives without the glide.
    const item = page.locator('aside nav').getByRole('button', { name: 'Invest', exact: true });
    await item.click();
    await expect.poll(() => sameBox(page.locator('aside nav .thumb'), item), { timeout: 4000 }).toBe(true);
    await expect(page.locator('main')).toContainText(/What you own and owe/);
  });
});
