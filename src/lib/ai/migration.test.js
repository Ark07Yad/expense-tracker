/**
 * @vitest-environment jsdom
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { loadAiConfig } from './config';
import { buildAdviceSummary, defaultAnswers } from './summary';

beforeEach(() => { localStorage.clear(); sessionStorage.clear(); });

describe('settings written by an older version', () => {
  it('survives the single-focus format from before topics existed', () => {
    // 15 Sep shape: focus was one string, and `last` was one answer.
    localStorage.setItem('cointrack.ai.v1', JSON.stringify({
      provider: 'groq',
      remember: true,
      keys: { groq: 'k' },
      answers: { ageBand: '35–44', horizon: 'medium', risk: 'cautious', focus: 'cushion', region: 'Ireland' },
      last: { advice: { summary: 'old' }, model: 'm', provider: 'groq', at: 1 },
    }));

    const config = loadAiConfig();
    expect(config.lastByTopic.investing).toBeTruthy();
    expect(typeof config.answers.focus, 'focus must be a map of topic -> choice').toBe('object');
    expect(config.answers.focus.spending).toBe(defaultAnswers().focus.spending);
    // The old choice is not nonsense for investing, so it should survive.
    expect(config.answers.focus.investing).toBe('cushion');
  });

  it('still builds a summary from those answers', () => {
    localStorage.setItem('cointrack.ai.v1', JSON.stringify({
      answers: { focus: 'cushion', region: 'Ireland' },
    }));
    const state = { profile: { currency: 'EUR', budgets: {}, savingsTargetPct: 20 }, entries: [], assets: [], debts: [], goals: [], recurring: [] };
    const out = buildAdviceSummary(state, loadAiConfig().answers, 'spending');
    expect(out.aboutMe.mainFocus).toBeTruthy();
  });
});
