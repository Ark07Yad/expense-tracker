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
  expect: { timeout: 7_000 },

  use: {
    baseURL: 'http://localhost:4181',
    trace: 'retain-on-failure',
    video: 'off',
    screenshot: 'only-on-failure',
  },

  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],

  webServer: {
    command: 'npm run build && npx vite preview --port 4181 --strictPort',
    url: 'http://localhost:4181',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
