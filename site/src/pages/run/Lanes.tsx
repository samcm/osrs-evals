/**
 * The run as one instrument: lanes on one shared x axis and one playhead. Every lane the run has
 * data for shows (progress, model calls, SDK actions, activity, spend, context, XP); the lanes menu
 * hides some (`?lanes=`). Each lane is its own card: its title, its unit as the description, its cut
 * in the card's action, the chart, and its key under it. Every lane is an XYChart of the same height
 * on the same x domain, synced, so one crosshair moves through all of them; only the lane under the
 * pointer shows its values. Hovering previews that moment everywhere on the page; clicking puts the
 * playhead there. The playhead is a line over every lane. The x measure and the lanes menu sit in a
 * toolbar above the lanes; the map is a card beside them.
 */

import { memo, useEffect, useMemo, useRef, type JSX, type ReactNode, type RefObject } from 'react';
import { ChevronDownIcon } from '@heroicons/react/20/solid';
import clsx from 'clsx';
import { ParamSegmented, Segmented } from '@/components/bits';
import {
  ChartFrame,
  KeyLegend,
  SeriesLegend,
  subscribeSync,
  XYChart,
  type AxisSpec,
  type ChartArea,
  type ChartBand,
  type ChartLine,
  type ChartRule,
  type LegendItem,
  type Plot,
  type TooltipContent,
  type TooltipRow,
} from '@/components/Charts';
import { PageSection, PageToolbar } from '@/components/page';
import { Popover, PopoverButton, PopoverPanel } from '@/components/Overlays/Popover';
import { CheckboxGroup } from '@/components/Forms/CheckboxGroup/CheckboxGroup';
import type { Price, RunDetail, RunEvent, ToolCategory, Turn } from '@/data/types';
import { skillSrc } from '@/lib/assets';
import { cssColor, modelSeries, seriesKey, tokenSeries, toolSeries, type SeriesSpec } from '@/lib/chartSeries';
import { evalArt } from '@/lib/evals';
import { formatClock, formatCost, formatInt, formatSeconds, formatTokens } from '@/lib/format';
import { useLegend } from '@/lib/legend';
import { useSearchUpdate } from '@/lib/search';
import { hashColor, type SeriesColor } from '@/lib/series';
import { SDK_OUTCOMES, TOKEN_KINDS, type TokenKind } from '@/lib/tokens';
import {
  animationName,
  formatCompact,
  niceTicks,
  setMoment,
  ticksWithin,
  turnHasError,
  turnSummary,
  type Clock,
  type XMeasure,
} from './model';
import { useCommitted, usePlayhead } from './playhead';
import { LANE_IDS, runSearch, useSettle, type LaneId, type RunSearch } from './search';

const SYNC = 'run-lanes';

/** Where each kind of token sits in the calls series and in the price list. */
const TOKEN_FIELDS: Record<
  TokenKind,
  { calls: 'input_uncached' | 'cache_write' | 'cache_read' | 'output'; price: keyof Price }
> = {
  input: { calls: 'input_uncached', price: 'input' },
  cache_write: { calls: 'cache_write', price: 'input_cache_write' },
  cache_read: { calls: 'cache_read', price: 'input_cache_read' },
  output: { calls: 'output', price: 'output' },
};

// Literal class names so Tailwind generates them: bg-data-sky border-data-sky fill-data-sky
// bg-data-blue border-data-blue fill-data-blue bg-muted border-muted fill-muted
const tokenColor = (name: string): SeriesColor => ({
  token: `--color-${name}`,
  swatchClassName: `bg-${name}`,
  borderClassName: `border-${name}`,
  fillClassName: `fill-${name}`,
});

/** A series for something keyed by name (an account, a skill, an SDK function), in its colour. */
function keySeries(id: string, label: string, color: SeriesColor, sprite?: string): SeriesSpec {
  return {
    id,
    key: seriesKey(id),
    label,
    name: label,
    color: cssColor(color),
    swatch: color,
    line: 'solid',
    symbol: 'circle',
    sprite,
  };
}

/** A call made without a tool */
const NO_TOOL = keySeries('none', 'No tool', tokenColor('muted'));

