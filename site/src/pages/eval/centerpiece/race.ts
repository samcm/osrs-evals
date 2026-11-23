/** The race's data: which runs race, and how far along each one is at a tick. */

import { resultValue, type RankedVariant, type RunCurve } from '@/pages/eval/model';

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
    // The median run; of two middle runs, the better (so two runs show the better, not the worse)
    return pick === 'best' ? sorted[0] : sorted[Math.ceil(sorted.length / 2) - 1];
  });
}

export interface RaceRow {
  curve: RunCurve;
  /** The pairing the run belongs to, with its results over all its runs */
  pairing: RankedVariant;
  /** Place, from 1: the pairing's place by the eval's score (the run's within it, for every run) */
  place: number;
}

/**
 * The race's rows in the eval's ranking (`ranked`, by its score: median result, or how many
 * finished and how fast), each pairing's runs best first. The order is the final one from the first
 * frame, so the answer never waits for the playback and rows never move under the pointer.
 */
export function raceRows(runners: RunCurve[], ranked: RankedVariant[]): RaceRow[] {
  const at = new Map(ranked.map((r, i) => [r.variant.key, i]));
  return runners
    .filter(cv => at.has(cv.variant.key))
    .sort((a, b) => at.get(a.variant.key)! - at.get(b.variant.key)! || compareRuns(a, b))
    .map((curve, i) => ({ curve, pairing: ranked[at.get(curve.variant.key)!], place: i + 1 }));
}
