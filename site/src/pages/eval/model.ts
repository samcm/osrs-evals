/** The eval page's data: each run's progress curve on every x measure, and the per-variant cuts. */

import type { Eval, EvalRuns, Run, RunDetail } from '@/data/types';
import { median, stepAbove, stepBelow } from '@/lib/stats';
import { variantOf, type Variant } from '@/lib/series';
import { agentSeries, modelSeries, variantSeries, type SeriesSpec } from '@/lib/chartSeries';
import { resultValue } from '@/lib/runResult';

export { resultValue };

export type XMeasure = 'ticks' | 'seconds' | 'cost' | 'calls';
export type Agg = 'runs' | 'median' | 'best';
export type ParetoX = 'cost' | 'seconds' | 'ticks';
export type CdfX = ParetoX;
export type GroupBy = 'variant' | 'model' | 'agent';

export const X_OPTIONS: { value: XMeasure; label: string }[] = [
  { value: 'ticks', label: 'Ticks' },
  { value: 'seconds', label: 'Seconds' },
  { value: 'cost', label: 'Cost' },
  { value: 'calls', label: 'Calls' },
];

export interface CurvePoint {
  tick: number;
  seconds: number;
  /** Null when the model has no price */
  cost: number | null;
  /** Model calls sent by then; null until the run's detail is loaded */
  calls: number | null;
  value: number;
}

export interface RunCurve {
  run: Run;
  variant: Variant;
  points: CurvePoint[];
}

const nonNull = <T>(v: T | null | undefined): v is T => v != null;

/** Total ticks the eval allows: the budget of every attempt. */
export const totalBudgetTicks = (e: Eval): number => e.budget_ticks * Math.max(1, e.attempts);
/** The same budget in wall-clock seconds at the tick rate. */
export const totalBudgetSeconds = (e: Eval): number => (totalBudgetTicks(e) * e.tick_ms) / 1000;

/** A cumulative count of model calls by tick, from a run's detail. */
export function callsByTick(detail: RunDetail): (tick: number) => number {
  const ticks = detail.series.calls.tick.filter(nonNull).sort((a, b) => a - b);
  return tick => {
    let lo = 0;
    let hi = ticks.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (ticks[mid] <= tick) lo = mid + 1;
      else hi = mid;
    }
    return lo;
  };
}

/**
 * Each run's progress from the eval's shared grid, ending at the run's own end with its final
 * value. Once a run reaches the target it holds it (the harness may reset the account after). A
 * single-attempt run's exact finish tick is added, since the grid is coarse.
 */
export function buildCurves(e: Eval, grid: EvalRuns | undefined, runs: Run[], calls: Map<string, (tick: number) => number>): RunCurve[] {
  const maxTick = totalBudgetTicks(e);
  return runs.map(run => {
    const g = grid?.runs[run.id];
    const count = calls.get(run.id) ?? (run.model_calls === 0 ? () => 0 : undefined);
    const points: CurvePoint[] = [];
    if (g) {
      grid!.ticks.forEach((tick, i) => {
        const value = g.value[i];
        if (value == null) return;
        points.push({ tick, seconds: g.seconds[i] ?? 0, cost: g.cost[i], calls: null, value });
      });
    }
    if (points.length === 0) points.push({ tick: 0, seconds: 0, cost: 0, calls: 0, value: 0 });
    const end = Math.min(run.game_ticks ?? points[points.length - 1].tick, maxTick);
    const last = points[points.length - 1];
    if (end > last.tick) {
      points.push({
        tick: end,
        seconds: Math.max(last.seconds, run.game_seconds ?? last.seconds),
        cost: run.cost ?? last.cost,
        calls: null,
        value: run.final_value ?? last.value,
      });
    }
    if (run.success && run.target != null) {
      const target = run.target;
      // The exact finish: the scorer's tick for one attempt; with several, its tick is within its
      // attempt, so take the quest's completion when the run has one
      const finish = e.attempts <= 1 ? run.ticks : (run.metrics.quests.find(q => q.source === 'varp')?.tick ?? null);
      if (finish != null) {
        const at = Math.min(finish, end);
        const before = points.filter(p => p.tick < at);
        const prev = before[before.length - 1] ?? points[0];
        const after = points.filter(p => p.tick > at);
        points.splice(
          0,
          points.length,
          ...before,
          { tick: at, seconds: run.seconds ?? prev.seconds, cost: prev.cost, calls: null, value: target },
          ...after
        );
      }
      points[points.length - 1].value = target;
      let reached = false;
      for (const p of points) {
        reached ||= p.value >= target;
        if (reached) p.value = target;
      }
    }
    for (const p of points) p.calls = count ? count(p.tick) : null;
    return { run, variant: variantOf(run), points };
  });
}

/** A point's position on an x measure. */
export function xOf(p: CurvePoint, x: XMeasure): number | null {
  if (x === 'ticks') return p.tick;
  if (x === 'seconds') return p.seconds;
  if (x === 'cost') return p.cost;
  return p.calls;
}

/** A run's position on an x measure at a tick: the last point at or before it. */
export function xAtTick(curve: RunCurve, tick: number, x: XMeasure): number | null {
  let found = curve.points[0];
  for (const p of curve.points) {
    if (p.tick <= tick) found = p;
    else break;
  }
  return found ? xOf(found, x) : null;
}

/** A run's value at a position on an x measure: held after its end. */
export function valueAt(curve: RunCurve, x: XMeasure, at: number): number | null {
  let value: number | null = null;
  for (const p of curve.points) {
    const px = xOf(p, x);
    if (px == null) return null;
    if (px <= at) value = p.value;
    else break;
  }
  return value ?? curve.points[0]?.value ?? null;
}