interface Lane {
  id: LaneId;
  title: string;
  /** The lane's unit or window, when the title does not say it */
  description?: string;
  control?: ReactNode;
  y: AxisSpec;
  lines?: ChartLine[];
  areas?: ChartArea[];
  bands?: ChartBand[];
  /** Marks drawn over the plot in HTML (a call's error) */
  overlay?: (plot: Plot) => ReactNode;
  /** The values at an x, for the lane under the pointer */
  tip: (x: number) => TooltipContent | null;
  /** The key under the chart; with `bound`, it toggles series (hide/focus) */
  legend?: LegendItem[];
  series?: SeriesSpec[];
  /** How `series` are keyed: a line, or a swatch for areas */
  seriesKind?: 'line' | 'swatch';
  bound?: boolean;
}

interface Ctx {
  run: RunDetail;
  clock: Clock;
  measure: XMeasure;
  maxX: number;
  visible: (id: string) => boolean;
  /** The game tick at an x on the measure */
  tickOf: (x: number) => number;
}

const formatX = (measure: XMeasure, x: number): string =>
  measure === 'ticks' ? `Tick ${formatInt(Math.round(x))}` : formatClock(x);

/** The index of the last item at or before `x` (−1 before the first); `at` ascending. */
function lastAt(at: number[], x: number): number {
  let lo = 0;
  let hi = at.length - 1;
  let found = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (at[mid] <= x) {
      found = mid;
      lo = mid + 1;
    } else hi = mid - 1;
  }
  return found;
}

/** A step series' points held to the axis' end, so its last value reaches the run's end. */
function heldToEnd<T extends [number, ...unknown[]]>(points: T[], maxX: number): T[] {
  const last = points.at(-1);
  if (!last || last[0] >= maxX) return points;
  return [...points, [maxX, ...last.slice(1)] as T];
}

type Marked = Extract<RunEvent, { kind: 'quest' | 'death' | 'level' }>;
type AttemptStart = Extract<RunEvent, { kind: 'attempt' }>;

const attempts = (run: RunDetail): AttemptStart[] => run.events.filter((e): e is AttemptStart => e.kind === 'attempt');

function eventName(e: Marked): string {
  if (e.kind === 'quest') return `${e.source === 'inferred' ? '≈ ' : ''}${e.name ?? 'A quest'}`;
  if (e.kind === 'death') return 'Died';
  return `${e.skill.charAt(0).toUpperCase()}${e.skill.slice(1)} level ${e.level}`;
}

function progressLane(ctx: Ctx): Lane {
  const { run, clock, measure } = ctx;
  // The quests show on the playback bar's track; here they are named in the tooltip
  const measureName = evalArt(run.eval).measure;
  const model = modelSeries(run.model);
  const spec: SeriesSpec = { ...model, label: measureName, name: measureName, vendor: undefined, sprite: undefined };
  const timeline = run.timeline.map(p => clock.x(p.tick, measure));
  const points = heldToEnd(
    run.timeline.map((p, i): [number, number] => [timeline[i], p.value]),
    ctx.maxX
  );
  const marked = run.events.filter((e): e is Marked => e.kind === 'quest');
  const attemptStarts = attempts(run);
  const max = Math.max(1, ...run.timeline.map(p => p.value));
  const target = run.target;
  const yTicks =
    target != null
      ? target % 2 === 0
        ? [0, target / 2, target]
        : niceTicks(target, 2, true)
            .filter(t => t <= target)
            .concat(target)
      : niceTicks(max, 2, true);
  const ticks = [...new Set(yTicks)];
  const span = ctx.maxX || 1;

  return {
    id: 'progress',
    title: measureName,
    y: { domain: [0, ticks.at(-1) ?? 1], ticks, format: formatCompact, formatValue: formatInt },
    lines: [{ series: spec, points }],
    bands: [{ series: spec, points: points.map(([x, v]): [number, number, number] => [x, 0, v]), opacity: 0.12 }],
    tip: x => {
      const tick = ctx.tickOf(x);
      const attempt = attemptStarts.filter(a => a.tick <= tick).at(-1);
      const near = marked.filter(e => Math.abs(clock.x(e.tick, measure) - x) <= span * 0.012);
      const value = run.timeline[Math.max(0, lastAt(timeline, x))]?.value ?? 0;
      const rows: TooltipRow[] = [{ series: spec, value: formatInt(value) }];
      if (run.attempts > 1 && attempt) rows.unshift({ label: 'Attempt', value: String(attempt.attempt) });
      for (const e of near) rows.push({ label: eventName(e), value: formatX(measure, clock.x(e.tick, measure)) });
      const guessed = near.some(e => e.kind === 'quest' && e.source === 'inferred');
      return {
        title: formatX(measure, x),
        rows,
        note: guessed ? '≈ guessed from the quest-points jump' : undefined,
      };
    },
  };
}

