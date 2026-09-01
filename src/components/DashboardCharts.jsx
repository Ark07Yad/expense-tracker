/**
 * The dashboard's charts, split out so they load after the page does.
 *
 * Recharts is by far the heaviest thing in this app — larger than React and all
 * of the application code put together. Keeping it off the first paint means
 * the hero, the figures and the suggestions are on screen and interactive while
 * the charts are still arriving, which is the right order: those are the parts
 * you read first, and on most screens the charts are below the fold anyway.
 */

import {
  Area, AreaChart, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';
import { formatMoney } from '../lib/calc';
import { tooltipStyle } from './ui';

/** Daily spend for the last 30 days, with a seven-day mean through it. */
export function SpendTrend({ data, cur }) {
  return (
    <div className="h-52 -ml-2">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 6, right: 6, bottom: 0, left: 0 }}>
          <defs>
            <linearGradient id="dashSpend" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--color-brand-400)" stopOpacity={0.45} />
              <stop offset="100%" stopColor="var(--color-brand-400)" stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <XAxis dataKey="label" axisLine={false} tickLine={false} interval="preserveStartEnd" minTickGap={26} />
          <YAxis
            axisLine={false}
            tickLine={false}
            width={46}
            tickFormatter={(v) => formatMoney(v, cur, { compact: true, decimals: 0 })}
          />
          <Tooltip
            contentStyle={tooltipStyle}
            labelStyle={{ color: 'var(--text-dim)' }}
            formatter={(v, n) => [formatMoney(v, cur), n === 'avg' ? '7-day average' : 'Spent']}
          />
          <Area
            isAnimationActive={false}
            type="monotone"
            dataKey="value"
            stroke="var(--color-brand-400)"
            strokeWidth={1.6}
            fill="url(#dashSpend)"
          />
          <Area
            isAnimationActive={false}
            type="monotone"
            dataKey="avg"
            stroke="var(--tone-invest)"
            strokeWidth={2.2}
            strokeDasharray="5 4"
            fill="none"
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

/** Expense mix for the month. The total in the middle is drawn by the caller. */
export function CategoryDonut({ data, cur }) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <PieChart>
        <Pie
          data={data}
          dataKey="total"
          nameKey="label"
          innerRadius="62%"
          outerRadius="94%"
          paddingAngle={2}
          stroke="none"
          isAnimationActive={false}
        >
          {data.map((c) => <Cell key={c.id} fill={c.color} />)}
        </Pie>
        <Tooltip contentStyle={tooltipStyle} formatter={(v, n) => [formatMoney(v, cur), n]} />
      </PieChart>
    </ResponsiveContainer>
  );
}

/** Net worth against contributions — the gap between them is the return. */
export function NetWorthSpark({ data, cur }) {
  return (
    <div className="h-24 mt-3 -mx-1">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 4, right: 4, bottom: 0, left: 4 }}>
          {/* A zero-based axis flattens a net-worth line into a solid block —
              the month-to-month movement is the whole point, so the floor sits
              just under the lowest value. */}
          <YAxis hide domain={[(min) => Math.max(0, min * 0.88), (max) => max * 1.04]} />
          <defs>
            <linearGradient id="dashWorth" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--tone-invest)" stopOpacity={0.4} />
              <stop offset="100%" stopColor="var(--tone-invest)" stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <Tooltip
            contentStyle={tooltipStyle}
            labelFormatter={(_, p) => p?.[0]?.payload?.label ?? ''}
            formatter={(v, n) => [formatMoney(v, cur), n === 'invested' ? 'Paid in' : 'Value']}
          />
          <Area
            isAnimationActive={false}
            type="monotone"
            dataKey="value"
            stroke="var(--tone-invest)"
            strokeWidth={2}
            fill="url(#dashWorth)"
          />
          <Area
            isAnimationActive={false}
            type="monotone"
            dataKey="invested"
            stroke="var(--text-faint)"
            strokeWidth={1.2}
            strokeDasharray="4 4"
            fill="none"
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
