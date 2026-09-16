import { expect, test } from '@playwright/test';
import { baseState, go, seedLedger, watchForErrors } from './helpers';

/** See e2e/ai.spec.js for why the service worker is blocked. */
test.use({ serviceWorkers: 'block' });

const spendingAdvice = {
  summary: 'Dining is the mover this month.',
  caps: [{ category: 'Food & Dining', monthlyCap: 12000, why: 'Just above your usual' }],
  actions: [{ title: 'Cap dining at 12,000', detail: 'That frees about 3,000 a month.', priority: 'soon' }],
  risks: ['One month is a small sample'],
  assumptions: ['Rent stays as it is'],
};

test('asks about spending from the Trends suggestion box', async ({ page }) => {
  const errors = watchForErrors(page);
  const sent = [];

  await page.route('https://openrouter.ai/api/v1/models', (route) =>
    route.fulfill({ json: { data: [{ id: 'acme/tiny:free', name: 'Tiny' }] } }));
  await page.route('https://openrouter.ai/api/v1/chat/completions', async (route) => {
    sent.push(route.request());
    await route.fulfill({ json: { choices: [{ message: { content: JSON.stringify(spendingAdvice) }, finish_reason: 'stop' }] } });
  });

  const today = new Date();
  const month = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;
  await seedLedger(page, baseState({
    entries: [
      { id: 'a', date: `${month}-01`, kind: 'earning', category: 'salary', title: 'Salary from Acme Corp', note: '', amount: 85000, createdAt: 1 },
      { id: 'b', date: `${month}-02`, kind: 'expense', category: 'housing', title: 'Rent to Mr Kelly', note: '', amount: 25000, createdAt: 2 },
      { id: 'c', date: `${month}-03`, kind: 'expense', category: 'dining', title: 'Dinner at Bombay Canteen', note: '', amount: 15000, createdAt: 3 },
    ],
  }));

  await go(page, 'Trends');
  const box = page.getByRole('region', { name: 'Spending suggestions' });
  await box.getByRole('button', { name: /Ask AI/ }).click();

  const sheet = page.getByRole('dialog');
  await expect(sheet.getByRole('heading', { name: 'Ask AI about spending' })).toBeVisible();
  await sheet.getByLabel('API key').fill('sk-or-test');
  await sheet.getByRole('button', { name: 'Continue' }).click();

  // Spending asks about the household, not about risk tolerance.
  await expect(sheet.getByLabel('Who does this money support?')).toBeVisible();
  await expect(sheet.getByText('How do you feel about risk?')).toBeHidden();
  await sheet.getByLabel('Who does this money support?').selectOption('Family with children');
  await sheet.getByRole('button', { name: 'Continue' }).click();

  await expect(sheet.getByLabel('Data to be sent')).toContainText('"topic": "spending"');
  await sheet.getByRole('checkbox').check();
  await sheet.getByRole('button', { name: /Send to OpenRouter/ }).click();

  await expect(sheet.getByText('Suggested monthly caps')).toBeVisible();
  await expect(sheet.getByText('Cap dining at 12,000')).toBeVisible();
  await expect(sheet.getByRole('note')).toContainText('cannot know what a category was for');

  const body = sent[0].postDataJSON();
  expect(body.messages[0].content).toContain("guidance on someone's spending");
  const dump = JSON.stringify(body);
  for (const secret of ['Acme', 'Kelly', 'Bombay Canteen']) expect(dump).not.toContain(secret);
  expect(dump).toContain('Family with children');

  expect(errors).toEqual([]);
});

test('asks about savings from the same box', async ({ page }) => {
  await page.route('https://openrouter.ai/api/v1/models', (route) =>
    route.fulfill({ json: { data: [{ id: 'acme/tiny:free', name: 'Tiny' }] } }));
  await page.route('https://openrouter.ai/api/v1/chat/completions', (route) =>
    route.fulfill({ json: { choices: [{ message: { content: JSON.stringify({
      summary: 'You keep a lot.',
      split: [{ purpose: 'Emergency cushion', monthlyAmount: 30000, why: 'Two months short' }],
      actions: [{ title: 'Move it on payday', detail: 'Standing order.', priority: 'now' }],
      risks: [], assumptions: [],
    }) }, finish_reason: 'stop' }] } }));

  const today = new Date();
  const month = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;
  await seedLedger(page, baseState({
    entries: [
      { id: 'a', date: `${month}-01`, kind: 'earning', category: 'salary', title: 'Salary', note: '', amount: 85000, createdAt: 1 },
      { id: 'b', date: `${month}-02`, kind: 'expense', category: 'housing', title: 'Rent', note: '', amount: 25000, createdAt: 2 },
    ],
  }));

  await go(page, 'Trends');
  const box = page.getByRole('region', { name: 'Spending suggestions' });
  await box.getByRole('tab', { name: 'Savings' }).click();
  await page.getByRole('region', { name: 'Savings suggestions' }).getByRole('button', { name: /Ask AI/ }).click();

  const sheet = page.getByRole('dialog');
  await expect(sheet.getByRole('heading', { name: 'Ask AI about saving' })).toBeVisible();
  await sheet.getByLabel('API key').fill('sk-or-test');
  await sheet.getByRole('button', { name: 'Continue' }).click();
  await sheet.getByRole('button', { name: 'Continue' }).click();
  await expect(sheet.getByLabel('Data to be sent')).toContainText('"topic": "saving"');
  await sheet.getByRole('checkbox').check();
  await sheet.getByRole('button', { name: /Send to OpenRouter/ }).click();

  await expect(sheet.getByText("Where each month's savings could go")).toBeVisible();
  await expect(sheet.getByText('Emergency cushion')).toBeVisible();
});
