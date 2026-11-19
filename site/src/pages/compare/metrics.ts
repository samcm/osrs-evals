/** The measures /compare can rank runs by. Outcome measures need one eval; the rest can pool evals. */

import type { Eval, Run } from '@/data/types';
import { hasTarget } from '@/lib/evals';
import { formatCost, formatCostTick, formatDecimal, formatInt, formatPercent, formatSeconds, formatTokens } from '@/lib/format';
import { formatTick } from '@/lib/ticks';
import { resultValue } from '@/lib/runResult';

export const METRIC_IDS = [
  'value',
  'ticks',
  'first',
  'cost',
  'output',
  'calls',
  'tps',
  'latency',
  'latency_p90',
  'gap',
  'wait',
  'cache',
  'context',
  'sdk_fail',
  'tiles',
  'idle',
] as const;

export type MetricId = (typeof METRIC_IDS)[number];

export interface Metric {
  id: MetricId;
  /** For the picker; outcome metrics name the eval's measure instead where it has one */
  label: string;
  group: 'Outcome' | 'Cost and tokens' | 'Model' | 'In the game';
  /** Needs one eval */
  outcome?: boolean;
  /** For outcome metrics: the evals it applies to */
  applies?: (e: Eval) => boolean;
  get: (run: Run) => number | null;
  format: (value: number) => string;
  /** Axis labels, when shorter than `format` */
  tick?: (value: number) => string;
  /** Which way is better, for ranking; null ranks highest first without judging */
  better: 'higher' | 'lower' | null;
  /** Counts: axis ticks on whole numbers */
  whole?: boolean;
  /** The default scale, and whether log is offered (the values are positive and can span decades) */
  scale: 'log' | 'linear';
  log: boolean;
}

const share = (part: number | null | undefined, whole: number | null | undefined): number | null => (part != null && whole ? part / whole : null);

export const METRICS: Metric[] = [
  {
    id: 'value',
    whole: true,
    label: 'Result',
    group: 'Outcome',
    outcome: true,
    get: resultValue,
    format: formatInt,
    better: 'higher',
    scale: 'linear',
    log: false,
  },
  {
    id: 'ticks',
    whole: true,
    label: 'Ticks to finish',
    group: 'Outcome',
    outcome: true,
    applies: hasTarget,
    get: r => r.ticks,
    format: formatInt,
    tick: formatTick,
    better: 'lower',
    scale: 'linear',
    log: true,
  },
  {
    id: 'first',
    whole: true,
    label: 'Ticks to first progress',
    group: 'Outcome',
    outcome: true,
    get: r => r.metrics.first_progress_tick,
    format: formatInt,
    tick: formatTick,
    better: 'lower',
    scale: 'linear',
    log: true,
  },
  {
    id: 'cost',
    label: 'Cost per run',
    group: 'Cost and tokens',
    // A program calls no model: no cost to compare
    get: r => (r.model_calls ? r.cost : null),
    format: formatCost,
    tick: formatCostTick,
    better: 'lower',
    scale: 'log',
    log: true,
  },
  {
    id: 'output',
    whole: true,
    label: 'Output tokens per run',
    group: 'Cost and tokens',
    get: r => (r.model_calls ? r.output_tokens : null),
    format: formatTokens,
    tick: formatTick,
    better: null,
    scale: 'log',
    log: true,
  },
  {
    id: 'calls',
    whole: true,
    label: 'Model calls per run',
    group: 'Cost and tokens',
    get: r => (r.model_calls ? r.model_calls : null),
    format: formatInt,
    better: null,
    scale: 'log',
    log: true,
  },
  {
    id: 'cache',
    label: 'Cache hit rate',
    group: 'Cost and tokens',
    get: r => r.metrics.cache_hit_rate,
    format: formatPercent,
    better: 'higher',
    scale: 'linear',
    log: false,
  },
  {
    id: 'context',
    whole: true,
    label: 'Max context',
    group: 'Cost and tokens',
    get: r => r.metrics.max_context_tokens,
    format: formatTokens,
    tick: formatTick,
    better: null,
    scale: 'log',
    log: true,
  },
  {
    id: 'tps',
    label: 'Output tokens/s',
    group: 'Model',
    get: r => r.output_tokens_per_second,
    format: formatDecimal,
    better: 'higher',
    scale: 'linear',
    log: true,
  },
  {
    id: 'latency',
    label: 'Model latency p50',
    group: 'Model',
    get: r => r.metrics.latency_p50,
    format: v => `${formatSeconds(v)} s`,
    tick: v => `${formatTick(v)} s`,
    better: 'lower',
    scale: 'linear',
    log: true,
  },
  {
    id: 'latency_p90',
    label: 'Model latency p90',
    group: 'Model',
    get: r => r.metrics.latency_p90,
    format: v => `${formatSeconds(v)} s`,
    tick: v => `${formatTick(v)} s`,
    better: 'lower',
    scale: 'linear',
    log: true,
  },
  {
    id: 'gap',
    label: 'Time between model calls p50',
    group: 'Model',
    get: r => r.metrics.gap_p50,
    format: v => `${formatSeconds(v)} s`,
    tick: v => `${formatTick(v)} s`,
    better: 'lower',
    scale: 'linear',
    log: true,
  },
  {
    id: 'wait',
    label: 'Share of time waiting on the model',
    group: 'Model',
    get: r => r.metrics.model_share,
    format: formatPercent,
    better: null,
    scale: 'linear',
    log: false,
  },
  {
    id: 'sdk_fail',
    label: 'SDK failure rate',
    group: 'In the game',
    get: r => share(r.metrics.sdk_failed, r.metrics.sdk_actions),
    format: formatPercent,
    better: 'lower',
    scale: 'linear',
    log: false,
  },
  {
    id: 'tiles',
    whole: true,
    label: 'Tiles walked',
    group: 'In the game',
    get: r => r.metrics.tiles_walked,
    format: formatInt,
    tick: formatTick,
    better: null,
    scale: 'linear',
    log: true,
  },
  {
    id: 'idle',
    label: 'Idle share',
    group: 'In the game',
    get: r => r.metrics.idle_share,
    format: formatPercent,
    better: 'lower',
    scale: 'linear',
    log: false,
  },
];

export const metricById = (id: MetricId): Metric => METRICS.find(m => m.id === id)!;

/** The metric's name, with an eval's measure for its result. */
export const metricLabel = (m: Metric, e: Eval | undefined): string => (m.id === 'value' && e ? e.measure : m.label);
