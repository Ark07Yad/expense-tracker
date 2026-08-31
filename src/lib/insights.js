/**
 * The advisor.
 *
 * Rule-based, deterministic, and computed from the same aggregation engine the
 * charts use — no model, no network, no guessing. Every suggestion has to name
 * a number the user can go and check, because advice that cannot be traced back
 * to a figure on the screen is just a fortune cookie.
 *
 * Three deliberate limits:
 *
 *   1. **Nothing fires without enough data.** A rule that needs three months of
 *      history stays silent for the first two rather than reading noise as a
 *      trend. Confident nonsense in week one is how people stop trusting a
 *      tracker.
 *   2. **Observations, not instructions, on investments.** This section
 *      describes what the user's own recorded holdings look like — how
 *      concentrated, how stale, how consistent the contributions — and stops
 *      there. It does not tell anyone what to buy, sell or hold. That is a
 *      licensed activity and this is a spreadsheet with nice charts.
 *   3. **Dismissible and stable.** Ids are derived from the rule and its
 *      subject, so dismissing "dining is 41% of your spending" keeps it
 *      dismissed next month instead of resurfacing with a new random key.
 */

import { computeFinance, computeInvestments } from './useFinance';
import { categoryById } from './data';
import { addMonthKeys, formatMoney, formatPercent, monthKey, todayKey } from './calc';

export const SECTIONS = [
  { id: 'overall',   label: 'Whole picture', icon: 'compass',   blurb: 'How the month hangs together' },
  { id: 'spending',  label: 'Spending',      icon: 'trendDown', blurb: 'Where the money actually goes' },
  { id: 'budgets',   label: 'Budgets',       icon: 'target',    blurb: 'Caps you set, and how they are holding' },
  { id: 'income',    label: 'Income',        icon: 'trendUp',   blurb: 'What is coming in, and how steadily' },
  { id: 'saving',    label: 'Savings',       icon: 'piggy',     blurb: 'What you keep, and your cushion' },
  { id: 'investing', label: 'Investments',   icon: 'chart',     blurb: 'What your holdings look like' },
];

const RANK = { bad: 0, warn: 1, info: 2, good: 3 };

/* ────────────────────────────────  Helpers  ─────────────────────────────── */

/** Monthly expense totals for the last n months, oldest first. */
function monthlyHistory(state, n = 6) {
  const out = [];
  let m = monthKey(todayKey());
  for (let i = 0; i < n; i++) {
    const f = computeFinance(state, 'month', -i);
    out.unshift({ month: m, ...f.totals, cats: f.expenseCats });
    m = addMonthKeys(m, -1);
  }
  return out;
}

const avg = (arr) => (arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0);

/* ────────────────────────────────  The rules  ───────────────────────────── */

/**
 * @param section  one of SECTIONS, or an expense category id for a deep dive
 * @returns        suggestions, most urgent first
 */