/** Each call's x on the measure: when it was sent, when the model answered. */
function callXs(ctx: Ctx): { start: number[]; end: number[] } {
  const { run, clock, measure } = ctx;
  const calls = run.series.calls;
  const at = (seconds: number, tick: number | null): number =>
    Math.min(ctx.maxX, measure === 'seconds' ? seconds : (tick ?? clock.toTick(seconds)));
  return {
    start: calls.seconds.map((s, i) => at(s, calls.tick[i])),
    end: calls.seconds.map((s, i) => at(s + calls.latency[i], null)),
  };
}

function spendLane(ctx: Ctx, price: Price | undefined, cut: RunSearch['cost']): Lane {
  const calls = ctx.run.series.calls;
  const usd = cut === 'usd' && price != null;
  const { end } = callXs(ctx);
  const specs = TOKEN_KINDS.map(k => tokenSeries(k.id));
  const kinds = TOKEN_KINDS.filter(k => ctx.visible(k.id));
  const valueOf = (kind: TokenKind, call: number): number => {
    if (call < 0) return 0;
    const tokens = calls[TOKEN_FIELDS[kind].calls][call] ?? 0;
    return usd ? (tokens * price![TOKEN_FIELDS[kind].price]) / 1e6 : tokens;
  };
  const total = kinds.reduce((sum, k) => sum + valueOf(k.id, calls.seconds.length - 1), 0);
  const yTicks = niceTicks(total || 1, 2);
  const format = (v: number): string => (usd ? formatCost(v) : formatTokens(v));
  return {
    id: 'spend',
    title: 'Spend',
    description: usd ? 'Running total in US dollars' : 'Running total in tokens',
    control: price ? (
      <ParamSegmented
        param="cost"
        value={cut}
        label="Spend in"
        options={[
          { value: 'usd', label: 'USD' },
          { value: 'tokens', label: 'Tokens' },
        ]}
      />
    ) : undefined,
    y: {
      domain: [0, yTicks.at(-1) ?? 1],
      ticks: yTicks,
      format: v => (usd ? `$${Number(v.toPrecision(3))}` : formatCompact(v)),
      formatValue: format,
    },
    // One run's running total, stacked by kind on a linear axis; every kind on the same x values so they stack
    areas: kinds.map(k => ({
      series: tokenSeries(k.id),
      stack: 'spend',
      points: heldToEnd(
        [[0, 0] as [number, number], ...end.map((x, i): [number, number] => [x, valueOf(k.id, i)])],
        ctx.maxX
      ),
    })),
    series: specs,
    seriesKind: 'swatch',
    bound: true,
    tip: x => {
      const i = lastAt(end, x);
      const rows: TooltipRow[] = [...kinds]
        .reverse()
        .map(k => ({ series: tokenSeries(k.id), value: format(valueOf(k.id, i)) }));
      if (kinds.length > 1)
        rows.push({ label: 'Total', value: format(kinds.reduce((sum, k) => sum + valueOf(k.id, i), 0)) });
      return { title: formatX(ctx.measure, x), rows };
    },
  };
}

function contextLane(ctx: Ctx): Lane {
  const calls = ctx.run.series.calls;
  const spec = { ...modelSeries(ctx.run.model), label: 'Context', name: 'Context', vendor: undefined };
  const { start } = callXs(ctx);
  const max = Math.max(1, ...calls.context.map(c => c ?? 0));
  const yTicks = niceTicks(max, 3);
  return {
    id: 'context',
    title: 'Context',
    description: 'Tokens per call',
    y: { domain: [0, yTicks.at(-1) ?? 1], ticks: yTicks, format: formatCompact },
    lines: [
      {
        series: spec,
        width: 2,
        points: heldToEnd(
          start.map((x, i): [number, number | null] => [x, calls.context[i] ?? null]),
          ctx.maxX
        ),
      },
    ],
    tip: x => {
      const i = lastAt(start, x);
      return {
        title: i >= 0 ? `Turn ${i + 1}` : formatX(ctx.measure, x),
        rows: [{ series: spec, value: i >= 0 ? `${formatTokens(calls.context[i])} tokens` : '–' }],
      };
    },
  };
}

