/** Pieces shared by the eval page's charts: round ticks, x formats, collision-free point labels. */

import { formatClock, formatCost, formatCostTick, formatInt } from '@/lib/format';
import type { XMeasure } from './model';

export type Measure = XMeasure | 'tokens' | 'share' | 'count';

const compact = new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 });

/** A value on a measure, for tooltips and cells. */
export function formatX(value: number | null | undefined, x: Measure): string {
  if (value == null) return '–';
  if (x === 'ticks') return `${formatInt(value)} ticks`;
  if (x === 'seconds') return formatClock(value);
  if (x === 'cost') return formatCost(value);
  if (x === 'tokens') return `${compact.format(Math.round(value))} tokens`;
  if (x === 'share') return `${Math.round(value * 100)}%`;
  if (x === 'calls') return `${formatInt(value)} calls`;
  return formatInt(value);
}

/** An axis tick on a measure: compact thousands ("10K"), clock times, dollars on 1-2-5 steps. */
export function formatTick(value: number, x: Measure): string {
  if (x === 'seconds') return formatClock(value);
  if (x === 'cost') return formatCostTick(value);
  if (x === 'share') return `${Math.round(value * 100)}%`;
  if (Math.abs(value) >= 1000) return compact.format(value);
  return formatInt(value);
}

const CLOCK_STEPS = [10, 30, 60, 120, 300, 600, 900, 1800, 3600, 7200];

/**
 * Round ticks from 0 up to `max`: the smallest 1-2-5 step (whole minutes for clock times) that
 * gives at most `count` intervals. The axis may end past the last tick (at the budget).
 */
export function roundTicks(max: number, x: Measure = 'count', count = 5): number[] {
  if (!(max > 0)) return [0];
  let step: number;
  if (x === 'seconds') step = CLOCK_STEPS.find(s => max / s <= count) ?? Math.ceil(max / count / 3600) * 3600;
  else {
    const e = 10 ** Math.floor(Math.log10(max / count));
    step = [1, 2, 5, 10].map(m => m * e).find(s => max / s <= count) ?? 10 * e;
    if (x === 'count' || x === 'calls' || x === 'ticks') step = Math.max(1, step);
  }
  const ticks: number[] = [];
  for (let v = 0; v <= max + step * 1e-9; v += step) ticks.push(Number(v.toPrecision(12)));
  return ticks;
}

/** The axis end for a count: the last round tick at or above the value. */
export function roundMax(value: number, x: Measure = 'count'): number {
  const ticks = roundTicks(value, x);
  const last = ticks[ticks.length - 1];
  if (last >= value) return last;
  return last + (ticks[1] - ticks[0] || 1);
}

export type LabelPosition =
  | 'right'
  | 'left'
  | 'top'
  | 'bottom'
  | 'top-right'
  | 'top-left'
  | 'bottom-right'
  | 'bottom-left';

/**
 * Place point labels so they stay in the box and clear each other and the points: each label takes
 * the first of right, left, above, below (centred, then to either side) that fits, from the top point down.
 * Points marked `optional` are placed after the others and lose their label (null) when none fits.
 */
export function placePointLabels(
  points: { px: number; py: number; width: number; optional?: boolean }[],
  box: { x: number; y: number; width: number; height: number }
): ([LabelPosition, [number, number]] | null)[] {
  type Rect = [number, number, number, number];
  const overlaps = (a: Rect, b: Rect): boolean => a[0] < b[2] && b[0] < a[2] && a[1] < b[3] && b[1] < a[3];
  const marks: Rect[] = points.map(p => [p.px - 6, p.py - 6, p.px + 6, p.py + 6]);
  const placed: Rect[] = [];
  const out: ([LabelPosition, [number, number]] | null)[] = points.map(() => ['right', [0, 0]]);
  const order = points
    .map((_, i) => i)
    .sort(
      (a, b) =>
        Number(!!points[a].optional) - Number(!!points[b].optional) ||
        points[a].py - points[b].py ||
        points[a].px - points[b].px
    );
  for (const i of order) {
    const { px, py, width: w } = points[i];
    const h = 20;
    const candidates: [LabelPosition, Rect][] = [
      ['right', [px + 9, py - h / 2, px + 9 + w, py + h / 2]],
      ['left', [px - 9 - w, py - h / 2, px - 9, py + h / 2]],
      ['top', [px - w / 2, py - 11 - h, px + w / 2, py - 11]],
      ['bottom', [px - w / 2, py + 11, px + w / 2, py + 11 + h]],
      ['top-right', [px - 4, py - 11 - h, px - 4 + w, py - 11]],
      ['top-left', [px + 4 - w, py - 11 - h, px + 4, py - 11]],
      ['bottom-right', [px - 4, py + 11, px - 4 + w, py + 11 + h]],
      ['bottom-left', [px + 4 - w, py + 11, px + 4, py + 11 + h]],
    ];
    const inside = ([, r]: [LabelPosition, Rect]): boolean =>
      r[0] >= box.x && r[2] <= box.x + box.width && r[1] >= box.y - 4 && r[3] <= box.y + box.height + 4;
    const fits = (cand: [LabelPosition, Rect]): boolean =>
      inside(cand) && !placed.some(o => overlaps(o, cand[1])) && !marks.some((m, j) => j !== i && overlaps(m, cand[1]));
    const fit = candidates.find(fits);
    if (!fit && points[i].optional) {
      out[i] = null;
      continue;
    }
    const choice = fit ?? candidates.find(inside) ?? candidates[0];
    out[i] = [choice[0], [choice[1][0], choice[1][1]]];
    placed.push(choice[1]);
  }
  return out;
}

/** An approximate label width: a 14px mark, a gap, and the text. */
export const labelWidth = (text: string): number => 22 + text.length * 6.6;
