/**
 * How charts arrive.
 *
 * Every chart used to appear fully drawn. Now lines draw across, bars rise from
 * the baseline and a donut sweeps round — and, the part that earns its keep,
 * they *morph* when the data behind them changes: step from month to quarter
 * and the bars travel to their new heights instead of being swapped for a
 * different picture. That motion is what lets you see which figures moved.
 *
 * Series in the same chart start a beat apart, in the order they are read, so
 * the eye lands on the main series first.
 *
 * Off entirely under `prefers-reduced-motion`: the chart is simply there.
 */

import { prefersReducedMotion } from './motion';

const BEAT = 110;

export function chartMotion(order = 0, { duration = 720 } = {}) {
  if (prefersReducedMotion()) return { isAnimationActive: false };
  return {
    isAnimationActive: true,
    animationDuration: duration,
    animationEasing: 'ease-out',
    animationBegin: order * BEAT,
  };
}