/**
 * Each model call as a block: as wide as the time to the next call, as tall as the model took;
 * solid while the model worked, faint while its tools ran, in the call's tool category's colour.
 * Drawn as bands (a step outline per category, zero between its calls), a red mark over a call that
 * erred.
 */
function callsLane(ctx: Ctx): Lane {
  const { run } = ctx;
  const calls = run.series.calls;
  const turns: Turn[] = run.turns;
  const { start, end } = callXs(ctx);
  // A call too quick to see still gets a sliver
  const minWidth = ctx.maxX / 600;
  const answered = start.map((x, i) => Math.min(ctx.maxX, Math.max(x + minWidth, end[i])));
  const untils = start.map((_, i) => Math.max(answered[i], i + 1 < start.length ? start[i + 1] : end[i]));
  const specOf = (i: number): SeriesSpec => {
    const cat = calls.category[i];
    return cat ? toolSeries(cat) : NO_TOOL;
  };
  const present = [...new Set(calls.category.filter((c): c is ToolCategory => c != null))];
  const groups: ({ id: ToolCategory | 'none' } & { spec: SeriesSpec })[] = [
    ...present.map(c => ({ id: c, spec: toolSeries(c) })),
    ...(calls.category.some(c => c == null) ? [{ id: 'none' as const, spec: NO_TOOL }] : []),
  ];
  const outline = (id: string, from: number[], to: number[]): [number, number, number][] => {
    const points: [number, number, number][] = [[0, 0, 0]];
    let last = 0;
    start.forEach((_, i) => {
      if ((calls.category[i] ?? 'none') !== id) return;
      const x0 = Math.max(last, from[i]);
      const x1 = Math.max(x0, to[i]);
      points.push([x0, 0, calls.latency[i]], [x1, 0, 0]);
      last = x1;
    });
    return points;
  };
  const errors = turns.flatMap((t, i) => (turnHasError(t) ? [i] : []));
  const latencyTicks = niceTicks(Math.max(1, ...calls.latency), 2);
  return {
    id: 'calls',
    title: 'Model calls',
    description: 'Seconds per call, faint while its tools ran',
    y: { domain: [0, latencyTicks.at(-1) ?? 1], ticks: latencyTicks, format: v => `${formatCompact(v)} s` },
    bands: groups.flatMap(g => [
      { key: `tools-${g.id}`, series: g.spec, points: outline(g.id, answered, untils), opacity: 0.25 },
      { key: `model-${g.id}`, series: g.spec, points: outline(g.id, start, answered), opacity: 1 },
    ]),
    overlay: plot =>
      errors.map(call => {
        const left = plot.x(start[call]);
        return (
          <div
            key={call}
            aria-hidden
            className="pointer-events-none absolute h-0.5 bg-danger"
            style={{
              left,
              top: plot.y(calls.latency[call]) - 4,
              width: Math.max(3, plot.x(answered[call]) - left),
            }}
          />
        );
      }),
    legend: groups.map(g => ({ label: g.spec.label, color: g.spec.swatch })),
    tip: x => {
      const t = Math.max(0, lastAt(start, x));
      const turn = turns[t];
      const summary = turn ? turnSummary(turn) : null;
      const rows: TooltipRow[] = [{ series: specOf(t), value: '' }];
      rows.push({ label: 'Model', value: `${formatSeconds(calls.latency[t])} s` });
      rows.push({ label: 'Then', value: calls.gap[t] == null ? 'End' : `${formatSeconds(calls.gap[t])} s` });
      if (turn && turnHasError(turn)) rows.push({ label: 'Error', value: '' });
      return { title: `Turn ${t + 1}`, rows, note: summary?.text };
    },
  };
}

interface Group {
  spec: SeriesSpec;
  values: number[];
}

