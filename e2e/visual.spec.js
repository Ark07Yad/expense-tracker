import { expect, test } from '@playwright/test';
import { go, startWithSampleData } from './helpers';

/**
 * Screenshot comparisons: the layout breakage no other test sees.
 *
 * Every other test asks "is this text there, does this button work". None of
 * them notice a chart pushed off its card, a header that wraps, a rule that
 * vanished or a theme token pointing at the wrong colour — and after three
 * redesigns, that is the kind of regression most likely to slip through.
 *
 * Determinism is the whole game:
 *   - the clock is frozen, so dates, the sample data built back from "today"
 *     and the greeting are identical on every run;
 *   - fonts are bundled (no network font that may or may not arrive), and the
 *     shot waits for them;
 *   - motion is reduced and animations are finished before the shot;
 *   - baselines are rendered on Linux, in the Playwright Docker image CI uses,
 *     because font rasterising differs between operating systems. On anything
 *     else the spec skips rather than fail against pixels it cannot match.
 *
 * To accept an intended change, run the "Update visual baselines" workflow and
 * commit the images it produces (see PROJECT.md).
 */

const SCREENS = ['Home', 'Ledger', 'Trends', 'Invest', 'Advice', 'Settings'];
const NOW = new Date('2026-10-15T09:30:00Z');

const SHOT = { fullPage: true };

test.skip(process.platform !== 'linux', 'baselines are rendered on Linux; run them in CI');
test.use({ reducedMotion: 'reduce', timezoneId: 'UTC', locale: 'en-GB' });

/** Wait until nothing on the page is still moving, loading or measuring. */
async function settle(page) {
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.evaluate(() => document.fonts.ready);
  await page.waitForFunction(() => document.getAnimations().every((a) => a.playState !== 'running'));
  // Recharts sizes itself from a ResizeObserver a frame after mount.
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
  await expect(page.getByRole('status')).toHaveCount(0);
}

async function open(page) {
  await page.clock.setFixedTime(NOW);
  await startWithSampleData(page);
  // The "sample data loaded" toast is transient; let it go before any shot.
  await expect(page.getByRole('status')).toHaveCount(0, { timeout: 10_000 });
}

async function useDark(page) {
  const toggle = page.locator('aside').getByRole('button', { name: /^Theme:/ });
  for (let i = 0; i < 3 && !(await toggle.getAttribute('aria-label')).startsWith('Theme: Dark'); i++) await toggle.click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
}

for (const theme of ['light', 'dark']) {
  test(`every screen, ${theme}`, async ({ page }) => {
    await open(page);
    if (theme === 'dark') await useDark(page);
    for (const screen of SCREENS) {
      await go(page, screen);
      await expect(page.locator('main h1').first()).toBeVisible();
      await settle(page);
      await expect(page, `${screen} (${theme})`).toHaveScreenshot(`${theme}-${screen.toLowerCase()}.png`, SHOT);
    }
  });
}

test('phone layout', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await open(page);
  await settle(page);
  await expect(page).toHaveScreenshot('phone-home.png', SHOT);

  await page.locator('nav.fixed').getByRole('button', { name: 'Ledger', exact: true }).click();
  await expect(page.locator('main h1').first()).toBeVisible();
  await settle(page);
  await expect(page).toHaveScreenshot('phone-ledger.png', SHOT);
});

test('onboarding', async ({ page }) => {
  await page.clock.setFixedTime(NOW);
  await page.goto('/');
  await expect(page.getByRole('button', { name: /sample data first/ })).toBeVisible();
  await settle(page);
  await expect(page).toHaveScreenshot('onboarding.png', SHOT);
});
