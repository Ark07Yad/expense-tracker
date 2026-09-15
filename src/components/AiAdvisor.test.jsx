/**
 * @vitest-environment jsdom
 */

/**
 * The AI advisor sheet. Network calls are mocked: what is pinned here is the
 * flow — nothing is sent before consent, what is sent is the reviewed summary,
 * keys are not remembered unless asked, and the answer always carries the
 * disclaimer.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, within } from '@testing-library/react';
import { parseAdvice } from '../lib/ai/prompt';
import { entry, renderWithStore, seed } from '../test/render';
import { monthKey, todayKey } from '../lib/calc';

vi.mock('../lib/ai/providers', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    listModels: vi.fn(async () => [{ id: 'llama3.2', label: 'llama3.2', free: true }]),
    requestAdvice: vi.fn(),
  };
});

const providers = await import('../lib/ai/providers');
const { default: AiAdvisor } = await import('./AiAdvisor');

const advice = {
  summary: 'You keep a healthy share of income.',
  allocation: [{ assetClass: 'Broad index funds', targetPct: 70, why: 'Long horizon' }, { assetClass: 'Bonds', targetPct: 30, why: 'Stability' }],
  actions: [{ title: 'Build a three-month cushion', detail: 'About 5,400', priority: 'now' }],
  risks: ['Markets can fall'],
  assumptions: ['Income stays steady'],
};

const day = (n) => `${monthKey(todayKey())}-${String(n).padStart(2, '0')}`;

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  providers.requestAdvice.mockReset();
  providers.listModels.mockClear();
});

describe('AiAdvisor', () => {
  it('sends only after consent, sends the reviewed summary, and shows the disclaimer', async () => {
    seed({ entries: [entry({ date: day(1), kind: 'earning', category: 'salary', title: 'Salary from Acme', amount: 4000 })] });
    providers.requestAdvice.mockResolvedValue({ advice: parseAdvice(JSON.stringify(advice)), model: 'llama3.2', provider: 'ollama', at: Date.now() });
    const onClose = vi.fn();
    const { user } = renderWithStore(<AiAdvisor onClose={onClose} />);

    const group = screen.getByRole('group', { name: 'Provider' });
    await user.click(within(group).getByRole('button', { name: /Ollama/ }));
    expect(screen.queryByLabelText(/^API key/)).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Load models' }));
    expect(await screen.findByDisplayValue('llama3.2')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Continue' }));

    await user.click(screen.getByRole('tab', { name: 'Growth' }));
    await user.click(screen.getByRole('button', { name: 'Continue' }));

    const preview = screen.getByLabelText('Data to be sent');
    expect(preview.textContent).toContain('"riskTolerance": "Growth"');
    expect(preview.textContent).not.toContain('Acme');

    const send = screen.getByRole('button', { name: /Send to Ollama/ });
    expect(send).toBeDisabled();
    await user.click(screen.getByRole('checkbox'));
    await user.click(send);

    expect(providers.requestAdvice).toHaveBeenCalledTimes(1);
    const args = providers.requestAdvice.mock.calls[0][0];
    expect(args.provider.id).toBe('ollama');
    expect(args.model).toBe('llama3.2');
    expect(args.summary.aboutMe.riskTolerance).toBe('Growth');

    expect(await screen.findByText('Build a three-month cushion')).toBeInTheDocument();
    expect(screen.getByRole('note')).toHaveTextContent(/subject to market risk/);
    expect(screen.getByText('70%')).toBeInTheDocument();
  });

  it('keeps a key for the session only, unless asked to remember it', async () => {
    seed({});
    const { user } = renderWithStore(<AiAdvisor onClose={() => {}} />);
    const group = screen.getByRole('group', { name: 'Provider' });
    await user.click(within(group).getByRole('button', { name: /Groq/ }));

    await user.type(screen.getByLabelText(/^API key/), 'gsk-secret');
    expect(localStorage.getItem('cointrack.ai.v1')).not.toContain('gsk-secret');
    expect(sessionStorage.getItem('cointrack.ai.keys')).toContain('gsk-secret');

    await user.click(screen.getByRole('checkbox', { name: /Remember keys/ }));
    expect(localStorage.getItem('cointrack.ai.v1')).toContain('gsk-secret');
  });

  it('shows what the model said when it did not answer in the expected format', async () => {
    seed({});
    providers.requestAdvice.mockImplementation(async () => parseAdvice('Sorry, I only chat about the weather.'));
    const { user } = renderWithStore(<AiAdvisor onClose={() => {}} />);

    await user.click(within(screen.getByRole('group', { name: 'Provider' })).getByRole('button', { name: /Ollama/ }));
    await user.type(screen.getByPlaceholderText('e.g. llama3.2'), 'tiny');
    await user.click(screen.getByRole('button', { name: 'Continue' }));
    await user.click(screen.getByRole('button', { name: 'Continue' }));
    await user.click(screen.getByRole('checkbox'));
    await user.click(screen.getByRole('button', { name: /Send to Ollama/ }));

    expect(await screen.findByText(/did not answer in the expected format/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /Show what the model said/ }));
    expect(screen.getByText('Sorry, I only chat about the weather.')).toBeInTheDocument();
  });

  it('reopens on the last answer instead of starting over', async () => {
    seed({});
    localStorage.setItem('cointrack.ai.v1', JSON.stringify({
      provider: 'groq', last: { advice: parseAdvice(JSON.stringify(advice)), model: 'm', provider: 'groq', at: Date.now() },
    }));
    renderWithStore(<AiAdvisor onClose={() => {}} />);
    expect(screen.getByText('Build a three-month cushion')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Ask again' })).toBeInTheDocument();
  });
});