/** A stacked lane of per-bucket counts (per 100 ticks). */
function bucketLane(
  ctx: Ctx,
  base: Pick<Lane, 'id' | 'title' | 'description' | 'control'>,
  bucket: number,
  groups: Group[]
): Lane {
  const { clock, measure } = ctx;
  const visible = groups.filter(g => ctx.visible(g.spec.id));
  const n = groups[0]?.values.length ?? 0;
  // Every group on the same bucket starts, so the stack lines up
  const xs = Array.from({ length: n }, (_, b) => Math.min(ctx.maxX, clock.x(b * bucket, measure)));
  let max = 1;
  for (let b = 0; b < n; b++)
    max = Math.max(
      max,
      visible.reduce((sum, g) => sum + (g.values[b] ?? 0), 0)
    );
  const yTicks = niceTicks(max, 3, true);
  const end = (b: number): string =>
    measure === 'ticks' ? formatInt((b + 1) * bucket) : formatClock(clock.toSeconds((b + 1) * bucket));
  return {
    ...base,
    y: { domain: [0, yTicks.at(-1) ?? 1], ticks: yTicks, format: formatCompact },
    areas: visible.map(g => ({
      series: g.spec,
      stack: base.id,
      points: heldToEnd(
        xs.map((x, b): [number, number] => [x, g.values[b] ?? 0]),
        ctx.maxX
      ),
    })),
    series: groups.map(g => g.spec),
    seriesKind: 'swatch',
    bound: true,
    tip: x => {
      const b = Math.max(0, Math.floor(ctx.tickOf(x) / bucket));
      const rows = [...visible]
        .reverse()
        .filter(g => (g.values[b] ?? 0) > 0)
        .map(g => ({ series: g.spec, value: formatInt(g.values[b]) }));
      return {
        title: `${formatX(measure, clock.x(b * bucket, measure))} to ${end(b)}`,
        rows: rows.length ? rows : [{ label: 'None', value: '' }],
      };
    },
  };
}

function sdkLane(ctx: Ctx, cut: RunSearch['sdk']): Lane | null {
  const sdk = ctx.run.series.sdk;
  if (!sdk || sdk.bins.length === 0) return null;
  const n = Math.ceil(ctx.clock.maxTicks / sdk.bucket_ticks) + 1;
  const zeros = (): number[] => new Array<number>(n).fill(0);
  let groups: Group[];
  if (cut === 'outcome') {
    const ok = zeros();
    const failed = zeros();
    for (const [start, , good, bad] of sdk.bins) {
      const b = Math.floor(start / sdk.bucket_ticks);
      if (b >= n) continue;
      ok[b] += good;
      failed[b] += bad;
    }
    groups = [
      { spec: keySeries('ok', SDK_OUTCOMES.ok.label, SDK_OUTCOMES.ok.color), values: ok },
      { spec: keySeries('failed', SDK_OUTCOMES.failed.label, SDK_OUTCOMES.failed.color), values: failed },
    ];
  } else {
    const byFn = sdk.functions.map(zeros);
    for (const [start, fn, good, bad] of sdk.bins) {
      const b = Math.floor(start / sdk.bucket_ticks);
      if (b < n) byFn[fn][b] += good + bad;
    }
    const total = (v: number[]): number => v.reduce((s, x) => s + x, 0);
    groups = sdk.functions
      .map((name, i) => ({ spec: keySeries(name, name, hashColor(name)), values: byFn[i] }))
      .sort((a, b) => total(b.values) - total(a.values));
  }
  return bucketLane(
    ctx,
    {
      id: 'sdk',
      title: 'SDK actions',
      description: 'Per 100 ticks',
      control: (
        <ParamSegmented
          param="sdk"
          value={cut}
          label="SDK actions by"
          options={[
            { value: 'outcome', label: 'Outcome' },
            { value: 'function', label: 'Function' },
          ]}
        />
      ),
    },
    sdk.bucket_ticks,
    groups
  );
}

function activityLane(ctx: Ctx, cut: RunSearch['act']): Lane | null {
  const activity = ctx.run.series.activity;
  if (!activity || activity.rows.length === 0) return null;
  const rows = activity.rows;
  let groups: Group[];
  if (cut === 'moving') {
    groups = [
      {
        spec: keySeries('walking', 'Walking', tokenColor('data-sky')),
        values: rows.map(r => Math.max(0, r[1] - r[2])),
      },
      { spec: keySeries('running', 'Running', tokenColor('data-blue')), values: rows.map(r => r[2]) },
    ];
  } else {
    const names = new Map<string, number>();
    for (const r of rows) if (r[5] && r[3] > 0) names.set(r[5], (names.get(r[5]) ?? 0) + r[3]);
    groups = [...names.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([seq]) => ({
        spec: keySeries(seq, animationName(seq), hashColor(seq)),
        values: rows.map(r => (r[5] === seq ? r[3] : 0)),
      }));
  }
  return bucketLane(
    ctx,
    {
      id: 'activity',
      title: 'Activity',
      description: cut === 'moving' ? 'Ticks moving, per 100 ticks' : 'Animations per 100 ticks',
      control: (
        <ParamSegmented
          param="act"
          value={cut}
          label="Activity"
          options={[
            { value: 'moving', label: 'Moving' },
            { value: 'animations', label: 'Animations' },
          ]}
        />
      ),
    },
    activity.bucket_ticks,
    groups
  );
}

