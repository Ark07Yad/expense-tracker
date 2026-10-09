import { expect, test } from '@playwright/test';
import { go, startWithSampleData, watchForErrors } from './helpers';

/**
 * Charts draw in and morph — and do neither when the person has asked for less
 * motion.
 *
 * The check is deliberately crude: sample a shape's geometry on every frame for
 * a moment and count how many different values it took. An animation passes
 * through dozens of in-between shapes; a chart that is simply drawn has one.
 * That holds whatever the chart library does internally.
 */

/** Distinct values of an attribute on the first matching element, over time. */
const sample = (page, selector, attribute, ms = 1100) =>
  page.evaluate(
    ({ selector, attribute, ms }) =>
      new Promise((resolve) => {
        const seen = new Set();
        const started = performance.now();
        const tick = () => {
          const el = document.querySelector(selector);
          if (el) seen.add(el.getAttribute(attribute));
          if (performance.now() - started < ms) requestAnimationFrame(tick);
          else resolve(seen.size);
        };
        requestAnimationFrame(tick);
      }),
    { selector, attribute, ms }
  );

const BAR = 'main .recharts-bar-rectangle path, main .recharts-bar-rectangle rect';
const AREA = 'main .recharts-area-area';

test('bars travel to their new heights when the period changes', async ({ page }) => {
  const errors = watchForErrors(page);
  await startWithSampleData(page);
  await go(page, 'Trends');
  await expect(page.locator(BAR).first()).toBeVisible();

  // Let the arrival animation finish, so what is measured next is the morph.
  await page.waitForTimeout(1200);
  await page.locator('main').getByRole('tab', { name: 'Year', exact: true }).click();

  const shapes = await sample(page, BAR, await page.locator(BAR).first().evaluate((el) => (el.tagName === 'path' ? 'd' : 'height')));
  expect(shapes).toBeGreaterThan(4);
  expect(errors).toEqual([]);
});

test('an area chart draws in on arrival', async ({ page }) => {
  await startWithSampleData(page);
  await page.locator('aside').getByRole('button', { name: 'Invest', exact: true }).click();
  await page.locator(AREA).first().waitFor({ state: 'attached' });

  // An area is not redrawn as it arrives — its outline is fixed, and a clip
  // widens across it. So the thing that moves is the clip, not the path.
  const CLIP = 'main .recharts-area clipPath rect, main .recharts-layer clipPath[id*="animation"] rect';
  const found = await page.locator(CLIP).count();
  expect(found, 'the arrival clip should exist while the chart draws in').toBeGreaterThan(0);
  expect(await sample(page, CLIP, 'width')).toBeGreaterThan(4);
});

test('hand-drawn charts animate too: the ledger strip rises in', async ({ page }) => {
  await startWithSampleData(page);
  await go(page, 'Ledger');
  const bar = page.locator('main .grow-y').first();
  await expect(bar).toBeVisible();
  const motion = await bar.evaluate((el) => {
    const cs = getComputedStyle(el);
    return { name: cs.animationName, seconds: parseFloat(cs.animationDuration) };
  });
  expect(motion.name).toBe('grow-y');
  expect(motion.seconds).toBeGreaterThan(0.3);
});

test.describe('with reduced motion', () => {
  test('charts are simply there', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await startWithSampleData(page);
    await go(page, 'Trends');
    await expect(page.locator(BAR).first()).toBeVisible();
    await page.waitForTimeout(300);

    await page.locator('main').getByRole('tab', { name: 'Year', exact: true }).click();
    // One shape before the data arrives and one after, at most. Never a tween.
    const attribute = await page.locator(BAR).first().evaluate((el) => (el.tagName === 'path' ? 'd' : 'height'));
    expect(await sample(page, BAR, attribute)).toBeLessThanOrEqual(2);

    await go(page, 'Ledger');
    const seconds = await page.locator('main .grow-y').first().evaluate((el) => parseFloat(getComputedStyle(el).animationDuration));
    expect(seconds).toBeLessThan(0.01);
  });
});
