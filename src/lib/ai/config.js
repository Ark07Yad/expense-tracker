/**
 * AI settings: which provider, which model, and the person's own key.
 *
 * Kept apart from the ledger on purpose. It is not part of the app state, so
 * it never lands in a backup export, never syncs to another tab's state, and a
 * key typed here is sent only to the provider it belongs to. Unless the person
 * ticks "remember", keys live in sessionStorage and are gone when the tab is.
 */

import { defaultAnswers } from './summary';

export const AI_STORAGE = { local: 'cointrack.ai.v1', session: 'cointrack.ai.keys' };

const fresh = () => ({
  provider: 'openrouter',
  models: {},
  keys: {},
  remember: false,
  answers: defaultAnswers(),
  last: null,
});

export function loadAiConfig() {
  const base = fresh();
  try {
    const stored = JSON.parse(localStorage.getItem(AI_STORAGE.local) || '{}');
    let keys = stored.remember ? stored.keys || {} : {};
    if (!stored.remember) {
      try {
        keys = JSON.parse(sessionStorage.getItem(AI_STORAGE.session) || '{}');
      } catch {
        keys = {};
      }
    }
    return {
      ...base,
      ...stored,
      keys,
      remember: !!stored.remember,
      models: stored.models || {},
      answers: { ...base.answers, ...stored.answers },
    };
  } catch {
    return base;
  }
}

export function saveAiConfig(config) {
  try {
    const { keys = {}, ...rest } = config;
    localStorage.setItem(AI_STORAGE.local, JSON.stringify({ ...rest, keys: config.remember ? keys : {} }));
    if (config.remember) sessionStorage.removeItem(AI_STORAGE.session);
    else sessionStorage.setItem(AI_STORAGE.session, JSON.stringify(keys));
  } catch {
    /* storage unavailable — the settings simply do not persist */
  }
}

export function forgetAiSettings() {
  try {
    localStorage.removeItem(AI_STORAGE.local);
    sessionStorage.removeItem(AI_STORAGE.session);
  } catch {
    /* nothing to forget */
  }
}