/** A line per key (an account's wealth, a skill's XP) over game ticks, each in its colour. */
function keyedLines(
  ctx: Ctx,
  data: Record<string, [number, number][]>,
  specs: SeriesSpec[]
): Pick<Lane, 'lines' | 'tip'> {
  const shown = specs.filter(s => ctx.visible(s.id));
  const xs = Object.fromEntries(specs.map(s => [s.id, data[s.id].map(p => ctx.clock.x(p[0], ctx.measure))]));
  return {
    lines: shown.map(s => ({
      series: s,
      width: 2,
      points: heldToEnd(
        data[s.id].map((p, i): [number, number] => [xs[s.id][i], p[1]]),
        ctx.maxX
      ),
    })),
    tip: x => ({
      title: formatX(ctx.measure, x),
      rows: shown
        .map(s => ({ series: s, n: data[s.id][lastAt(xs[s.id], x)]?.[1] ?? 0 }))
        .sort((a, b) => b.n - a.n)
        .map(r => ({ series: r.series, value: formatInt(r.n) })),
    }),
  };
}

/** Each account's wealth over time, a line per account: the team wealth eval's measure, cut by who holds it. */
function wealthLane(ctx: Ctx): Lane | null {
  const wealth = ctx.run.series.wealth;
  if (!wealth || Object.keys(wealth).length === 0) return null;
  const specs = Object.keys(wealth).map(a => keySeries(a, a, hashColor(a)));
  const max = Math.max(1, ...specs.filter(s => ctx.visible(s.id)).flatMap(s => wealth[s.id].map(p => p[1])));
  const yTicks = niceTicks(max, 3);
  return {
    id: 'wealth',
    // The progress lane is the team's wealth, so this one names its cut
    title: 'Wealth by account',
    description: 'Store value',
    y: { domain: [0, yTicks.at(-1) ?? 1], ticks: yTicks, format: formatCompact, formatValue: formatInt },
    ...keyedLines(ctx, wealth, specs),
    series: specs,
    bound: true,
  };
}

function xpLane(ctx: Ctx): Lane | null {
  const xp = ctx.run.series.xp;
  if (!xp || Object.keys(xp).length === 0) return null;
  const skills = Object.keys(xp).sort((a, b) => (xp[b].at(-1)?.[1] ?? 0) - (xp[a].at(-1)?.[1] ?? 0));
  const label = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1);
  const specs = skills.map(s => keySeries(s, label(s), hashColor(s), skillSrc(s)));
  const max = Math.max(1, ...skills.filter(s => ctx.visible(s)).map(s => xp[s].at(-1)?.[1] ?? 0));
  const yTicks = niceTicks(max, 3);
  return {
    id: 'xp',
    title: 'XP',
    y: { domain: [0, yTicks.at(-1) ?? 1], ticks: yTicks, format: formatCompact, formatValue: formatInt },
    ...keyedLines(ctx, xp, specs),
    series: specs,
    bound: true,
  };
}

/**
 * The playhead over a lane's plot, in the page's playhead colour (primary): where the game is
 * (scrubbing or playing, else `?t=`, else the start). Its own component, so a moving playhead moves
 * one line and never redraws the chart. A jump glides over the page's 150 ms; a drag or playing moves
 * it as it goes.
 */
function PlayheadLine({
  run,
  clock,
  measure,
  plot,
}: {
  run: RunDetail;
  clock: Clock;
  measure: XMeasure;
  plot: Plot;
}): JSX.Element {
  const [committed] = useCommitted(run, clock);
  const head = usePlayhead(clock, committed);
  const maxX = measure === 'ticks' ? clock.maxTicks : clock.maxSeconds;
  const at = Math.min(maxX, Math.max(0, clock.x(head.at, measure)));
  return (
    <div
      aria-hidden
      className={clsx(
        'pointer-events-none absolute w-0.5 -translate-x-1/2 bg-primary',
        !head.playing && head.scrub == null && 'transition-all'
      )}
      style={{ left: plot.x(at), top: plot.top, height: plot.height }}
    />
  );
}

