import { expect, test } from '@playwright/test';
import { baseState, go, seedLedger, watchForErrors } from './helpers';

/**
 * Ask AI, end to end, with the provider intercepted.
 *
 * The one journey in the app that sends data off the device, so it asserts on
 * the request itself: the key goes only in the Authorization header, and the
 * body carries the summary without any entry title or holding name.
 */

/*
 * With the app's service worker in control, WebKit sends page requests through
 * it and Playwright's route interception never sees them — the test then talks
 * to the real OpenRouter. The worker only handles same-origin GETs, so blocking
 * it here changes nothing about the journey itself.
 */
test.use({ serviceWorkers: 'block' });

const advice = {
  summary: 'You keep about half of what you earn.',
  allocation: [{ assetClass: 'Broad index funds', targetPct: 80, why: 'Long horizon' }, { assetClass: 'Cash', targetPct: 20, why: 'Cushion' }],
  actions: [{ title: 'Build a three-month cushion', detail: 'Before adding to equity.', priority: 'now' }],
  risks: ['Markets can fall'],
  assumptions: ['Income stays steady'],
};

test('asks a free OpenRouter model and shows guidance under the disclaimer', async ({ page }) => {
  const errors = watchForErrors(page);
  const sent = [];

  await page.route('https://openrouter.ai/api/v1/models', (route) =>
    route.fulfill({ json: { data: [{ id: 'acme/tiny:free', name: 'Tiny' }, { id: 'acme/big', name: 'Big' }] } }));
  await page.route('https://openrouter.ai/api/v1/chat/completions', async (route) => {
    sent.push(route.request());
    await route.fulfill({ json: { choices: [{ message: { content: JSON.stringify(advice) }, finish_reason: 'stop' }] } });
  });

  const today = new Date();
  const month = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;
  await seedLedger(page, baseState({
    profile: { currency: 'EUR' },
    entries: [
      { id: 'a', date: `${month}-01`, kind: 'earning', category: 'salary', title: 'Salary from Acme Corp', note: '', amount: 4000, createdAt: 1 },
      { id: 'b', date: `${month}-02`, kind: 'expense', category: 'housing', title: 'Rent to Mr Kelly', note: '', amount: 1500, createdAt: 2 },
    ],
    assets: [{ id: 'f', name: 'Secret Fund', class: 'fund', note: '', createdAt: 1, history: { [month]: { contributed: 200, value: 9000 } } }],
  }));

  await go(page, 'Invest');
  await page.getByRole('button', { name: /Ask AI/ }).click();
  const sheet = page.getByRole('dialog');

  await sheet.getByRole('group', { name: 'Provider' }).getByRole('button', { name: /OpenRouter/ }).click();
  await expect(sheet.getByLabel('Model')).toHaveValue('acme/tiny:free');
  await sheet.getByLabel('API key').fill('sk-or-test');
  await sheet.getByRole('button', { name: 'Continue' }).click();

  await sheet.getByRole('tab', { name: 'Growth' }).click();
  await sheet.getByRole('button', { name: 'Continue' }).click();

  await expect(sheet.getByLabel('Data to be sent')).toContainText('"currency": "EUR"');
  await sheet.getByRole('checkbox').check();
  await sheet.getByRole('button', { name: /Send to OpenRouter/ }).click();

  await expect(sheet.getByRole('note')).toContainText('subject to market risk');
  await expect(sheet.getByText('Build a three-month cushion')).toBeVisible();

  expect(sent).toHaveLength(1);
  const request = sent[0];
  expect(request.headers().authorization).toBe('Bearer sk-or-test');
  const body = request.postDataJSON();
  expect(body.model).toBe('acme/tiny:free');
  const dump = JSON.stringify(body);
  for (const secret of ['Acme', 'Kelly', 'Secret Fund', 'sk-or-test']) expect(dump).not.toContain(secret);

  expect(errors).toEqual([]);
});