export function buildSuggestions(state, section = 'overall') {
  const cur = state.profile.currency;
  const money = (v, opts) => formatMoney(v, cur, opts);
  const out = [];
  const add = (s) => out.push({ tone: 'info', section, priority: 5, ...s });

  const month = computeFinance(state, 'month', 0);
  const prev = computeFinance(state, 'month', -1);
  const inv = computeInvestments(state, 12);
  const history = monthlyHistory(state, 6);
  const funded = history.filter((h) => h.count > 0);
  const enoughHistory = funded.length >= 3;

  // Nothing to say yet — say that, rather than inventing something.
  if (!state.entries.length) {
    add({
      id: 'empty',
      tone: 'info',
      icon: 'spark',
      title: 'Log a few days and this fills up',
      body: 'Every suggestion here is computed from your own entries. Once there are a couple of weeks in the ledger, this page starts pointing at the categories that are actually moving.',
      priority: 0,
    });
    return out;
  }

  const isCat = !SECTIONS.some((s) => s.id === section);

  /* ───────────────────────────── Category deep dive ───────────────────── */

  if (isCat) {
    const meta = categoryById(section);
    const row = month.expenseCats.find((c) => c.id === section);
    const before = prev.expenseCats.find((c) => c.id === section);
    const spent = row?.total || 0;
    const was = before?.total || 0;
    const cap = state.profile.budgets[section] || 0;
    const trail = history.map((h) => h.cats.find((c) => c.id === section)?.total || 0);
    const typical = avg(trail.slice(0, -1).filter((v) => v > 0));

    if (!spent && !was) {
      add({
        id: `cat-${section}-quiet`,
        tone: 'good',
        icon: 'check',
        title: `Nothing logged under ${meta.label}`,
        body: 'No entries this month or last. If that is wrong rather than genuinely quiet, the category is probably being logged somewhere else.',
        priority: 6,
      });
    } else {
      add({
        id: `cat-${section}-summary`,
        tone: 'info',
        icon: 'chart',
        title: `${money(spent)} on ${meta.label} this month`,
        body: `${row?.count || 0} ${row?.count === 1 ? 'entry' : 'entries'}, averaging ${money(row?.avg || 0)} each${
          typical > 0 ? `. Your usual month is around ${money(typical)}.` : '.'
        }`,
        metric: { value: spent, of: cap || typical || spent },
        priority: 3,
      });
    }

    if (was > 0 && spent > was * 1.3) {
      add({
        id: `cat-${section}-up`,
        tone: 'warn',
        icon: 'trendUp',
        title: `${meta.label} is up ${formatPercent(((spent - was) / was) * 100)} on last month`,
        body: `${money(was)} → ${money(spent)}, a difference of ${money(spent - was)}. Worth a look at whether that is a one-off or the new normal.`,
        priority: 1,
      });
    }
    if (spent > 0 && was > spent * 1.3) {
      add({
        id: `cat-${section}-down`,
        tone: 'good',
        icon: 'trendDown',
        title: `${meta.label} is down ${money(was - spent)} on last month`,
        body: `From ${money(was)} to ${money(spent)}. If that holds for another month it is worth ${money((was - spent) * 12)} a year.`,
        priority: 4,
      });
    }

    if (cap > 0 && spent > cap) {
      add({
        id: `cat-${section}-over`,
        tone: 'bad',
        icon: 'alert',
        title: `Over the ${meta.label} budget by ${money(spent - cap)}`,
        body: `You set ${money(cap)} a month. Either the cap was optimistic or this month was unusual — the six-month average is ${money(avg(trail.filter((v) => v > 0)))}.`,
        priority: 0,
      });
    } else if (cap > 0 && month.progress > 0.2 && spent / cap > month.progress + 0.15) {
      add({
        id: `cat-${section}-pace`,
        tone: 'warn',
        icon: 'clock',
        title: `${meta.label} is running ahead of pace`,
        body: `${formatPercent((spent / cap) * 100)} of the budget spent with ${formatPercent(month.progress * 100)} of the month gone. At this rate it finishes around ${money(spent / month.progress)} against a ${money(cap)} cap.`,
        priority: 1,
      });
    } else if (!cap && spent > 0) {
      const proposal = Math.round((typical || spent) / 100) * 100;
      add({
        id: `cat-${section}-nobudget`,
        tone: 'info',
        icon: 'target',
        title: `No budget set for ${meta.label}`,
        body: `A cap turns this from a number you read afterwards into one you can steer. Based on your history, ${money(proposal)} a month would be a realistic starting point.`,
        action: { label: 'Set a budget', to: 'settings' },
        priority: 2,
      });
    }

    // Small-and-frequent is a different problem from large-and-rare, and the
    // fix is different too, so the advice should not be the same.
    const entries = month.entries.filter((e) => e.category === section && e.kind === 'expense');
    if (entries.length >= 6) {
      const small = entries.filter((e) => e.amount <= (row.avg || 0) * 0.6);
      if (small.length >= entries.length * 0.5 && small.length >= 4) {
        add({
          id: `cat-${section}-drip`,
          tone: 'info',
          icon: 'drop',
          title: 'Lots of small entries, not a few big ones',
          body: `${small.length} of ${entries.length} entries are below ${money((row.avg || 0) * 0.6)}, adding up to ${money(small.reduce((t, e) => t + e.amount, 0))}. Cutting a habit like this works better than a single hard rule.`,
          priority: 3,
        });
      }
    }
    const biggest = entries.sort((a, b) => b.amount - a.amount)[0];
    if (biggest && spent > 0 && biggest.amount > spent * 0.5) {
      add({
        id: `cat-${section}-single`,
        tone: 'info',
        icon: 'flag',
        title: 'One entry dominates this category',
        body: `"${biggest.title}" at ${money(biggest.amount)} is ${formatPercent((biggest.amount / spent) * 100)} of the ${meta.label} total. The rest of the month is ${money(spent - biggest.amount)}, which is the number worth comparing against your usual.`,
        priority: 4,
      });
    }

    return out.sort(sortRules);
  }

  /* ──────────────────────────────── Overall ───────────────────────────── */

  if (section === 'overall') {
    const t = month.totals;
    const target = state.profile.savingsTargetPct || 0;

    if (t.earning === 0 && t.expense > 0) {
      add({
        id: 'no-income',
        tone: 'warn',
        icon: 'alert',
        title: 'Spending logged, but no income',
        body: `${money(t.expense)} has gone out this month with nothing recorded coming in. Logging your salary is what makes the savings rate, the budgets and every projection here mean anything.`,
        action: { label: 'Log an earning', to: 'ledger' },
        priority: 0,
      });
    }

    if (t.earning > 0) {
      if (t.net < 0) {
        add({
          id: 'net-negative',
          tone: 'bad',
          icon: 'alert',
          title: `You are ${money(Math.abs(t.net))} beyond what came in`,
          body: `${money(t.earning)} in, ${money(t.expense)} out, ${money(t.saving)} moved to savings. The gap has to come from somewhere — usually last month's cushion or a card.`,
          priority: 0,
        });
      } else if (target > 0 && t.savingsRate < target) {
        const shortfall = ((target - t.savingsRate) / 100) * t.earning;
        add({
          id: 'below-savings-target',
          tone: 'warn',
          icon: 'piggy',
          title: `Keeping ${formatPercent(t.savingsRate)} against a ${formatPercent(target)} target`,
          body: `That is ${money(shortfall)} short this month. The two largest categories — ${month.expenseCats.slice(0, 2).map((c) => c.label.toLowerCase()).join(' and ')} — account for ${money(month.expenseCats.slice(0, 2).reduce((s, c) => s + c.total, 0))}, so that is where the room is.`,
          priority: 1,
        });
      } else if (target > 0) {
        add({
          id: 'savings-target-met',
          tone: 'good',
          icon: 'check',
          title: `Keeping ${formatPercent(t.savingsRate)} of what you earn`,
          body: `Ahead of your ${formatPercent(target)} target, with ${money(t.net + t.saving)} unspent so far this month.`,
          priority: 5,
        });
      }
    }

    if (month.isCurrent && month.progress > 0.15 && month.projectedExpense > 0) {
      const projected = month.projectedExpense;
      const lastTotal = prev.totals.expense;
      if (lastTotal > 0 && projected > lastTotal * 1.15) {
        add({
          id: 'pace-vs-last-month',
          tone: 'warn',
          icon: 'clock',
          title: `On pace for ${money(projected)} — ${money(projected - lastTotal)} above last month`,
          body: `${formatPercent(month.progress * 100)} through the month and ${money(month.totals.expense)} is out, a burn of ${money(month.dailyBurn)} a day. Last month finished at ${money(lastTotal)}.`,
          priority: 1,
        });
      }
    }

    const mover = month.movers[0];
    if (mover && mover.delta > 0 && mover.before > 0) {
      add({
        id: `mover-${mover.id}`,
        tone: 'info',
        icon: 'trendUp',
        title: `${mover.label} moved most this month`,
        body: `Up ${money(mover.delta)} on last month, ${money(mover.before)} → ${money(mover.total)}. It is the single biggest change in your spending mix.`,
        action: { label: `Open ${mover.label}`, to: `section:${mover.id}` },
        priority: 3,
      });
    }

    if (enoughHistory) {
      const spends = funded.map((h) => h.expense);
      const mean = avg(spends);
      const spread = Math.max(...spends) - Math.min(...spends);
      if (mean > 0 && spread / mean > 0.5) {
        add({
          id: 'volatile-spending',
          tone: 'info',
          icon: 'wave',
          title: 'Your months vary a lot',
          body: `Between ${money(Math.min(...spends))} and ${money(Math.max(...spends))} over ${funded.length} months. Budgeting against the high end rather than the average is what stops the expensive months turning into debt.`,
          priority: 4,
        });
      }
    }

    return out.concat(buildSuggestions(state, 'spending').slice(0, 2)).sort(sortRules);
  }

  /* ──────────────────────────────── Spending ──────────────────────────── */

  if (section === 'spending') {
    const cats = month.expenseCats;
    const t = month.totals;

    if (!cats.length) {
      add({ id: 'no-spend', tone: 'good', icon: 'check', title: 'No expenses logged this month', body: 'Either a very good month or an unlogged one.', priority: 5 });
      return out;
    }

    const top = cats[0];
    if (top.share > 35 && cats.length > 2) {
      add({
        id: `concentration-${top.id}`,
        tone: 'warn',
        icon: 'pie',
        title: `${top.label} is ${formatPercent(top.share)} of everything you spend`,
        body: `${money(top.total)} of ${money(t.expense)}. A category this dominant is also the one where a 10% change is worth more than cutting three small ones — that is ${money(top.total * 0.1)} a month, ${money(top.total * 1.2)} a year.`,
        action: { label: `Open ${top.label}`, to: `section:${top.id}` },
        priority: 1,
      });
    }

    if (t.earning > 0) {
      const housing = cats.find((c) => c.id === 'housing');
      if (housing && housing.total / t.earning > 0.4) {
        add({
          id: 'housing-heavy',
          tone: 'warn',
          icon: 'home',
          title: `Housing takes ${formatPercent((housing.total / t.earning) * 100)} of your income`,
          body: `${money(housing.total)} against ${money(t.earning)} coming in. It is the hardest cost to change quickly, which is exactly why it is worth knowing the number.`,
          priority: 2,
        });
      }
    }

    const subs = cats.find((c) => c.id === 'subscriptions');
    if (subs && subs.count >= 3) {
      add({
        id: 'subscription-creep',
        tone: 'info',
        icon: 'repeat',
        title: `${subs.count} subscriptions, ${money(subs.total)} this month`,
        body: `That is ${money(subs.total * 12)} a year on autopilot. Subscriptions are the one category where the money keeps moving whether you use the thing or not.`,
        priority: 3,
      });
    }

    // Weekend concentration is a genuinely actionable pattern, and one people
    // reliably underestimate until they see it.
    const weekend = month.entries.filter((e) => {
      if (e.kind !== 'expense') return false;
      const d = new Date(`${e.date}T12:00:00`).getDay();
      return d === 0 || d === 6;
    });
    const weekendTotal = weekend.reduce((s, e) => s + e.amount, 0);
    if (t.expense > 0 && weekendTotal / t.expense > 0.4 && weekend.length >= 4) {
      add({
        id: 'weekend-heavy',
        tone: 'info',
        icon: 'calendar',
        title: `${formatPercent((weekendTotal / t.expense) * 100)} of your spending happens at weekends`,
        body: `${money(weekendTotal)} across ${weekend.length} entries, on roughly two days in seven. Setting a weekend number is usually easier than trying to budget every category.`,
        priority: 3,
      });
    }

    if (month.biggest) {
      add({
        id: `biggest-${month.biggest.id}`,
        tone: 'info',
        icon: 'flag',
        title: `Largest single expense: ${money(month.biggest.amount)}`,
        body: `"${month.biggest.title}" under ${categoryById(month.biggest.category).label}${month.biggest.note ? ` — ${month.biggest.note}` : ''}.`,
        priority: 5,
      });
    }

    const untracked = cats.filter((c) => !state.profile.budgets[c.id] && c.total > t.expense * 0.08);
    if (untracked.length >= 2) {
      add({
        id: 'untracked-categories',
        tone: 'info',
        icon: 'target',
        title: `${untracked.length} sizeable categories have no budget`,
        body: `${untracked.map((c) => c.label).join(', ')} — together ${money(untracked.reduce((s, c) => s + c.total, 0))} this month, with no cap to compare against.`,
        action: { label: 'Set budgets', to: 'settings' },
        priority: 3,
      });
    }

    return out.sort(sortRules);
  }

  /* ──────────────────────────────── Budgets ───────────────────────────── */

  if (section === 'budgets') {
    const lines = month.budgets.filter((l) => l.cap > 0);

    if (!lines.length) {
      add({
        id: 'no-budgets',
        tone: 'info',
        icon: 'target',
        title: 'No budgets set yet',
        body: 'Budgets are what turn this from a record of what happened into something you can steer mid-month. CoinTrack can propose a starting set from your income and typical spending.',
        action: { label: 'Set budgets', to: 'settings' },
        priority: 1,
      });
      return out;
    }

    const over = lines.filter((l) => l.status === 'over');
    const ahead = lines.filter((l) => l.status === 'ahead');
    const capTotal = lines.reduce((s, l) => s + l.cap, 0);
    const spentTotal = lines.reduce((s, l) => s + l.spent, 0);

    if (over.length) {
      add({
        id: 'budgets-over',
        tone: 'bad',
        icon: 'alert',
        title: `${over.length} ${over.length === 1 ? 'budget is' : 'budgets are'} blown`,
        body: over.map((l) => `${l.label} by ${money(l.spent - l.cap)}`).join(', ') + '.',
        priority: 0,
      });
    }
    if (ahead.length) {
      add({
        id: 'budgets-pace',
        tone: 'warn',
        icon: 'clock',
        title: `${ahead.length} running ahead of pace`,
        body: `${ahead.map((l) => `${l.label} (${formatPercent(l.pct)} spent, ${formatPercent(l.pace)} through the month)`).join('; ')}. Still recoverable — that is the point of flagging it now.`,
        priority: 1,
      });
    }
    if (!over.length && !ahead.length) {
      add({
        id: 'budgets-healthy',
        tone: 'good',
        icon: 'check',
        title: 'Every budget is on track',
        body: `${money(spentTotal)} of ${money(capTotal)} used, ${formatPercent(month.progress * 100)} through the month.`,
        priority: 5,
      });
    }

    if (state.profile.monthlyIncome > 0 && capTotal > state.profile.monthlyIncome) {
      add({
        id: 'budgets-exceed-income',
        tone: 'warn',
        icon: 'scale',
        title: 'Your budgets add up to more than you earn',
        body: `${money(capTotal)} of caps against ${money(state.profile.monthlyIncome)} of income. A plan that cannot be met even when every category behaves is worth rebalancing.`,
        action: { label: 'Adjust budgets', to: 'settings' },
        priority: 1,
      });
    }

    const generous = lines.filter((l) => l.cap > 0 && month.progress > 0.7 && l.spent < l.cap * 0.4);
    if (generous.length >= 2) {
      add({
        id: 'budgets-slack',
        tone: 'info',
        icon: 'scissors',
        title: `${generous.length} budgets are barely used`,
        body: `${generous.map((l) => l.label).join(', ')} are all under 40% with the month nearly done. Tightening them frees ${money(generous.reduce((s, l) => s + (l.cap - l.spent), 0))} of planning room for the categories that need it.`,
        priority: 4,
      });
    }

    return out.sort(sortRules);
  }

  /* ───────────────────────────────── Income ───────────────────────────── */

  if (section === 'income') {
    const cats = month.earningCats;
    const t = month.totals;

    if (!cats.length) {
      add({
        id: 'income-none',
        tone: 'warn',
        icon: 'alert',
        title: 'Nothing logged as income this month',
        body: 'Without it the savings rate and every projection on the dashboard have no denominator.',
        action: { label: 'Log an earning', to: 'ledger' },
        priority: 0,
      });
      return out;
    }

    const top = cats[0];
    if (top.share > 85 && t.earning > 0) {
      add({
        id: 'income-concentration',
        tone: 'info',
        icon: 'flag',
        title: `${formatPercent(top.share)} of your income is ${top.label.toLowerCase()}`,
        body: `A single source covering ${money(top.total)} of ${money(t.earning)}. Worth knowing how many months of expenses your savings would cover if it paused — currently ${runwayText(state, month, money)}.`,
        priority: 3,
      });
    }

    if (enoughHistory) {
      const incomes = funded.map((h) => h.earning).filter((v) => v > 0);
      if (incomes.length >= 3) {
        const mean = avg(incomes);
        const spread = Math.max(...incomes) - Math.min(...incomes);
        if (spread / mean > 0.35) {
          add({
            id: 'income-variable',
            tone: 'info',
            icon: 'wave',
            title: 'Your income is not flat',
            body: `Between ${money(Math.min(...incomes))} and ${money(Math.max(...incomes))} over the last few months. With variable income, budgeting against the lowest month rather than the average is what keeps the bad months uneventful.`,
            priority: 3,
          });
        }
      }
      const lastThree = funded.slice(-3).map((h) => h.earning);
      if (lastThree.length === 3 && lastThree[2] > lastThree[0] * 1.1 && lastThree[0] > 0) {
        add({
          id: 'income-rising',
          tone: 'good',
          icon: 'trendUp',
          title: `Income is up ${formatPercent(((lastThree[2] - lastThree[0]) / lastThree[0]) * 100)} over three months`,
          body: `${money(lastThree[0])} → ${money(lastThree[2])}. Whether that turns into savings depends on whether spending followed it up — this month it is ${money(month.totals.expense)} against ${money(prev.totals.expense)} last.`,
          priority: 4,
        });
      }
    }

    if (state.profile.monthlyIncome > 0 && t.earning > 0) {
      const diff = t.earning - state.profile.monthlyIncome;
      if (Math.abs(diff) / state.profile.monthlyIncome > 0.2) {
        add({
          id: 'income-vs-expected',
          tone: diff < 0 ? 'warn' : 'good',
          icon: 'scale',
          title: `${diff < 0 ? 'Below' : 'Above'} your expected ${money(state.profile.monthlyIncome)}`,
          body: `${money(t.earning)} logged so far this month${month.isCurrent ? ', with the month still running' : ''}. Your budgets are sized against the expected figure, so a lasting gap is worth reflecting there.`,
          priority: diff < 0 ? 2 : 5,
        });
      }
    }

    return out.sort(sortRules);
  }

  /* ──────────────────────────────── Savings ───────────────────────────── */

  if (section === 'saving') {
    const t = month.totals;
    const target = state.profile.savingsTargetPct || 0;
    const savedMonths = history.filter((h) => h.saving > 0).length;

    add({
      id: 'savings-summary',
      tone: t.saving > 0 ? 'good' : 'info',
      icon: 'piggy',
      title: t.saving > 0 ? `${money(t.saving)} set aside this month` : 'Nothing set aside yet this month',
      body:
        t.earning > 0
          ? `That is ${formatPercent((t.saving / t.earning) * 100)} of the ${money(t.earning)} that came in. Counting what is simply left over as well, you are keeping ${formatPercent(t.savingsRate)}.`
          : 'Log your income too and this becomes a rate rather than a raw number.',
      priority: t.saving > 0 ? 4 : 2,
    });

    if (target > 0 && t.earning > 0 && t.savingsRate < target) {
      add({
        id: 'savings-gap',
        tone: 'warn',
        icon: 'target',
        title: `${money(((target - t.savingsRate) / 100) * t.earning)} short of your target`,
        body: `A ${formatPercent(target)} target on ${money(t.earning)} is ${money((target / 100) * t.earning)} a month. Moving the money on payday rather than at month end is the single change that most reliably closes a gap this size.`,
        priority: 2,
      });
    }

    if (enoughHistory && savedMonths < funded.length * 0.6) {
      add({
        id: 'savings-inconsistent',
        tone: 'info',
        icon: 'calendar',
        title: `You saved in ${savedMonths} of the last ${funded.length} months`,
        body: 'Irregular saving usually means it happens with whatever is left, which is rarely much. A fixed amount on payday is smaller but adds up to more.',
        priority: 3,
      });
    }

    add({
      id: 'savings-runway',
      tone: 'info',
      icon: 'shield',
      title: 'Your cushion',
      body: `Against a typical month of ${money(avg(funded.map((h) => h.expense)) || month.totals.expense)}, your recorded savings and liquid holdings cover ${runwayText(state, month, money)}.`,
      priority: 3,
    });

    return out.sort(sortRules);
  }

  /* ───────────────────────────── Investments ──────────────────────────── */

  if (section === 'investing') {
    if (inv.empty) {
      add({
        id: 'inv-empty',
        tone: 'info',
        icon: 'chart',
        title: 'No holdings recorded',
        body: 'Add what you already hold — funds, deposits, gold, property — and update the values once a month. The point is a single running figure for what you own, not a live price feed.',
        action: { label: 'Add a holding', to: 'investments' },
        priority: 1,
      });
      return out;
    }

    add({
      id: 'inv-summary',
      tone: inv.gain >= 0 ? 'good' : 'info',
      icon: 'chart',
      title: `${money(inv.netWorth)} across ${inv.rows.length} ${inv.rows.length === 1 ? 'holding' : 'holdings'}`,
      body: `${money(inv.invested)} put in, currently valued at ${money(inv.netWorth)} — a ${inv.gain >= 0 ? 'gain' : 'shortfall'} of ${money(Math.abs(inv.gain))} (${formatPercent(inv.gainPct, 1)}). These are the figures you entered, not live prices.`,
      priority: 4,
    });

    if (inv.staleAssets.length) {
      add({
        id: 'inv-stale',
        tone: 'warn',
        icon: 'clock',
        title: `${inv.staleAssets.length} ${inv.staleAssets.length === 1 ? 'holding has' : 'holdings have'} not been revalued recently`,
        body: `${inv.staleAssets.map((a) => a.name).join(', ')}. Everything above carries the last value you entered forward, so a stale figure quietly distorts the whole net-worth line.`,
        action: { label: 'Update values', to: 'investments' },
        priority: 1,
      });
    }

    const top = inv.byClass[0];
    if (top && top.share > 60 && inv.byClass.length > 1) {
      add({
        id: `inv-concentration-${top.id}`,
        tone: 'info',
        icon: 'pie',
        title: `${formatPercent(top.share)} of your holdings sit in ${top.label.toLowerCase()}`,
        body: `${money(top.value)} of ${money(inv.netWorth)}. That is an observation about how concentrated the recorded portfolio is, not a recommendation either way — what the right mix is depends on things this app does not know.`,
        priority: 3,
      });
    }

    if (!inv.contributedThisMonth) {
      add({
        id: 'inv-no-contribution',
        tone: 'info',
        icon: 'calendar',
        title: 'No contribution recorded this month',
        body: `Nothing logged as paid in for ${new Date().toLocaleDateString(undefined, { month: 'long' })}. If you did invest, recording it keeps the gain figure honest — otherwise every deposit reads as growth.`,
        action: { label: 'Record a contribution', to: 'investments' },
        priority: 2,
      });
    }

    const savedToInvest = month.entries
      .filter((e) => e.kind === 'saving' && e.category === 'invest-transfer')
      .reduce((s, e) => s + e.amount, 0);
    if (savedToInvest > 0 && Math.abs(savedToInvest - inv.contributedThisMonth) > savedToInvest * 0.2) {
      add({
        id: 'inv-mismatch',
        tone: 'warn',
        icon: 'scale',
        title: 'Ledger and holdings disagree this month',
        body: `${money(savedToInvest)} logged as moved to investments, but ${money(inv.contributedThisMonth)} recorded as contributed. One of the two is probably missing an entry.`,
        priority: 2,
      });
    }

    add({
      id: 'inv-disclaimer',
      tone: 'info',
      icon: 'info',
      title: 'What this section does and does not do',
      body: 'It describes the holdings you have entered — size, mix, how current the figures are, whether contributions are being recorded. It does not value anything for you, and it will not tell you what to buy or sell.',
      priority: 8,
    });

    return out.sort(sortRules);
  }

  return out.sort(sortRules);
}

