/** Aggregates over runs: per variant, per model, per agent. */

import type { Run } from '@/data/types';
import { compareVariants, variantOf, type Variant } from './series';

export function median(values: (number | null | undefined)[]): number | null {
  const v = values.filter((x): x is number => x != null && !Number.isNaN(x)).sort((a, b) => a - b);
  if (v.length === 0) return null;
  const mid = Math.floor(v.length / 2);
  return v.length % 2 ? v[mid] : (v[mid - 1] + v[mid]) / 2;
}

export function mean(values: (number | null | undefined)[]): number | null {
  const v = values.filter((x): x is number => x != null && !Number.isNaN(x));
  return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
}

export function sum(values: (number | null | undefined)[]): number {
  return values.reduce<number>((a, b) => a + (b ?? 0), 0);
}

/** Share of wall time spent waiting on the model, over a set of runs. */
export function waitShare(runs: Run[]): number | null {
  const wall = sum(runs.map(r => r.game_seconds));
  return wall > 0 ? Math.min(1, sum(runs.map(r => r.model_seconds)) / wall) : null;
}

export interface GroupStats {
  runs: Run[];
  n: number;
  /** Runs that can finish (their eval has a target) */
  scored: number;
  finished: number;
  finishRate: number | null;
  medianTicks: number | null;
  medianSeconds: number | null;
  medianCost: number | null;
  meanCost: number | null;
  totalCost: number | null;
  medianCalls: number | null;
  medianOutputTokens: number | null;
  medianTps: number | null;
  waitShare: number | null;
  meanModelSeconds: number | null;
  meanWallSeconds: number | null;
  medianScore: number | null;
}

export function groupStats(runs: Run[]): GroupStats {
  const withTarget = runs.filter(r => r.success != null);
  const finished = withTarget.filter(r => r.success);
  const costs = runs.map(r => r.cost);
  return {
    runs,
    n: runs.length,
    scored: withTarget.length,
    finished: finished.length,
    finishRate: withTarget.length ? finished.length / withTarget.length : null,
    medianTicks: median(finished.map(r => r.ticks)),
    medianSeconds: median(finished.map(r => r.seconds)),
    medianCost: median(costs),
    meanCost: mean(costs),
    totalCost: costs.some(c => c != null) ? sum(costs) : null,
    medianCalls: median(runs.map(r => r.model_calls)),
    medianOutputTokens: median(runs.map(r => r.output_tokens)),
    medianTps: median(runs.map(r => r.output_tokens_per_second)),
    waitShare: waitShare(runs),
    meanModelSeconds: mean(runs.map(r => r.model_seconds)),
    meanWallSeconds: mean(runs.map(r => r.game_seconds)),
    medianScore: median(runs.map(r => r.final_value ?? r.score)),
  };
}

export interface VariantStats extends GroupStats {
  variant: Variant;
}

/** Runs grouped by variant (model and agent), in a stable order. */
export function byVariant(runs: Run[]): VariantStats[] {
  const groups = new Map<string, { variant: Variant; runs: Run[] }>();
  for (const run of runs) {
    const variant = variantOf(run);
    const group = groups.get(variant.key) ?? { variant, runs: [] };
    group.runs.push(run);
    groups.set(variant.key, group);
  }
  return [...groups.values()]
    .map(g => ({ variant: g.variant, ...groupStats(g.runs) }))
    .sort((a, b) => compareVariants(a.variant, b.variant));
}

/** Group runs by any key. */
export function groupBy<T>(items: T[], key: (item: T) => string): Map<string, T[]> {
  const out = new Map<string, T[]>();
  for (const item of items) {
    const k = key(item);
    out.set(k, [...(out.get(k) ?? []), item]);
  }
  return out;
}

/** Keys on the Pareto frontier: no other point is cheaper or equal and higher or equal, with one strict. */
export function paretoFrontier<T>(points: T[], x: (p: T) => number, y: (p: T) => number): T[] {
  return points
    .filter(
      p =>
        !points.some(o => o !== p && x(o) <= x(p) && y(o) >= y(p) && (x(o) < x(p) || y(o) > y(p)))
    )
    .sort((a, b) => x(a) - x(b));
}

/** 1-2-5 steps between lo and hi, for a log axis. */
export function niceSteps(lo: number, hi: number): number[] {
  const out: number[] = [];
  for (let e = Math.floor(Math.log10(lo)) - 1; e <= Math.ceil(Math.log10(hi)); e++) {
    for (const m of [1, 2, 5]) {
      const v = Number((m * 10 ** e).toPrecision(3));
      if (v >= lo && v <= hi) out.push(v);
    }
  }
  return out;
}

/** The 1-2-5 step at or below v, and at or above v. */
export function stepBelow(v: number): number {
  const e = Math.floor(Math.log10(v));
  const candidates = [5, 2, 1].map(m => m * 10 ** e);
  return Number((candidates.find(c => c <= v * (1 + 1e-9)) ?? 10 ** (e - 1) * 5).toPrecision(3));
}

export function stepAbove(v: number): number {
  const e = Math.floor(Math.log10(v));
  const candidates = [1, 2, 5, 10].map(m => m * 10 ** e);
  return Number((candidates.find(c => c >= v * (1 - 1e-9)) ?? 10 ** (e + 1)).toPrecision(3));
}
