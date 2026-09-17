/**
 * "Ask AI": general investment guidance from a model the person chooses.
 *
 * Three steps before anything is sent — pick a model, answer a few questions,
 * review the exact summary — because this is the only place the app sends
 * data off the device. Free options come first (OpenRouter's free models,
 * Gemini's free tier, Groq, or a model on your own computer), and nothing here
 * uses a key belonging to the app.
 *
 * The answer is rendered field by field as text, never as model-supplied
 * markup, and always under the market-risk disclaimer.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { useStore } from '../lib/store';
import { AGE_BANDS, FOCUSES, HORIZONS, HOUSEHOLDS, QUESTIONS, RISK_LEVELS, TOPIC_META, buildAdviceSummary } from '../lib/ai/summary';
import { AdviceFormatError, disclaimerFor, namesSpecificProducts, previewFromPartial } from '../lib/ai/prompt';
import { AiError, PROVIDERS, listModels, providerById, requestAdvice } from '../lib/ai/providers';
import { loadAiConfig, saveAiConfig } from '../lib/ai/config';
import { formatMoney } from '../lib/calc';
import { Badge, Button, Field, Icon, Input, Segmented, Select, Sheet } from './ui';

const STEP_TITLES = {
  model: 'Step 1 of 3 · Choose a model',
  about: 'Step 2 of 3 · A few questions',
  review: 'Step 3 of 3 · Check what will be sent',
  running: 'Waiting for the model',
  result: 'General guidance',
  error: 'That did not work',
};

const PRIORITY_LABEL = { now: 'Now', soon: 'Soon', later: 'Later' };

export default function AiAdvisor({ topic = 'investing', onClose }) {
  const { state } = useStore();
  const [config, setConfig] = useState(loadAiConfig);
  const [step, setStep] = useState(() => (config.lastByTopic?.[topic]?.advice ? 'result' : 'model'));
  const [models, setModels] = useState({ loading: false, items: [], error: null });
  const [consent, setConsent] = useState(false);
  const [error, setError] = useState(null);
  const [showRaw, setShowRaw] = useState(false);
  /** What has arrived so far, while the answer is still streaming in. */
  const [partial, setPartial] = useState('');
  const abortRef = useRef(null);

  const provider = providerById(config.provider);
  const key = config.keys[provider.id] || '';
  const model = config.models[provider.id] || provider.defaultModel || '';
  const cur = state.profile.currency;
  const asked = QUESTIONS[topic] || QUESTIONS.investing;
  const focuses = FOCUSES[topic] || FOCUSES.investing;
  const summary = useMemo(() => buildAdviceSummary(state, config.answers, topic), [state, config.answers, topic]);
  const origin = typeof location !== 'undefined' ? location.origin : '';

  const update = (patch) =>
    setConfig((c) => {
      const next = { ...c, ...(typeof patch === 'function' ? patch(c) : patch) };
      saveAiConfig(next);
      return next;
    });
  const setModel = (id) => update((c) => ({ models: { ...c.models, [c.provider]: id } }));
  const setKey = (value) => update((c) => ({ keys: { ...c.keys, [c.provider]: value.trim() } }));
  const setAnswer = (patch) => update((c) => ({ answers: { ...c.answers, ...patch } }));
  const setFocus = (value) => update((c) => ({ answers: { ...c.answers, focus: { ...c.answers.focus, [topic]: value } } }));

  const loadModels = async () => {
    setModels({ loading: true, items: [], error: null });
    try {
      const items = await listModels(provider, key);
      setModels({ loading: false, items, error: null });
      if (items.length && !items.some((m) => m.id === model)) setModel(items[0].id);
    } catch (e) {
      setModels({ loading: false, items: [], error: e });
    }
  };

  // A fresh list per provider. OpenRouter's is public, so it can load straight
  // away; the rest need a key or a running local server first.
  useEffect(() => {
    setModels({ loading: false, items: [], error: null });
    if (provider.id === 'openrouter' || (provider.kind === 'anthropic' && !key)) loadModels();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [provider.id]);

  useEffect(() => () => abortRef.current?.abort(), []);

  const send = async () => {
    const controller = new AbortController();
    abortRef.current = controller;
    setError(null);
    setShowRaw(false);
    setPartial('');
    setStep('running');
    try {
      const out = await requestAdvice({
        provider, key, model, summary, topic,
        signal: controller.signal,
        onChunk: setPartial,
      });
      update((c) => ({ lastByTopic: { ...c.lastByTopic, [topic]: out } }));
      setStep('result');
    } catch (e) {
      if (e instanceof AiError && e.kind === 'aborted') {
        setStep('review');
        return;
      }
      setError(e);
      setStep('error');
    } finally {
      abortRef.current = null;
    }
  };

  const canContinue = !!model && (!provider.needsKey || !!key);
  const last = config.lastByTopic?.[topic];
  const lastProvider = last ? providerById(last.provider) : null;

  const footer = {
    model: (
      <div className="flex items-center gap-2">
        <Button variant="subtle" onClick={onClose}>Cancel</Button>
        <Button variant="primary" className="ml-auto" disabled={!canContinue} onClick={() => setStep('about')}>
          Continue
        </Button>
      </div>
    ),
    about: (
      <div className="flex items-center gap-2">
        <Button variant="subtle" onClick={() => setStep('model')}>Back</Button>
        <Button variant="primary" className="ml-auto" onClick={() => { setConsent(false); setStep('review'); }}>
          Continue
        </Button>
      </div>
    ),
    review: (
      <div className="flex items-center gap-2">
        <Button variant="subtle" onClick={() => setStep('about')}>Back</Button>
        <Button variant="primary" className="ml-auto" disabled={!consent} onClick={send}>
          <Icon name="spark" className="size-4" />
          Send to {provider.label}
        </Button>
      </div>
    ),
    running: (
      <div className="flex items-center">
        <Button variant="subtle" className="ml-auto" onClick={() => abortRef.current?.abort()}>Cancel</Button>
      </div>
    ),
    result: (
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="subtle" onClick={() => setStep('model')}>Change model</Button>
        <Button variant="subtle" onClick={() => setStep('about')}>Change answers</Button>
        <Button variant="primary" className="ml-auto" onClick={() => { setConsent(false); setStep('review'); }}>
          Ask again
        </Button>
      </div>
    ),
    error: (
      <div className="flex items-center gap-2">
        <Button variant="subtle" onClick={() => setStep('model')}>Change model</Button>
        <Button variant="primary" className="ml-auto" onClick={send}>Try again</Button>
      </div>
    ),
  }[step];

  return (
    <Sheet
      open
      onClose={onClose}
      title={`Ask AI about ${TOPIC_META[topic]?.label || 'investing'}`}
      subtitle={STEP_TITLES[step]}
      footer={footer}
    >
      {step === 'model' && (
        <div className="space-y-5">
          <div role="group" aria-label="Provider" className="grid sm:grid-cols-2 gap-2">
            {PROVIDERS.map((p) => {
              const active = p.id === provider.id;
              return (
                <button
                  key={p.id}
                  type="button"
                  aria-pressed={active}
                  onClick={() => update({ provider: p.id })}
                  className={`text-left rounded-2xl p-3 border transition-all active:scale-[0.99]
                    ${active ? 'bg-brand-500/14 border-brand-400/40' : 'surface border-hair hover:[background:var(--surface-hover)]'}`}
                >
                  <span className="flex items-center gap-2">
                    <span className={`text-[13.5px] font-semibold ${active ? 'text-brandy' : ''}`}>{p.label}</span>
                    {p.local ? <Badge tone="good">Private</Badge> : p.free ? <Badge tone="good">Free</Badge> : <Badge tone="neutral">Your key</Badge>}
                  </span>
                  <span className="block text-[11.5px] text-faint leading-snug mt-1">{p.tagline}</span>
                </button>
              );
            })}
          </div>

          {provider.local && (
            <div className="surface rounded-2xl p-3.5 text-[12px] text-dim leading-relaxed space-y-1.5">
              <div className="font-medium text-[12.5px]" style={{ color: 'var(--text)' }}>Setting up {provider.label}</div>
              <ol className="list-decimal pl-4 space-y-1">
                {provider.setup(origin).map((line) => <li key={line} className="break-words">{line}</li>)}
              </ol>
              <a className="text-brandy underline underline-offset-2" href={provider.setupUrl} target="_blank" rel="noopener noreferrer">
                Get {provider.label}
              </a>
            </div>
          )}

          {provider.needsKey && (
            <div className="space-y-2">
              <Field label="API key" hint={`Sent only to ${provider.label}, never to this app.`}>
                <Input
                  type="password"
                  autoComplete="off"
                  spellCheck={false}
                  value={key}
                  onChange={(e) => setKey(e.target.value)}
                  placeholder={`Paste your ${provider.label} key`}
                />
              </Field>
              <div className="flex flex-wrap items-center justify-between gap-2 text-[12px]">
                <label className="inline-flex items-center gap-2 text-dim">
                  <input
                    type="checkbox"
                    checked={config.remember}
                    onChange={(e) => update({ remember: e.target.checked })}
                  />
                  Remember keys on this device
                </label>
                <a className="text-brandy underline underline-offset-2" href={provider.keyUrl} target="_blank" rel="noopener noreferrer">
                  Get a {provider.free ? 'free ' : ''}key
                </a>
              </div>
            </div>
          )}

          <div>
            <div className="flex items-end gap-2">
              <Field label="Model" className="flex-1 min-w-0">
                {models.items.length ? (
                  <Select value={model} onChange={(e) => setModel(e.target.value)}>
                    {models.items.map((m) => (
                      <option key={m.id} value={m.id}>{m.label}{m.free && !provider.local ? ' · free' : ''}</option>
                    ))}
                  </Select>
                ) : (
                  <Input
                    value={model}
                    spellCheck={false}
                    onChange={(e) => setModel(e.target.value.trim())}
                    placeholder={provider.local ? 'e.g. llama3.2' : 'Load the list, or type a model id'}
                  />
                )}
              </Field>
              <Button variant="ghost" onClick={loadModels} disabled={models.loading || (provider.needsKey && !key && provider.id !== 'openrouter')}>
                {models.loading ? 'Loading…' : 'Load models'}
              </Button>
            </div>
            {models.error && (
              <p className="text-[12px] text-bad mt-2 leading-relaxed">
                {models.error.message} {models.error.hint}
              </p>
            )}
          </div>
        </div>
      )}

      {step === 'about' && (
        <div className="space-y-4">
          <p className="text-[12.5px] text-dim leading-relaxed">
            Guidance depends on things your ledger cannot know. None of these is stored anywhere but this device.
          </p>
          {asked.includes('ageBand') && (
            <Field label="Age">
              <Select value={config.answers.ageBand} onChange={(e) => setAnswer({ ageBand: e.target.value })}>
                {AGE_BANDS.map((a) => <option key={a} value={a}>{a}</option>)}
              </Select>
            </Field>
          )}
          {asked.includes('household') && (
            <Field label="Who does this money support?">
              <Select value={config.answers.household} onChange={(e) => setAnswer({ household: e.target.value })}>
                {HOUSEHOLDS.map((h) => <option key={h} value={h}>{h}</option>)}
              </Select>
            </Field>
          )}
          {asked.includes('horizon') && (
            <div>
              <div className="text-[12px] font-medium text-dim mb-1.5">When might you need this money?</div>
              <Segmented value={config.answers.horizon} onChange={(v) => setAnswer({ horizon: v })} options={HORIZONS} />
            </div>
          )}
          {asked.includes('risk') && (
            <div>
              <div className="text-[12px] font-medium text-dim mb-1.5">How do you feel about risk?</div>
              <Segmented value={config.answers.risk} onChange={(v) => setAnswer({ risk: v })} options={RISK_LEVELS} />
              <p className="text-[11.5px] text-faint mt-1.5">
                {RISK_LEVELS.find((r) => r.value === config.answers.risk)?.blurb}
              </p>
            </div>
          )}
          <Field label="Main focus">
            <Select value={config.answers.focus[topic]} onChange={(e) => setFocus(e.target.value)}>
              {focuses.map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}
            </Select>
          </Field>
          <Field label="Country or region" hint="Optional. Lets the guidance mention account types that exist where you live.">
            <Input
              value={config.answers.region}
              maxLength={40}
              onChange={(e) => setAnswer({ region: e.target.value })}
              placeholder="e.g. India, Ireland"
            />
          </Field>
          <Field label="Anything the numbers do not show?" hint="Optional. A job change, a move, a big bill coming.">
            <Input
              value={config.answers.note}
              maxLength={200}
              onChange={(e) => setAnswer({ note: e.target.value })}
              placeholder="e.g. moving house in March"
            />
          </Field>
        </div>
      )}

      {step === 'review' && (
        <div className="space-y-4">
          <p className="text-[12.5px] text-dim leading-relaxed">
            This is everything that will be sent to <strong>{provider.label}</strong> ({model}). No entry titles,
            notes, or names of holdings, debts or goals go with it.
          </p>
          <pre
            aria-label="Data to be sent"
            className="surface rounded-2xl p-3 text-[11px] leading-relaxed overflow-auto max-h-72 whitespace-pre"
          >
            {JSON.stringify(summary, null, 2)}
          </pre>
          <p className="text-[11.5px] text-faint leading-relaxed">{provider.privacy}</p>
          <label className="flex items-start gap-2.5 text-[12.5px] leading-relaxed">
            <input type="checkbox" className="mt-1" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
            <span>I understand this is general, AI-generated guidance, not advice from a registered adviser, and that investments are subject to market risk.</span>
          </label>
        </div>
      )}

      {step === 'running' && <Waiting model={model} provider={provider} partial={partial} />}

      {step === 'error' && error && (
        <div className="space-y-3">
          <div className="rounded-2xl p-4" style={{ background: 'color-mix(in srgb, var(--tone-bad) 10%, transparent)' }}>
            <div className="flex items-start gap-2.5">
              <Icon name="alert" className="size-4 text-bad shrink-0 mt-0.5" />
              <div className="text-[13px] leading-relaxed">
                <div>{error.message}</div>
                {error.hint && <div className="text-dim mt-1">{error.hint}</div>}
              </div>
            </div>
          </div>
          {error instanceof AdviceFormatError && error.raw && (
            <>
              <Button size="sm" variant="ghost" onClick={() => setShowRaw((v) => !v)} aria-expanded={showRaw}>
                {showRaw ? 'Hide' : 'Show'} what the model said
              </Button>
              {showRaw && (
                <pre className="surface rounded-2xl p-3 text-[11.5px] leading-relaxed overflow-auto max-h-72 whitespace-pre-wrap">
                  {error.raw}
                </pre>
              )}
            </>
          )}
        </div>
      )}

      {step === 'result' && last?.advice && (
        <AdviceView
          advice={last.advice}
          topic={last.topic || 'investing'}
          currency={cur}
          meta={`${last.model} via ${lastProvider.label} · ${new Date(last.at).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}`}
        />
      )}
    </Sheet>
  );
}

