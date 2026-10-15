/**
 * First run.
 *
 * Three screens, and only the first is mandatory — a tracker that demands
 * fifteen fields before showing you anything is one people abandon on the spot.
 * Income and budgets improve the app a lot, so they are asked for, but both can
 * be skipped and set later from Settings.
 */

import { useEffect, useState } from 'react';
import { useStore, suggestBudgets } from '../lib/store';
import { CURRENCIES, categoriesFor } from '../lib/data';
import { buildDemo } from '../lib/demo';
import { formatMoney } from '../lib/calc';
import { prefersReducedMotion } from '../lib/motion';
import { Button, Field, Icon, Input, MoneyInput, NumberInput, Select } from './ui';

const STEPS = ['You', 'Income', 'Budgets'];

export default function Onboarding() {
  const { state, dispatch } = useStore();
  const [step, setStep] = useState(0);
  const [profile, setProfile] = useState({
    name: '',
    currency: 'INR',
    weekStart: 1,
    monthlyIncome: null,
    savingsTargetPct: 20,
    budgets: {},
  });

  const patch = (p) => setProfile((v) => ({ ...v, ...p }));
  const money = (v) => formatMoney(v, profile.currency);

  const proposeBudgets = () => {
    const budgets = suggestBudgets(profile.monthlyIncome, profile.savingsTargetPct);
    patch({ budgets });
    setStep(2);
  };

  const finish = (withDemo = false) => {
    // The app replaces this page in the same document, so it would otherwise
    // open wherever this page had been scrolled to — Home, part-way down, with
    // its greeting out of sight. Instant: the whole page is about to change.
    window.scrollTo(0, 0);
    if (withDemo) {
      const demo = buildDemo({ income: profile.monthlyIncome || defaultIncome(profile.currency) });
      dispatch({
        type: 'replace',
        state: {
          ...state,
          onboarded: true,
          profile: {
            ...state.profile,
            ...profile,
            monthlyIncome: profile.monthlyIncome || defaultIncome(profile.currency),
            // The demo ships budgets derived from its own history, so the
            // sample month opens on a realistic mix rather than on every
            // category over its cap.
            budgets: Object.keys(profile.budgets).length ? profile.budgets : demo.budgets,
          },
          entries: demo.entries,
          assets: demo.assets,
        },
      });
      return;
    }
    dispatch({ type: 'onboard', profile: { ...profile, monthlyIncome: profile.monthlyIncome || 0 } });
  };

  /*
   * Each step starts at its headline.
   *
   * The page is taller than a phone's screen, so Continue is often pressed
   * after scrolling down — and without this the next step opened mid-page,
   * with its headline already scrolled out of sight.
   */
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: prefersReducedMotion() ? 'auto' : 'smooth' });
  }, [step]);

  return (
    /*
     * The first page anyone sees, set like the opening of a printed journal: a
     * masthead, a kicker saying where you are, a large serif headline, and the
     * form below it with no box around it — the page is the container.
     */
    <div className="min-h-dvh grid place-items-center px-5 py-12 sm:py-16">
      <div className="w-full max-w-xl">
        {/* Masthead */}
        <header className="text-center mb-10">
          <div className="inline-flex items-center gap-3">
            <span className="size-9 rounded-xl grid place-items-center metal">
              <Icon name="chart" className="size-[18px]" />
            </span>
            <span className="display text-[36px] leading-none">CoinTrack</span>
          </div>
          {/* Balanced, so a phone splits it into two even lines instead of
              stranding "own" on a line of its own. */}
          <div className="mt-3 text-[10.5px] uppercase tracking-[0.22em] text-faint text-balance">
            Earnings, expenses, savings and what you own
          </div>
          {/* A double rule, the way a masthead is closed off. */}
          <div className="mt-6 border-t border-[color:var(--border-strong)]" />
          <div className="mt-[3px] border-t border-hair" />
        </header>

        {/* Where you are: a printed kicker over three rules. */}
        <div className="flex items-baseline justify-between text-[10.5px] uppercase tracking-[0.2em] mb-2.5">
          <span className="text-faint">Step {step + 1} of {STEPS.length}</span>
          <span>{STEPS[step]}</span>
        </div>
        <div className="flex gap-1.5 mb-9" aria-hidden="true">
          {STEPS.map((s, i) => (
            <div
              key={s}
              className="flex-1 transition-all duration-500"
              style={{
                height: i === step ? 2 : 1,
                background: i <= step ? 'var(--text)' : 'var(--border-strong)',
              }}
            />
          ))}
        </div>

        <div key={step} className="animate-rise">
          {step === 0 && (
            <>
              <h1 className="display text-[40px] sm:text-[48px] leading-[1.04] text-balance">
                Let's set up your <span className="gradient-text">ledger</span>
              </h1>
              <p className="text-[15px] text-dim mt-4 leading-relaxed max-w-[34rem]">
                Everything stays on this device. No account, no sync, no server — the data lives in your
                browser's storage and never leaves it, unless you choose to ask an AI model for guidance,
                and then only a summary you see first.
              </p>

              <div className="grid sm:grid-cols-2 gap-3 mt-9">
                <Field label="What should we call you?">
                  <Input
                    value={profile.name}
                    onChange={(e) => patch({ name: e.target.value })}
                    placeholder="Your name"
                    maxLength={30}
                    autoFocus
                  />
                </Field>
                <Field label="Currency">
                  <Select value={profile.currency} onChange={(e) => patch({ currency: e.target.value })}>
                    {CURRENCIES.map((c) => (
                      <option key={c.code} value={c.code}>
                        {c.symbol} {c.code} — {c.label}
                      </option>
                    ))}
                  </Select>
                </Field>
              </div>

              <Field label="Weeks start on" className="mt-3">
                <Select value={profile.weekStart} onChange={(e) => patch({ weekStart: Number(e.target.value) })}>
                  <option value={1}>Monday</option>
                  <option value={0}>Sunday</option>
                </Select>
              </Field>

              <div className="flex gap-2 mt-6">
                <Button variant="primary" size="lg" className="flex-1" onClick={() => setStep(1)}>
                  Continue
                  <Icon name="chevR" className="size-4" />
                </Button>
              </div>

              <button
                onClick={() => finish(true)}
                className="w-full mt-4 text-[13px] text-dim underline underline-offset-4 decoration-[color:var(--border-strong)]
                           hover:text-[color:var(--text)] hover:decoration-[color:var(--text)] transition-colors"
              >
                Or explore with five months of sample data first
              </button>
            </>
          )}

          {step === 1 && (
            <>
              <h1 className="display text-[40px] sm:text-[48px] leading-[1.04] text-balance">
                What comes in <span className="gradient-text">each month?</span>
              </h1>
              <p className="text-[15px] text-dim mt-4 leading-relaxed max-w-[34rem]">
                A rough take-home figure is enough. It is what turns your spending into a savings rate and
                lets CoinTrack size sensible budgets — you can change it whenever it changes.
              </p>

              <Field label="Monthly take-home" className="mt-9">
                <MoneyInput
                  value={profile.monthlyIncome}
                  onChange={(v) => patch({ monthlyIncome: v })}
                  currency={profile.currency}
                  autoFocus
                />
              </Field>

              <Field
                label="Share you want to keep"
                className="mt-4"
                hint={
                  profile.monthlyIncome
                    ? `${money((profile.monthlyIncome * profile.savingsTargetPct) / 100)} a month, leaving ${money(
                        profile.monthlyIncome * (1 - profile.savingsTargetPct / 100)
                      )} to live on.`
                    : 'A target to measure against, not a rule to feel bad about.'
                }
              >
                <div className="flex items-center gap-4">
                  <input
                    type="range"
                    min={0}
                    max={60}
                    step={1}
                    value={profile.savingsTargetPct}
                    onChange={(e) => patch({ savingsTargetPct: Number(e.target.value) })}
                    className="flex-1"
                  />
                  <div className="w-16 shrink-0">
                    <NumberInput
                      value={profile.savingsTargetPct}
                      onChange={(v) => patch({ savingsTargetPct: Math.min(90, Math.max(0, v)) })}
                      min={0}
                      max={90}
                      className="text-center py-2 text-[15px] font-semibold"
                    />
                  </div>
                </div>
              </Field>

              <div className="flex gap-2 mt-6">
                <Button variant="subtle" onClick={() => setStep(0)}>
                  <Icon name="chevL" className="size-4" />
                  Back
                </Button>
                <Button variant="primary" className="flex-1" onClick={proposeBudgets} disabled={!profile.monthlyIncome}>
                  Suggest budgets
                  <Icon name="chevR" className="size-4" />
                </Button>
              </div>
              <button
                onClick={() => finish(false)}
                className="w-full mt-4 text-[13px] text-dim underline underline-offset-4 decoration-[color:var(--border-strong)]
                           hover:text-[color:var(--text)] hover:decoration-[color:var(--text)] transition-colors"
              >
                Skip — I'll just log things for now
              </button>
            </>
          )}

          {step === 2 && (
            <>
              <h1 className="display text-[40px] sm:text-[48px] leading-[1.04] text-balance">
                A starting <span className="gradient-text">point</span>
              </h1>
              <p className="text-[15px] text-dim mt-4 leading-relaxed max-w-[34rem]">
                Proposed from your income and your {profile.savingsTargetPct}% target. They add up to exactly
                what is left after saving — adjust anything that looks wrong, or leave them and fix them once
                you have a month of real data.
              </p>

              <div className="mt-5 space-y-2 max-h-[38vh] overflow-y-auto pr-1">
                {categoriesFor('expense')
                  .filter((c) => profile.budgets[c.id] !== undefined)
                  .map((c) => (
                    <div key={c.id} className="flex items-center gap-3">
                      <span
                        className="size-8 rounded-xl grid place-items-center shrink-0"
                        style={{ background: `${c.color}1f`, color: c.color }}
                      >
                        <Icon name={c.icon} className="size-4" />
                      </span>
                      <span className="text-[13px] flex-1 truncate">{c.label}</span>
                      <div className="w-28 shrink-0">
                        <MoneyInput
                          size="sm"
                          inputClassName="text-right"
                          currency={profile.currency}
                          value={profile.budgets[c.id]}
                          onChange={(v) => patch({ budgets: { ...profile.budgets, [c.id]: v } })}
                        />
                      </div>
                    </div>
                  ))}
              </div>

              <div className="flex items-center justify-between text-[12.5px] mt-4 pt-3 border-t border-hair">
                <span className="text-dim">Budgeted</span>
                <span className="tabular font-medium">
                  {money(Object.values(profile.budgets).reduce((a, b) => a + (Number(b) || 0), 0))} of{' '}
                  {money(profile.monthlyIncome || 0)}
                </span>
              </div>

              <div className="flex gap-2 mt-6">
                <Button variant="subtle" onClick={() => setStep(1)}>
                  <Icon name="chevL" className="size-4" />
                  Back
                </Button>
                <Button variant="primary" className="flex-1" onClick={() => finish(false)}>
                  <Icon name="check" className="size-4" />
                  Start tracking
                </Button>
              </div>
              <button
                onClick={() => finish(true)}
                className="w-full mt-4 text-[13px] text-dim underline underline-offset-4 decoration-[color:var(--border-strong)]
                           hover:text-[color:var(--text)] hover:decoration-[color:var(--text)] transition-colors"
              >
                Start with sample data instead
              </button>
            </>
          )}
        </div>

        {/* The small print, which here is the whole promise. */}
        <p className="mt-14 text-center text-[10.5px] uppercase tracking-[0.2em] text-faint">
          Kept on this device · No account · No server
        </p>
      </div>
    </div>
  );
}

/** A believable monthly income per currency, only ever used for the demo. */
function defaultIncome(code) {
  return { INR: 85000, JPY: 400000, USD: 5200, EUR: 4200, GBP: 3800, AED: 18000, SGD: 6500, CAD: 6000, AUD: 6800 }[code] || 5000;
}
