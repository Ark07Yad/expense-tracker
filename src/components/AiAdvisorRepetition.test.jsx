/**
 * @vitest-environment jsdom
 */

/**
 * Nothing stops a model repeating itself, and the answer lists were keyed by
 * their own text — two rows called "Cash" were two children with one key.
 * Rendering happened to survive it; React's reconciliation is not something to
 * leave resting on that.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import { parseAdvice } from '../lib/ai/prompt';
import { renderWithStore, seed } from '../test/render';

vi.mock('../lib/ai/providers', async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, listModels: vi.fn(async () => []), requestAdvice: vi.fn() };
});
const { default: AiAdvisor } = await import('./AiAdvisor');

/** A model that repeats itself — nothing stops one doing this. */
const repetitive = {
  summary: 'Two of each.',
  allocation: [
    { assetClass: 'Cash', targetPct: 30, why: 'Cushion' },
    { assetClass: 'Cash', targetPct: 20, why: 'Counted twice' },
    { assetClass: 'Bonds', targetPct: 50, why: 'Stability' },
  ],
  actions: [
    { title: 'Save more', detail: 'First reason', priority: 'now' },
    { title: 'Save more', detail: 'Second reason', priority: 'soon' },
  ],
  risks: ['Markets fall', 'Markets fall'],
  assumptions: [],
};

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  localStorage.setItem('cointrack.ai.v1', JSON.stringify({
    provider: 'ollama',
    lastByTopic: { investing: { advice: parseAdvice(JSON.stringify(repetitive), 'investing'), topic: 'investing', model: 'm', provider: 'ollama', at: Date.now() } },
  }));
  seed({});
});

describe('an answer that repeats itself', () => {
  it('shows every row, action and risk the model sent', () => {
    renderWithStore(<AiAdvisor onClose={() => {}} />);

    expect(screen.getByText('30%')).toBeInTheDocument();
    expect(screen.getByText('20%')).toBeInTheDocument();
    expect(screen.getAllByText('Cash')).toHaveLength(2);

    expect(screen.getAllByText('Save more')).toHaveLength(2);
    expect(screen.getByText('First reason')).toBeInTheDocument();
    expect(screen.getByText('Second reason')).toBeInTheDocument();

    expect(screen.getAllByText('Markets fall')).toHaveLength(2);
  });
});
