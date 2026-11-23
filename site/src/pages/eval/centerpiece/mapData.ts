/**
 * The race map's data, apart from its drawing: each racing run's track, the tiles the view is fitted
 * to, and a run's quests as marks where it did them.
 */

import type { PathPoint } from '@/data/types';
import { questSrc, uiSrc } from '@/lib/assets';
import { positionAt, UNDERGROUND_Z } from '@/lib/map';
import type { RunCurve } from '@/pages/eval/model';

export interface Track {
  curve: RunCurve;
  /** The run's first account's path */
  points: readonly PathPoint[];
  /** A team's other accounts, each a path and a pin of its own in the run's colour */
  others: { name: string; points: readonly PathPoint[] }[];
  /** Most ticks between two recorded points while walking */
  step: number;
  /** Quests, with where they were done */
  marks: { tick: number; x: number; z: number; src: string; inferred: boolean }[];
  /** Place at the playhead, from 0 */
  rank: number;
}

/** Where the runs went: the tiles the view is fitted to. */
export interface Bounds {
  x0: number;
  z0: number;
  x1: number;
  z1: number;
}

/**
 * The tiles every run of an eval went to, as drawn on the surface map, without the stray far-off
 * points: the middle 99% of every recorded position on each axis.
 */
export function pathBounds(paths: readonly (readonly PathPoint[])[]): Bounds | null {
  const xs: number[] = [];
  const zs: number[] = [];
  for (const path of paths)
    for (const p of path) {
      xs.push(p[1]);
      zs.push(p[2] >= UNDERGROUND_Z ? p[2] - UNDERGROUND_Z : p[2]);
    }
  if (xs.length === 0) return null;
  xs.sort((a, b) => a - b);
  zs.sort((a, b) => a - b);
  const at = (values: number[], q: number): number =>
    values[Math.min(values.length - 1, Math.floor(q * values.length))];
  return { x0: at(xs, 0.005), z0: at(zs, 0.005), x1: at(xs, 0.995), z1: at(zs, 0.995) };
}

/** A pin's radius on the map, in CSS pixels */
export const PIN = 10;

/** A run's quests as map marks, placed where it was at the time. */
export function marksOf(
  events: { kind: string; tick: number; quest?: string | null; source?: string }[] | undefined,
  points: readonly PathPoint[],
  step: number
): Track['marks'] {
  if (!events) return [];
  return events.flatMap(e => {
    if (e.kind !== 'quest') return [];
    const p = positionAt(points, e.tick, step);
    if (!p) return [];
    return [
      {
        tick: e.tick,
        x: p.x,
        z: p.z,
        src: e.quest ? questSrc(e.quest) : uiSrc('quests'),
        inferred: e.source === 'inferred',
      },
    ];
  });
}

/** Where a pin was last drawn, in the map's CSS pixels, for hovering it. */
export interface PlacedPin {
  x: number;
  y: number;
  key: string;
  /** The account it is, named on hover in a team's run */
  account: string | null;
}
