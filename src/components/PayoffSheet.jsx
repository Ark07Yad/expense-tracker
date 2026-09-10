/**
 * A debt's payoff schedule.
 *
 * The card can say a debt clears in 248 months. It cannot say *why* that is,
 * and the why is the part worth seeing: early on, most of a payment services
 * the interest and barely touches what you owe. A schedule shows that split
 * year by year, which is the difference between a number and an explanation.
 *
 * Purely descriptive. It plots the consequences of figures already entered and
 * makes no suggestion about what to pay — what anyone should do with a debt
 * depends on things this app does not know.
 */

import { useMemo } from 'react';
import {
  Area, AreaChart, Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer,
  Tooltip, XAxis, YAxis,
} from 'recharts';
import { useStore } from '../lib/store';
import { amortisationByYear, amortisationOf } from '../lib/useFinance';
import { addMonths, formatMoney, formatPercent, todayKey } from '../lib/calc';
import { Empty, Icon, Sheet, tooltipStyle } from './ui';

export default function PayoffSheet({ debt, onClose }) {
  const { state } = useStore();
  const cur = state.profile.currency;

  const plan = useMemo(() => {
    if (!debt) return null;
    const schedule = amortisationOf({
      balance: debt.balance,
      rate: debt.rate,
      monthlyPayment: debt.typicalPayment,
    });
    return { schedule, years: amortisationByYear(schedule, todayKey()) };
  }, [debt]);

  if (!debt) return null;

  const { schedule, years } = plan;
  const clearsOn = schedule.months ? addMonths(todayKey(), schedule.months) : null;
  const totalPaid = debt.balance + schedule.totalInterest;

  return (
    <Sheet
      open
      onClose={onClose}
      title={debt.name}
      subtitle={`${formatMoney(debt.balance, cur)} outstanding${debt.rate !== null ? ` at ${formatPercent(debt.rate, 1)} a year` : ''}`}
    >
      {schedule.neverClears ? (
        <Empty
          icon="alert"
          title="These payments never clear it"
          body={`At ${formatPercent(debt.rate, 1)} the interest alone is about ${formatMoney(debt.payoff.monthlyInterest, cur)} a month, and recent payments have averaged ${formatMoney(debt.typicalPayment, cur)}. There is no schedule to draw, because on these numbers the balance does not come down.`}
        />
      ) : !schedule.rows.length ? (
        <Empty
          icon="calendar"
          title="Nothing to project yet"
          body="Log a payment against this debt, or record one in the monthly update, and this works out how long it takes and what it costs."
        />
      ) : (
        <div className="space-y-5">
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
            {[
              ['Cleared by', clearsOn ? new Date(`${clearsOn}T12:00:00`).toLocaleDateString(undefined, { month: 'short', year: 'numeric' }) : '—'],
              ['Interest on the way', formatMoney(schedule.totalInterest, cur, { compact: true })],
              ['Paid in total', formatMoney(totalPaid, cur, { compact: true })],
            ].map(([label, value]) => (
              <div key={label} className="surface rounded-2xl p-3">
                <div className="text-[10.5px] uppercase tracking-wider text-faint leading-tight">{label}</div>
                <div className="text-[16px] font-semibold display tabular mt-1">{value}</div>
              </div>
            ))}
          </div>

          <p className="text-[12px] text-dim leading-relaxed">
            At {formatMoney(debt.typicalPayment, cur)} a month — your recent average — this takes{' '}
            {schedule.months} {schedule.months === 1 ? 'month' : 'months'}, and{' '}
            {formatPercent((schedule.totalInterest / totalPaid) * 100)} of everything you pay goes on
            interest rather than the balance.
            {schedule.truncated && ' Beyond fifty years the projection stops rather than guessing.'}
          </p>

          <div>
            <div className="text-[11px] uppercase tracking-wider text-faint mb-2">
              Where each year's payments go
            </div>
            <div className="h-56 -ml-2">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={years} margin={{ top: 6, right: 6, bottom: 0, left: 0 }}>
                  <CartesianGrid vertical={false} strokeDasharray="3 3" />
                  <XAxis dataKey="label" axisLine={false} tickLine={false} minTickGap={12} />
                  <YAxis
                    axisLine={false} tickLine={false} width={52}
                    tickFormatter={(v) => formatMoney(v, cur, { compact: true, decimals: 0 })}
                  />
                  <Tooltip
                    contentStyle={tooltipStyle}
                    formatter={(v, n) => [formatMoney(v, cur), n === 'interest' ? 'Interest' : 'Off the balance']}
                  />
                  <Bar dataKey="principal" stackId="p" fill="var(--tone-good)" radius={[0, 0, 4, 4]} isAnimationActive={false} />
                  <Bar dataKey="interest" stackId="p" fill="var(--tone-bad)" radius={[4, 4, 0, 0]} isAnimationActive={false} />
                  <Legend
                    formatter={(n) => (
                      <span style={{ color: 'var(--text-dim)', fontSize: 11 }}>
                        {n === 'interest' ? 'Interest' : 'Off the balance'}
                      </span>
                    )}
                    iconType="circle"
                    iconSize={7}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div>
            <div className="text-[11px] uppercase tracking-wider text-faint mb-2">What is left to pay</div>
            <div className="h-40 -ml-2">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={years} margin={{ top: 6, right: 6, bottom: 0, left: 0 }}>
                  <defs>
                    <linearGradient id="payoffLeft" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="var(--tone-bad)" stopOpacity={0.4} />
                      <stop offset="100%" stopColor="var(--tone-bad)" stopOpacity={0.02} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid vertical={false} strokeDasharray="3 3" />
                  <XAxis dataKey="label" axisLine={false} tickLine={false} minTickGap={12} />
                  <YAxis
                    axisLine={false} tickLine={false} width={52}
                    tickFormatter={(v) => formatMoney(v, cur, { compact: true, decimals: 0 })}
                  />
                  <Tooltip contentStyle={tooltipStyle} formatter={(v) => [formatMoney(v, cur), 'Still owed']} />
                  <Area
                    type="monotone" dataKey="balance" stroke="var(--tone-bad)" strokeWidth={2.2}
                    fill="url(#payoffLeft)" isAnimationActive={false}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="flex items-start gap-2.5 text-[11.5px] text-faint leading-relaxed">
            <Icon name="info" className="size-4 shrink-0 mt-px" />
            <p>
              A projection from the rate and balance you entered and what you have been paying
              lately. It assumes the payment and the rate both hold — change either and the shape
              changes with it.
            </p>
          </div>
        </div>
      )}
    </Sheet>
  );
}
