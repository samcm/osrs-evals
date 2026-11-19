/** The race's data: which runs race, where each one is at a tick, and how far along it is. */

import type { PathPoint } from '@/data/types';
import { indexAt, UNDERGROUND_Z } from '@/lib/map';
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

/** Where a run was at a tick, in tiles; `surface` false while underground or on another plane. */
export interface Position {
  x: number;
  z: number;
  surface: boolean;
}

const onSurface = (p: PathPoint): boolean => p[2] < UNDERGROUND_Z && p[3] === 0;

/**
 * A run's position at a tick. Paths only record changes, so between two points the character
 * stood still and then walked for at most `step` ticks; a jump (teleport, ladder, respawn) is not
 * walked. Underground, it is the last surface position, marked not on the surface.
 */
export function positionAt(points: readonly PathPoint[], tick: number, step: number): Position | null {
  if (points.length === 0) return null;
  const i = Math.max(0, indexAt(points as unknown as Parameters<typeof indexAt>[0], tick));
  const p = points[i];
  if (!onSurface(p)) {
    for (let j = i - 1; j >= 0; j--) if (onSurface(points[j])) return { x: points[j][1], z: points[j][2], surface: false };
    return null;
  }
  const q = points[i + 1];
  if (!q || q[4] === 1 || !onSurface(q) || tick <= p[0]) return { x: p[1], z: p[2], surface: true };
  const start = Math.max(p[0], q[0] - step);
  if (tick <= start) return { x: p[1], z: p[2], surface: true };
  const f = (tick - start) / (q[0] - start);
  return { x: p[1] + (q[1] - p[1]) * f, z: p[2] + (q[2] - p[2]) * f, surface: true };
}