/** Whether a curve can be drawn on an x measure. */
export function hasX(curve: RunCurve, x: XMeasure): boolean {
  if (x === 'cost') return curve.run.cost != null && curve.run.cost > 0;
  if (x === 'calls') return curve.run.model_calls > 0 && curve.points.every(p => p.calls != null);
  return true;
}

export interface XRange {
  min: number;
  max: number;
  log: boolean;
  /** A vertical budget line, where the measure has one */
  budget: number | null;
}

/** The x axis for a measure: ticks and seconds stop at the budget; cost is log on 1-2-5 steps. */
export function xRange(e: Eval, curves: RunCurve[], x: XMeasure): XRange {
  if (x === 'ticks') return { min: 0, max: totalBudgetTicks(e), log: false, budget: totalBudgetTicks(e) };
  if (x === 'seconds') return { min: 0, max: totalBudgetSeconds(e), log: false, budget: totalBudgetSeconds(e) };
  const values = curves
    .filter(c => hasX(c, x))
    .flatMap(c => c.points.map(p => xOf(p, x)))
    .filter(nonNull);
  if (x === 'cost') {
    const positive = values.filter(v => v > 0);
    if (positive.length === 0) return { min: 0.01, max: 1, log: true, budget: null };
    const lo = stepBelow(Math.min(...positive));
    let hi = stepAbove(Math.max(...positive));
    if (hi <= lo) hi = stepAbove(lo * 1.01);
    return { min: lo, max: hi, log: true, budget: null };
  }
  return { min: 0, max: niceMax(Math.max(1, ...values)), log: false, budget: null };
}

/** A round axis end above a value: 1, 2, 2.5 or 5 times a power of ten. */
export function niceMax(v: number): number {
  const e = 10 ** Math.floor(Math.log10(v));
  return ([1, 2, 2.5, 5, 10].map(m => m * e).find(c => c >= v) ?? 10 * e) as number;
}

/** Positions to sample an aggregate at: linear, or even on a log axis. */
export function sampleGrid(range: XRange, n = 160): number[] {
  return Array.from({ length: n + 1 }, (_, i) =>
    range.log ? range.min * (range.max / range.min) ** (i / n) : range.min + ((range.max - range.min) * i) / n
  );
}

/** The median or best value of a variant's runs along x, up to where its last run ended. */
export function aggregate(curves: RunCurve[], x: XMeasure, range: XRange, agg: 'median' | 'best'): [number, number][] {
  const drawn = curves.filter(c => hasX(c, x));
  if (drawn.length === 0) return [];
  const end = Math.min(range.max, Math.max(...drawn.map(c => xOf(c.points[c.points.length - 1], x) ?? 0)));
  const xs = [...sampleGrid(range).filter(v => v < end), end];
  return xs.map(at => {
    const values = drawn.map(c => valueAt(c, x, at)).filter(nonNull);
    return [at, agg === 'best' ? Math.max(...values) : (median(values) ?? 0)];
  });
}

// Variants, ranked

export interface RankedVariant {
  variant: Variant;
  runs: Run[];
  finished: number;
  /** Median to finish on the x measure, over finished runs */
  toFinish: number | null;
  medianResult: number | null;
  bestResult: number | null;
}

/** Where a finished run finished on an x measure: ticks and seconds within its best attempt. */
export function finishOn(run: Run, x: XMeasure): number | null {
  if (!run.success) return null;
  if (x === 'ticks') return run.ticks;
  if (x === 'seconds') return run.seconds;
  if (x === 'cost') return run.cost;
  return run.model_calls;
}

export function rankVariants(e: Eval, runs: Run[], x: XMeasure): RankedVariant[] {
  const groups = new Map<string, { variant: Variant; runs: Run[] }>();
  for (const run of runs) {
    const variant = variantOf(run);
    const group = groups.get(variant.key) ?? { variant, runs: [] };
    group.runs.push(run);
    groups.set(variant.key, group);
  }
  const ranked = [...groups.values()].map(({ variant, runs: rs }) => {
    const results = rs.map(resultValue).filter(nonNull);
    return {
      variant,
      runs: [...rs].sort((a, b) => a.epoch - b.epoch),
      finished: rs.filter(r => r.success).length,
      toFinish: median(rs.map(r => finishOn(r, x))),
      medianResult: median(results),
      bestResult: results.length ? Math.max(...results) : null,
    };
  });
  const target = e.target != null;
  return ranked.sort((a, b) =>
    target
      ? b.finished / b.runs.length - a.finished / a.runs.length ||
        (a.toFinish ?? Infinity) - (b.toFinish ?? Infinity) ||
        (b.medianResult ?? 0) - (a.medianResult ?? 0) ||
        a.variant.name.localeCompare(b.variant.name)
      : (b.medianResult ?? 0) - (a.medianResult ?? 0) ||
        (b.bestResult ?? 0) - (a.bestResult ?? 0) ||
        a.variant.name.localeCompare(b.variant.name)
  );
}

// Groups for the effort cuts

export interface Group {
  /** Its series: marks, name and colour (agents have no colour of their own) */
  spec: SeriesSpec;
  runs: Run[];
}

export function groupRuns(runs: Run[], by: GroupBy): Group[] {
  const groups = new Map<string, Group>();
  for (const run of runs) {
    const spec = by === 'variant' ? variantSeries(run) : by === 'model' ? modelSeries(run.model) : agentSeries(run.agent, run.agent_name);
    const group = groups.get(spec.id) ?? { spec, runs: [] };
    group.runs.push(run);
    groups.set(spec.id, group);
  }
  return [...groups.values()].sort((a, b) => a.spec.name.localeCompare(b.spec.name));
}
