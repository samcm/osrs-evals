/** A log value axis on 1-2-5 steps, for cost and other quantities that span decades. */

import { valueAxis, type ChartChromeColors } from './chartChrome';
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

/** A log axis from lo to hi with labels and split lines on the 1-2-5 steps. */
export function logAxis(colors: ChartChromeColors, lo: number, hi: number, format: (value: number) => string) {
  const base = valueAxis(colors);
  let steps = niceSteps(lo, hi);
  // Over many decades every 1-2-5 label would crowd: keep the powers of ten
  if (steps.length > 9) steps = steps.filter(v => Math.abs(Math.log10(v) - Math.round(Math.log10(v))) < 1e-9);
  return {
    type: 'log' as const,
    logBase: 10,
    min: lo,
    max: hi,
    ...base,
    axisLabel: { ...base.axisLabel, customValues: steps, formatter: (v: number) => format(v), hideOverlap: true },
    axisTick: { show: false, customValues: steps },
    splitLine: base.splitLine,
    minorSplitLine: { show: false },
  };
}
