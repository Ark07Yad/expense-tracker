import { defineConfig, devices } from '@playwright/test';

/**
 * End-to-end tests.
 *
 * These run against the **built** app served by `vite preview`, not the dev
 * server. The whole point of an end-to-end test is to exercise the artefact
 * that actually ships — the code-split chunks, the generated headers and the
 * service worker are all things that exist only in a production build, and two
 * of them have already been the subject of real bugs.
 *
 * Each test gets a fresh browser context, so storage, service workers and
 * caches start empty. That matters more than usual for an app whose entire
 * state lives in the browser: without it, the first test's ledger would be the
 * second test's starting position.
 */
export default defineConfig({
  testDir: './e2e',
  // Journeys touch storage and service workers; running them in parallel inside
  // one browser is asking for interference that looks like a product bug.
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'line' : [['list']],
  timeout: 30_000,
  expect: {
    timeout: 7_000,
    // Same machine image every run, so allow almost nothing: 0.1% of pixels.
    toHaveScreenshot: { maxDiffPixelRatio: 0.001, animations: 'disabled', caret: 'hide' },
  },

  use: {
    baseURL: 'http://localhost:4181',
    trace: 'retain-on-failure',
    video: 'off',
    screenshot: 'only-on-failure',
  },

  /*
   * Three engines, because the bugs this suite is meant to catch are
   * engine-specific by nature. The export code guards against a Firefox quirk
   * that Chromium never exhibits, IndexedDB and service workers behave
   * differently in WebKit, and a CSS or focus regression in one engine is
   * invisible in the others.
   */
  projects: [
    { name: 'chromium', testIgnore: /visual\.spec/, use: { ...devices['Desktop Chrome'] } },
    { name: 'firefox', testIgnore: /visual\.spec/, use: { ...devices['Desktop Firefox'] } },
    { name: 'webkit', testIgnore: /visual\.spec/, use: { ...devices['Desktop Safari'] } },
    /*
     * Screenshot comparisons, in one engine only: they catch layout and theme
     * breakage, which the three projects above already test for behaviour.
     * Baselines are Linux renders from the Playwright Docker image (see the
     * Visual job in ci.yml), so the spec skips on any other OS.
     */
    { name: 'visual', testMatch: /visual\.spec/, use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 800 } } },
  ],

  webServer: {
    // CI has already built in the previous job's checkout, but each job starts
    // clean, so the build stays part of the command rather than being assumed.
    command: 'npm run build && npx vite preview --port 4181 --strictPort',
    url: 'http://localhost:4181',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