/** Which lanes this run has data for, with their names in the lanes menu. */
function availableLanes(run: RunDetail): { id: LaneId; label: string }[] {
  const hasCalls = run.series.calls.seconds.length > 0;
  const has: Record<LaneId, boolean> = {
    progress: true,
    wealth: Object.keys(run.series.wealth ?? {}).length > 0,
    calls: hasCalls,
    sdk: (run.series.sdk?.bins.length ?? 0) > 0,
    activity: (run.series.activity?.rows.length ?? 0) > 0,
    spend: hasCalls,
    context: hasCalls,
    xp: Object.keys(run.series.xp ?? {}).length > 0,
  };
  const labels: Record<LaneId, string> = {
    progress: evalArt(run.eval).measure,
    wealth: 'Wealth by account',
    calls: 'Model calls',
    sdk: 'SDK actions',
    activity: 'Activity',
    spend: 'Spend',
    context: 'Context',
    xp: 'XP',
  };
  return LANE_IDS.filter(id => has[id]).map(id => ({ id, label: labels[id] }));
}

/** The lanes menu: a checklist of the lanes this run has, in a lab Popover; the last lane shown can't be hidden. */
function LanesMenu({
  available,
  shown,
}: {
  available: { id: LaneId; label: string }[];
  shown: readonly LaneId[];
}): JSX.Element {
  const update = useSearchUpdate(runSearch);
  const toggle = (id: LaneId, on: boolean): void => {
    const next = LANE_IDS.filter(l => (l === id ? on : shown.includes(l)));
    const isDefault = next.length === LANE_IDS.length;
    update({ lanes: isDefault ? [] : next });
  };
  return (
    <Popover>
      <PopoverButton variant="secondary" size="sm" trailingIcon={<ChevronDownIcon />} nowrap>
        Lanes
      </PopoverButton>
      <PopoverPanel anchor={{ to: 'bottom end', gap: 4, padding: 8 }} className="w-48 p-1.5 shadow-lg">
        <CheckboxGroup
          legend="Lanes"
          srOnlyLegend
          variant="menu"
          options={available.map(l => ({
            id: `lane-${l.id}`,
            name: 'lanes',
            label: l.label,
            checked: shown.includes(l.id),
            disabled: shown.length === 1 && shown.includes(l.id),
            onChange: on => toggle(l.id, on),
          }))}
        />
      </PopoverPanel>
    </Popover>
  );
}