function sortRules(a, b) {
  if (a.priority !== b.priority) return a.priority - b.priority;
  return RANK[a.tone] - RANK[b.tone];
}

/** Months of typical spending covered by savings entries plus liquid holdings. */
function runwayText(state, month, money) {
  const savedTotal = state.entries
    .filter((e) => e.kind === 'saving')
    .reduce((s, e) => s + Math.abs(Number(e.amount) || 0), 0);
  const inv = computeInvestments(state, 12);
  const liquid = inv.byClass
    .filter((c) => c.id === 'cash' || c.id === 'bond')
    .reduce((s, c) => s + c.value, 0);
  const cushion = savedTotal + liquid;
  const burn = month.totals.expense || 1;
  const months = cushion / burn;
  if (cushion <= 0) return 'nothing recorded yet';
  return `${months.toFixed(1)} months (${money(cushion)})`;
}

/** Suggestions for a section, minus anything the user has dismissed. */
export function liveSuggestions(state, section) {
  const all = buildSuggestions(state, section);
  const dismissed = new Set(state.dismissed);
  return {
    shown: all.filter((s) => !dismissed.has(s.id)),
    hidden: all.filter((s) => dismissed.has(s.id)).length,
  };
}

/** The few most urgent items across the whole app, for the dashboard. */
export function headlineSuggestions(state, limit = 3) {
  const dismissed = new Set(state.dismissed);
  const pool = ['overall', 'budgets', 'saving', 'investing'].flatMap((s) => buildSuggestions(state, s));
  const seen = new Set();
  return pool
    .filter((s) => {
      if (dismissed.has(s.id) || seen.has(s.id)) return false;
      seen.add(s.id);
      return s.priority <= 2;
    })
    .sort(sortRules)
    .slice(0, limit);
}