/**
 * The wait.
 *
 * The answer arrives as JSON, which is not worth showing anyone, so this shows
 * the human parts of it as they land: the summary being typed, then a count of
 * suggestions. Until the first text arrives it is an ordinary spinner.
 */
function Waiting({ model, provider, partial }) {
  const seen = previewFromPartial(partial);
  const counted = [
    seen.rows ? `${seen.rows} ${seen.rows === 1 ? 'suggestion' : 'suggestions'}` : '',
    seen.actions ? `${seen.actions} ${seen.actions === 1 ? 'action' : 'actions'}` : '',
  ].filter(Boolean).join(' · ');

  return (
    <div className="py-10" role="status" aria-live="polite">
      <div className="flex items-center gap-3 justify-center">
        <div className="size-5 rounded-full border-2 border-brand-400/30 border-t-brand-400 animate-spin" />
        <p className="text-[13px] text-dim">
          {seen.summary ? 'Writing…' : `Asking ${model} via ${provider.label}…`}
        </p>
      </div>

      {seen.summary ? (
        <p className="text-[13.5px] leading-relaxed mt-5 max-w-prose mx-auto">
          {seen.summary}
          <span className="inline-block w-1.5 h-4 align-text-bottom ml-0.5 bg-brand-400 animate-pulse" />
        </p>
      ) : (
        <p className="text-[11.5px] text-faint mt-2 text-center">Free and local models can take a minute.</p>
      )}

      {counted && <p className="text-[11.5px] text-faint mt-3 text-center">{counted} so far</p>}
    </div>
  );
}

