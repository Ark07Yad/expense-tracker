import { expect, test } from '@playwright/test';
import { baseState, go, seedLedger, watchForErrors } from './helpers';

/** See e2e/ai.spec.js for why the service worker is blocked. */
test.use({ serviceWorkers: 'block' });

const advice = {
  summary: 'You keep about half of what you earn, which is a strong position.',
  allocation: [{ assetClass: 'Broad index funds', targetPct: 100, why: 'Long horizon' }],
  actions: [{ title: 'Build a three-month cushion', detail: 'Before adding more.', priority: 'now' }],
  risks: ['Markets can fall'],
  assumptions: ['Income stays steady'],
};

/** An OpenAI-style event stream, one small delta per chunk. */
function sse(text) {
  const chunks = [];
  for (let i = 0; i < text.length; i += 40) {
    chunks.push(`data: ${JSON.stringify({ choices: [{ delta: { content: text.slice(i, i + 40) } }] })}\n\n`);
  }
  chunks.push('data: [DONE]\n\n');
  return chunks.join('');
}

test('streams the answer in, and renders it when it lands', async ({ page }) => {
  const errors = watchForErrors(page);
  let body = null;

  await page.route('https://openrouter.ai/api/v1/models', (route) =>
    route.fulfill({ json: { data: [{ id: 'acme/tiny:free', name: 'Tiny' }] } }));
  await page.route('https://openrouter.ai/api/v1/chat/completions', async (route) => {
    body = route.request().postDataJSON();
    await route.fulfill({
      status: 200,
      headers: { 'content-type': 'text/event-stream' },
      body: sse(JSON.stringify(advice)),
    });
  });

  const today = new Date();
  const month = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;
  await seedLedger(page, baseState({
    entries: [
      { id: 'a', date: `${month}-01`, kind: 'earning', category: 'salary', title: 'Salary', note: '', amount: 85000, createdAt: 1 },
      { id: 'b', date: `${month}-02`, kind: 'expense', category: 'housing', title: 'Rent', note: '', amount: 25000, createdAt: 2 },
    ],
    assets: [{ id: 'f', name: 'Fund', class: 'fund', note: '', createdAt: 1, history: { [month]: { contributed: 200, value: 9000 } } }],
  }));

  await go(page, 'Invest');
  await page.getByRole('button', { name: /Ask AI/ }).first().click();
  const sheet = page.getByRole('dialog');
  await sheet.getByLabel('API key').fill('sk-or-test');
  await sheet.getByRole('button', { name: 'Continue' }).click();
  await sheet.getByRole('button', { name: 'Continue' }).click();
  await sheet.getByRole('checkbox').check();
  await sheet.getByRole('button', { name: /Send to OpenRouter/ }).click();

  // The finished answer, parsed out of the stream.
  await expect(sheet.getByText('Build a three-month cushion')).toBeVisible();
  await expect(sheet.getByText('Suggested long-term mix')).toBeVisible();
  expect(body.stream).toBe(true);

  expect(errors).toEqual([]);
});

test('falls back cleanly when a provider ignores the stream flag', async ({ page }) => {
  await page.route('https://openrouter.ai/api/v1/models', (route) =>
    route.fulfill({ json: { data: [{ id: 'acme/tiny:free', name: 'Tiny' }] } }));
  await page.route('https://openrouter.ai/api/v1/chat/completions', (route) =>
    route.fulfill({ json: { choices: [{ message: { content: JSON.stringify(advice) }, finish_reason: 'stop' }] } }));

  await seedLedger(page, baseState({ entries: [] }));
  await go(page, 'Invest');
  await page.getByRole('button', { name: /Ask AI/ }).first().click();
  const sheet = page.getByRole('dialog');
  await sheet.getByLabel('API key').fill('sk-or-test');
  await sheet.getByRole('button', { name: 'Continue' }).click();
  await sheet.getByRole('button', { name: 'Continue' }).click();
  await sheet.getByRole('checkbox').check();
  await sheet.getByRole('button', { name: /Send to OpenRouter/ }).click();

  await expect(sheet.getByText('Build a three-month cushion')).toBeVisible();
});
