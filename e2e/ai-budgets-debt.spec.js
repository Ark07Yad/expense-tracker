import { expect, test } from '@playwright/test';
import { baseState, go, seedLedger, watchForErrors } from './helpers';

/** See e2e/ai.spec.js for why the service worker is blocked. */
test.use({ serviceWorkers: 'block' });

const routeModels = (page) =>
  page.route('https://openrouter.ai/api/v1/models', (route) =>
    route.fulfill({ json: { data: [{ id: 'acme/tiny:free', name: 'Tiny' }] } }));

const routeChat = (page, payload, sent = []) =>
  page.route('https://openrouter.ai/api/v1/chat/completions', async (route) => {
    sent.push(route.request());
    await route.fulfill({ json: { choices: [{ message: { content: JSON.stringify(payload) }, finish_reason: 'stop' }] } });
  });

const month = (() => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
})();

const ledger = (over = {}) => ({
  ...baseState({
    profile: { monthlyIncome: 85000, budgets: { dining: 4000 } },
    entries: [
      { id: 'a', date: `${month}-01`, kind: 'earning', category: 'salary', title: 'Salary from Acme Corp', note: '', amount: 85000, createdAt: 1 },
      { id: 'b', date: `${month}-02`, kind: 'expense', category: 'housing', title: 'Rent to Mr Kelly', note: '', amount: 25000, createdAt: 2 },
      { id: 'c', date: `${month}-03`, kind: 'expense', category: 'dining', title: 'Dinner at Bombay Canteen', note: '', amount: 6000, createdAt: 3 },
    ],
  }),
  ...over,
});

test('asks about budgets from Settings', async ({ page }) => {
  const errors = watchForErrors(page);
  const sent = [];
  await routeModels(page);
  await routeChat(page, {
    summary: 'Dining is the only cap worth tightening.',
    caps: [{ category: 'Food & Dining', monthlyCap: 5000, why: 'Just above your usual 4,800' }],
    actions: [{ title: 'Leave rent uncapped', detail: 'It is fixed by your lease.', priority: 'later' }],
    risks: [], assumptions: [],
  }, sent);

  await seedLedger(page, ledger());
  await go(page, 'Settings');

  const box = page.getByRole('region', { name: 'Budget suggestions' });
  await box.getByRole('button', { name: /Ask AI/ }).click();

  const sheet = page.getByRole('dialog');
  await expect(sheet.getByRole('heading', { name: 'Ask AI about budgets' })).toBeVisible();
  await sheet.getByLabel('API key').fill('sk-or-test');
  await sheet.getByRole('button', { name: 'Continue' }).click();
  await sheet.getByRole('button', { name: 'Continue' }).click();

  await expect(sheet.getByLabel('Data to be sent')).toContainText('"topic": "budgets"');
  await expect(sheet.getByLabel('Data to be sent')).toContainText('categoriesWithNoCap');
  await sheet.getByRole('checkbox').check();
  await sheet.getByRole('button', { name: /Send to OpenRouter/ }).click();

  await expect(sheet.getByText('Suggested budgets')).toBeVisible();
  await expect(sheet.getByText('Leave rent uncapped')).toBeVisible();
  await expect(sheet.getByRole('note')).toContainText('fixed by contract');

  const body = sent[0].postDataJSON();
  expect(body.messages[0].content).toContain('guidance on setting monthly budgets');
  const dump = JSON.stringify(body);
  for (const secret of ['Acme', 'Kelly', 'Bombay Canteen']) expect(dump).not.toContain(secret);

  expect(errors).toEqual([]);
});

test('asks about debts from the What you owe card', async ({ page }) => {
  const errors = watchForErrors(page);
  const sent = [];
  await routeModels(page);
  await routeChat(page, {
    summary: 'The card costs the most.',
    plan: [{ debt: 'Credit card', monthlyAmount: 8000, why: 'Highest rate, clears in 10 months' }],
    actions: [{ title: 'Keep the mortgage at its minimum', detail: 'It is the cheapest debt you hold.', priority: 'now' }],
    risks: ['Rates can change'], assumptions: ['Payments stay affordable'],
  }, sent);

  await seedLedger(page, ledger({
    debts: [
      { id: 'd1', name: 'HDFC card ending 8891', class: 'card', rate: 34.9, note: '', createdAt: 1, history: { [month]: { paid: 3000, balance: 60000 } } },
      { id: 'd2', name: 'Home loan with SBI', class: 'mortgage', rate: 8.5, note: '', createdAt: 2, history: { [month]: { paid: 22000, balance: 3400000 } } },
    ],
  }));

  await go(page, 'Invest');
  const card = page.locator('main .surface').filter({ has: page.getByRole('heading', { name: 'What you owe' }) }).first();
  await card.getByRole('button', { name: /Ask AI/ }).click();

  const sheet = page.getByRole('dialog');
  await expect(sheet.getByRole('heading', { name: 'Ask AI about what you owe' })).toBeVisible();
  await sheet.getByLabel('API key').fill('sk-or-test');
  await sheet.getByRole('button', { name: 'Continue' }).click();
  await sheet.getByRole('button', { name: 'Continue' }).click();

  const preview = sheet.getByLabel('Data to be sent');
  await expect(preview).toContainText('"topic": "debt"');
  await expect(preview).toContainText('"annualInterestPct": 34.9');
  await sheet.getByRole('checkbox').check();
  await sheet.getByRole('button', { name: /Send to OpenRouter/ }).click();

  await expect(sheet.getByText('Suggested monthly payments')).toBeVisible();
  await expect(sheet.getByText('Keep the mortgage at its minimum')).toBeVisible();
  await expect(sheet.getByRole('note')).toContainText('free debt advice service');

  const body = sent[0].postDataJSON();
  expect(body.messages[0].content).toContain('guidance on paying down debt');
  const dump = JSON.stringify(body);
  // Debt types travel; the names people give their lenders do not.
  expect(dump).toContain('Credit card');
  for (const secret of ['HDFC', '8891', 'SBI', 'Acme']) expect(dump).not.toContain(secret);

  expect(errors).toEqual([]);
});