function AdviceView({ advice, topic, currency, meta }) {
  const specific = namesSpecificProducts(advice);
  const biggest = Math.max(...advice.rows.map((r) => r.value), 0);
  const shown = (row) =>
    advice.unit === 'percent' ? `${row.value}%` : formatMoney(row.value, currency);
  const width = (row) =>
    advice.unit === 'percent' ? Math.min(100, row.value) : biggest > 0 ? (row.value / biggest) * 100 : 0;
  const groups = ['now', 'soon', 'later']
    .map((p) => [p, advice.actions.filter((a) => a.priority === p)])
    .filter(([, list]) => list.length);

  return (
    <div className="space-y-5">
      <div role="note" className="rounded-2xl p-3.5 text-[12px] leading-relaxed flex items-start gap-2.5"
           style={{ background: 'color-mix(in srgb, var(--tone-warn) 12%, transparent)' }}>
        <Icon name="shield" className="size-4 text-warn shrink-0 mt-0.5" />
        <span>{disclaimerFor(topic)}</span>
      </div>

      {specific && (
        <p className="text-[12px] text-warn leading-relaxed">
          This answer appears to name specific products, which it was asked not to do. Treat any names as
          examples to research, not recommendations.
        </p>
      )}

      {advice.summary && <p className="text-[13.5px] leading-relaxed">{advice.summary}</p>}

      {advice.rows.length > 0 && (
        <section>
          <h3 className="text-[11px] uppercase tracking-wider text-faint mb-2">{advice.rowsTitle}</h3>
          <div className="space-y-2.5">
            {advice.rows.map((row) => (
              <div key={row.label}>
                <div className="flex items-baseline justify-between gap-3 text-[13px]">
                  <span className="font-medium">{row.label}</span>
                  <span className="tabular text-dim">{shown(row)}</span>
                </div>
                <div className="h-1.5 rounded-full mt-1 overflow-hidden" style={{ background: 'var(--border)' }}>
                  <div className="h-full rounded-full bg-brand-400" style={{ width: `${width(row)}%` }} />
                </div>
                {row.why && <p className="text-[11.5px] text-faint mt-1 leading-relaxed">{row.why}</p>}
              </div>
            ))}
          </div>
          {advice.rescaled && (
            <p className="text-[11px] text-faint mt-2">The model's percentages did not add up to 100, so they were scaled.</p>
          )}
        </section>
      )}

      {groups.map(([priority, list]) => (
        <section key={priority}>
          <h3 className="text-[11px] uppercase tracking-wider text-faint mb-2">{PRIORITY_LABEL[priority]}</h3>
          <div className="space-y-2">
            {list.map((a) => (
              <div key={a.title} className="surface rounded-2xl p-3">
                <div className="text-[13.5px] font-semibold leading-snug">{a.title}</div>
                {a.detail && <p className="text-[12.5px] text-dim mt-1 leading-relaxed">{a.detail}</p>}
              </div>
            ))}
          </div>
        </section>
      ))}

      {[['Risks to keep in mind', advice.risks], ['What this assumes', advice.assumptions]].map(([title, list]) =>
        list.length ? (
          <section key={title}>
            <h3 className="text-[11px] uppercase tracking-wider text-faint mb-2">{title}</h3>
            <ul className="list-disc pl-4 space-y-1 text-[12.5px] text-dim leading-relaxed">
              {list.map((x) => <li key={x}>{x}</li>)}
            </ul>
          </section>
        ) : null
      )}

      <p className="text-[11px] text-faint">{meta}</p>
    </div>
  );
}
