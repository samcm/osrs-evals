/**
 * What the model pages plot against thinking level: a measure of each run (an eval's result, its
 * ticks to finish, its cost, or a score across evals) and each harness of the runs as a series.
 */

import type { Eval, Run } from '@/data/types';
import { agentSeries, cssColor, type SeriesSpec } from '@/lib/chartSeries';
import { formatCost, formatInt } from '@/lib/format';
import { resultValue } from '@/lib/runResult';
import { modelInfo } from '@/lib/series';

/** What the chart plots of each run: its value (null when it has none), how to write it, its axis. */
export interface ThinkingMeasure {
  label: string;
  value: (run: Run) => number | null;
  format: (value: number) => string;
  /** A log axis on 1-2-5 dollar steps (cost) */
  log?: boolean;
  /** The axis' top, when the measure has one (a target, 100) */
  max?: number;
  /** Ticks rather than counts on a linear axis */
  ticks?: boolean;
  /** What is missing when no run has a value */
  empty: string;
}

export const costMeasure: ThinkingMeasure = {
  label: 'Cost',
  value: r => (r.cost != null && r.cost > 0 ? r.cost : null),
  format: formatCost,
  log: true,
  empty: 'No run here has a cost.',
};

/** One eval's measures: its result, ticks to finish, and cost per run. */
export function evalMeasure(e: Eval, y: 'result' | 'ticks' | 'cost'): ThinkingMeasure {
  if (y === 'cost') return costMeasure;
  if (y === 'ticks')
    return {
      label: 'Ticks to finish',
      value: r => (r.success ? r.ticks : null),
      format: v => `${formatInt(v)} ticks`,
      ticks: true,
      empty: 'No run here finished.',
    };
  return {
    label: e.measure,
    value: resultValue,
    format: formatInt,
    max: e.target ?? undefined,
    empty: 'No run here has a result.',
  };
}

/** Each harness of the runs as a series: its own mark, line and shape, in the model's colour. */
export function harnessSeries(runs: Run[]): SeriesSpec[] {
  const byAgent = new Map(runs.map(r => [r.agent, r]));
  return [...byAgent.values()]
    .map(r => {
      const color = modelInfo(r.model).color;
      return { ...agentSeries(r.agent, r.agent_name), color: cssColor(color), swatch: color };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}