export const Lanes = memo(function Lanes({
  run,
  clock,
  search,
  price,
  lead,
  aside,
}: {
  run: RunDetail;
  clock: Clock;
  search: RunSearch;
  price: Price | undefined;
  /** A card over the lanes, in their column */
  lead?: ReactNode;
  aside?: ReactNode;
}): JSX.Element {
  const update = useSearchUpdate(runSearch);
  const settle = useSettle();
  const { visible } = useLegend();
  const measure = search.x;
  const maxX = measure === 'ticks' ? clock.maxTicks : clock.maxSeconds;
  const available = useMemo(() => availableLanes(run), [run]);
  const requested: readonly LaneId[] = search.lanes.length ? (search.lanes as LaneId[]) : LANE_IDS;
  const shown = available.map(l => l.id).filter(id => requested.includes(id));

  const shownKey = shown.join(',');
  const lanes = useMemo(() => {
    const ctx: Ctx = {
      run,
      clock,
      measure,
      maxX,
      visible,
      tickOf: x => (measure === 'ticks' ? x : clock.toTick(x)),
    };
    const build: Record<LaneId, () => Lane | null> = {
      progress: () => progressLane(ctx),
      wealth: () => wealthLane(ctx),
      calls: () => callsLane(ctx),
      sdk: () => sdkLane(ctx, search.sdk),
      activity: () => activityLane(ctx, search.act),
      spend: () => spendLane(ctx, price, search.cost),
      context: () => contextLane(ctx),
      xp: () => xpLane(ctx),
    };
    return (shownKey.split(',') as LaneId[]).map(id => build[id]()).filter((l): l is Lane => l != null);
  }, [run, clock, measure, maxX, visible, search.cost, search.sdk, search.act, shownKey, price]);

  const xAxis = useMemo(
    (): AxisSpec => ({
      domain: [0, maxX],
      ticks: ticksWithin(maxX, measure),
      format: v => (measure === 'ticks' ? formatCompact(v) : formatClock(v)),
      formatValue: v => formatX(measure, v),
    }),
    [maxX, measure]
  );
  const rules = useMemo(
    () =>
      attempts(run)
        .filter(a => a.attempt > 1)
        .map(a => ({ x: clock.x(a.tick, measure), label: `Attempt ${a.attempt}` })),
    [run, clock, measure]
  );

  // The crosshair's x in any lane is the page's hover preview; a click settles the playhead there
  const pointerRef = useRef<number | null>(null);
  useEffect(
    () =>
      subscribeSync(SYNC, x => {
        pointerRef.current = x;
        setMoment({ hover: x == null ? null : Math.round(measure === 'ticks' ? x : clock.toTick(x)) });
      }),
    [clock, measure]
  );
  // Which lane the pointer is in: only that one shows its values
  const activeRef = useRef<LaneId | null>(null);

  return (
    // The toolbar over the lanes and the map on wide screens; on a phone the map comes first, by the game
    <div className="grid items-start gap-gutter xl:grid-cols-5">
      <PageToolbar label="Timeline" className="xl:col-span-5">
        <Segmented
          label="x axis"
          value={measure}
          onChange={x => update({ x })}
          options={[
            { value: 'ticks', label: 'Game ticks' },
            { value: 'seconds', label: 'Wall-clock' },
          ]}
        />
        <LanesMenu available={available} shown={shown} />
      </PageToolbar>
      <div className="flex min-w-0 flex-col gap-gutter xl:col-span-3">
        {lead}
        <div
          className="flex min-w-0 flex-col gap-gutter select-none"
          onClick={() => {
            const x = pointerRef.current;
            if (x != null) settle(measure === 'ticks' ? x : clock.toTick(x));
          }}
        >
          {lanes.map(lane => (
            <LaneChart
              key={lane.id}
              lane={lane}
              run={run}
              clock={clock}
              measure={measure}
              xAxis={xAxis}
              rules={rules}
              activeRef={activeRef}
            />
          ))}
        </div>
      </div>
      {/* Beside the lanes on wide screens, under the site header and the gutter (top-header is
          3rem, the gutter 1.5rem at xl) while the lanes scroll past */}
      {aside && <div className="order-first min-w-0 xl:sticky xl:top-18 xl:order-0 xl:col-span-2">{aside}</div>}
    </div>
  );
});

/** One lane's card: memoised, so the page's playhead moving never redraws its chart. */
const LaneChart = memo(function LaneChart({
  lane,
  run,
  clock,
  measure,
  xAxis,
  rules,
  activeRef,
}: {
  lane: Lane;
  run: RunDetail;
  clock: Clock;
  measure: XMeasure;
  xAxis: AxisSpec;
  rules: ChartRule[];
  activeRef: RefObject<LaneId | null>;
}): JSX.Element {
  const legend = useLegend();
  // The attempt rules are named in the first lane only
  const laneRules = lane.id === 'progress' ? rules : rules.map(r => ({ ...r, label: undefined }));
  const key = lane.series ? (
    <SeriesLegend series={lane.series} kind={lane.seriesKind} legend={lane.bound ? legend : undefined} />
  ) : lane.legend?.length ? (
    <KeyLegend items={lane.legend} />
  ) : undefined;
  return (
    <PageSection title={lane.title} description={lane.description} actions={lane.control} className="cursor-crosshair">
      <div
        onPointerEnter={() => {
          activeRef.current = lane.id;
        }}
        onPointerLeave={() => {
          if (activeRef.current === lane.id) activeRef.current = null;
        }}
      >
        <ChartFrame height="compact" legend={key}>
          <XYChart
            x={xAxis}
            y={lane.y}
            lines={lane.lines}
            areas={lane.areas}
            bands={lane.bands}
            rules={laneRules}
            sync={SYNC}
            axisTooltip={x => (activeRef.current === lane.id ? lane.tip(x) : null)}
            overlay={plot => (
              <>
                {lane.overlay?.(plot)}
                <PlayheadLine run={run} clock={clock} measure={measure} plot={plot} />
              </>
            )}
          />
        </ChartFrame>
      </div>
    </PageSection>
  );
});
