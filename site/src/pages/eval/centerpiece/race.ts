/** The race's data: which runs race, and how far along each one is at a tick. */

import { resultValue, valueAt, type RunCurve } from '../model';

/** Each pairing's median or best run, or every run (the page's `agg`) */
export type Pick = 'median' | 'best' | 'runs';

/** The first tick a run held at least `value`; Infinity if never. */
export function reachedAt(curve: RunCurve, value: number): number {
  return curve.points.find(p => p.value >= value)?.tick ?? Infinity;
}

const result = (cv: RunCurve): number => resultValue(cv.run) ?? cv.points[cv.points.length - 1]?.value ?? 0;

/** Better first: the higher result, then the earlier to reach it. */
function compareRuns(a: RunCurve, b: RunCurve): number {
  const ra = result(a);
  const rb = result(b);
  return rb - ra || reachedAt(a, ra) - reachedAt(b, rb) || a.run.epoch - b.run.epoch;
}

/** The runs that race: every run, or one per model + harness pairing (its median or best run). */
export function pickRunners(curves: RunCurve[], pick: Pick): RunCurve[] {
  if (pick === 'runs') return curves;
  const groups = new Map<string, RunCurve[]>();
  for (const cv of curves) groups.set(cv.variant.key, [...(groups.get(cv.variant.key) ?? []), cv]);
  return [...groups.values()].map(group => {
    const sorted = [...group].sort(compareRuns);
    return pick === 'best' ? sorted[0] : sorted[Math.floor(sorted.length / 2)];
  });
}

export interface Standing {
  curve: RunCurve;
  value: number;
  /** Place at the tick, from 0 */
  rank: number;
}

/**
 * Each runner's value at a tick and its place: the higher value first, then whoever reached it
 * first, then the final order (`order`, best first) so ties never shuffle.
 */
export function standings(runners: RunCurve[], tick: number, order: Map<string, number>): Standing[] {
  const rows = runners.map(curve => {
    const value = valueAt(curve, 'ticks', tick) ?? 0;
    return { curve, value, at: reachedAt(curve, value), rank: 0 };
  });
  const sorted = [...rows].sort((a, b) => b.value - a.value || a.at - b.at || (order.get(a.curve.run.id) ?? 0) - (order.get(b.curve.run.id) ?? 0));
  sorted.forEach((row, i) => (row.rank = i));
  return rows;
}

/** The final order of the runners, best first. */
export function finalOrder(runners: RunCurve[]): Map<string, number> {
  return new Map([...runners].sort(compareRuns).map((cv, i) => [cv.run.id, i]));
}
