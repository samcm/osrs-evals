/** A log value axis on 1-2-5 steps, for cost and other quantities that span decades. */

import { niceSteps, stepAbove, stepBelow } from './stats';

/** The 1-2-5 range around the positive values, or null when there are none. */
export function logRange(values: number[]): [number, number] | null {
  const positive = values.filter(v => v > 0 && Number.isFinite(v));
  if (positive.length === 0) return null;
  const lo = stepBelow(Math.min(...positive));
  let hi = stepAbove(Math.max(...positive));
  if (hi <= lo) hi = stepAbove(lo * 1.01);
  return [lo, hi];
}

/** The 1-2-5 ticks from lo to hi; over many decades, only the powers of ten so labels don't crowd. */
export function logTicks(lo: number, hi: number): number[] {
  const steps = niceSteps(lo, hi);
  return steps.length > 9 ? steps.filter(v => Math.abs(Math.log10(v) - Math.round(Math.log10(v))) < 1e-9) : steps;
}
