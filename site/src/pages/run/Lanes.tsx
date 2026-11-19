/**
 * The run as lanes on one shared x axis: progress with its events, spend, context, model calls,
 * SDK actions, activity and XP. Every lane is a shadcn chart sampled on the same grid of x values,
 * so Recharts' `syncId` moves one crosshair through all of them; clicking any lane selects the
 * model call running then and puts the map at that moment.
 */

import { useMemo, useRef, type ReactNode, type RefObject } from 'react';
import { Area, CartesianGrid, ComposedChart, Line, ReferenceLine, XAxis, YAxis, usePlotArea, useXAxisScale, useYAxisScale, type MouseHandlerDataParam, type TooltipContentProps } from 'recharts';
import type { NameType, ValueType } from 'recharts/types/component/DefaultTooltipContent';
import { ParamSegmented, Segmented } from '@/components/bits';
import { crosshairCursor, gridProps, KeyLegend, SpriteMarkers, syncProps, type LegendItem, type SpriteMarker } from '@/components/charts';
import { Sprite } from '@/components/marks';
import { Card, CardAction, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from '@/components/ui/chart';
import type { Price, RunDetail, RunEvent, ToolCategory, Turn } from '@/data/types';
import { questSrc, skillSrc, uiSrc } from '@/lib/assets';
import { cssColor, modelSeries, seriesKey } from '@/lib/chartSeries';
import { evalArt } from '@/lib/evals';
import { formatClock, formatCost, formatInt, formatSeconds, formatTokens } from '@/lib/format';
import { useLegend, type LegendState } from '@/lib/legend';
import { useSearchUpdate } from '@/lib/search';
import { hashColor } from '@/lib/series';
import { SDK_OUTCOMES, TOKEN_KINDS, type TokenKind } from '@/lib/tokens';
import { TOOL_CATEGORY } from '@/lib/tools';
import { cn } from '@/lib/utils';
import {
  animationName,
  formatCompact,
  niceTicks,
  RUNNING,
  setMoment,
  ticksWithin,
  turnAt,
  turnHasError,
  turnSummary,
  turnTick,
  WALKING,
  type Clock,
  type XMeasure,
} from './model';
import { runSearch, type RunSearch } from './search';

const SYNC = 'run-lanes';
/** Points on the shared x grid: every lane is sampled here, so the crosshair matches by value */
const GRID_POINTS = 720;
/** The y axis takes the same width in every lane, so the plots line up */
const Y_WIDTH = 52;

/** Where each kind of token sits in the calls series and in the price list. */
const TOKEN_FIELDS: Record<TokenKind, { calls: 'input_uncached' | 'cache_write' | 'cache_read' | 'output'; price: keyof Price }> = {
  input: { calls: 'input_uncached', price: 'input' },
  cache_write: { calls: 'cache_write', price: 'input_cache_write' },
  cache_read: { calls: 'cache_read', price: 'input_cache_read' },
  output: { calls: 'output', price: 'output' },
};

type Row = Record<string, number | undefined>;

/** A tooltip row for ChartTooltipContent: a name, a value already formatted, a colour. */
interface TipItem {
  name: string;
  value: string;
  color?: string;
}

interface Lane {
  id: string;
  title: ReactNode;
  control?: ReactNode;
  config: ChartConfig;
  rows: Row[];
  yTicks: number[];
  yFormat: (value: number) => string;
  /** The lane's Recharts series and marks */
  body: ReactNode;
  tip: (i: number) => { title: ReactNode; items: TipItem[] };
  legend?: LegendItem[];
  /** The legend toggles series (hide/focus) */
  bound?: boolean;
}

interface Ctx {
  run: RunDetail;
  clock: Clock;
  measure: XMeasure;
  maxX: number;
  /** The grid on the x measure, and the game tick at each point */
  xs: number[];
  ticks: number[];
  visible: (id: string) => boolean;
  tools: ToolCategory[];
  errorsOnly: boolean;
  selTurn: number | null;
}

const formatX = (measure: XMeasure, x: number): string => (measure === 'ticks' ? `Tick ${formatInt(Math.round(x))}` : formatClock(x));

/** For each grid point, the index of the last item at or before it (−1 before the first); `at` ascending. */
function lastAtOrBefore(at: number[], grid: number[]): number[] {
  const out: number[] = [];
  let j = -1;
  for (const g of grid) {
    while (j + 1 < at.length && at[j + 1] <= g) j++;
    out.push(j);
  }
  return out;
}

const area = (key: string, stack?: string, opacity = 0.4) => (
  <Area
    key={key}
    dataKey={key}
    type="stepAfter"
    stackId={stack}
    stroke={`var(--color-${key})`}
    fill={`var(--color-${key})`}
    fillOpacity={opacity}
    strokeWidth={1.5}
    dot={false}
    activeDot={false}
    isAnimationActive={false}
  />
);

type Marked = Extract<RunEvent, { kind: 'quest' | 'death' | 'level' }>;

function eventSprite(e: Marked): string {
  if (e.kind === 'quest') return e.quest ? questSrc(e.quest) : uiSrc('quests');
  if (e.kind === 'death') return skillSrc('hitpoints');
  return skillSrc(e.skill);
}

function eventName(e: Marked): string {
  if (e.kind === 'quest') return `${e.source === 'inferred' ? '≈ ' : ''}${e.name ?? 'A quest'}`;
  if (e.kind === 'death') return 'Died';
  return `${e.skill.charAt(0).toUpperCase()}${e.skill.slice(1)} level ${e.level}`;
}

function progressLane(ctx: Ctx): Lane {
  const { run, clock, measure, xs, ticks } = ctx;
  const measureName = evalArt(run.eval).measure;
  const spec = modelSeries(run.model);
  const at = lastAtOrBefore(
    run.timeline.map(p => p.tick),
    ticks
  );
  const rows = xs.map((x, i) => ({ x, v: run.timeline[Math.max(0, at[i])]?.value ?? 0 }));
  const valueAt = (tick: number): number => run.timeline.filter(p => p.tick <= tick).at(-1)?.value ?? 0;
  const marked = run.events.filter((e): e is Marked => e.kind === 'quest' || e.kind === 'death' || e.kind === 'level');
  const attemptStarts = run.events.filter((e): e is Extract<RunEvent, { kind: 'attempt' }> => e.kind === 'attempt');
  const max = Math.max(1, ...run.timeline.map(p => p.value));
  const target = run.target;
  const yTicks = target != null ? (target % 2 === 0 ? [0, target / 2, target] : niceTicks(target, 2, true).filter(t => t <= target).concat(target)) : niceTicks(max, 2, true);
  const markers: SpriteMarker[] = marked.map(e => ({
    id: `${e.kind}-${e.tick}`,
    x: clock.x(e.tick, measure),
    y: valueAt(e.tick),
    src: eventSprite(e),
    title: e.kind === 'quest' && e.source === 'inferred' ? `≈ ${e.name ?? 'A quest'}: guessed from the quest-points jump` : eventName(e),
    inferred: e.kind === 'quest' && e.source === 'inferred',
  }));
  const span = ctx.maxX || 1;

  return {
    id: 'progress',
    title: measureName,
    config: { v: { label: measureName, color: spec.color } },
    rows,
    yTicks: [...new Set(yTicks)],
    yFormat: formatCompact,
    body: (
      <>
        {area('v', undefined, 0.12)}
        {attemptStarts
          .filter(a => a.attempt > 1)
          .map(a => (
            <ReferenceLine
              key={a.attempt}
              x={clock.x(a.tick, measure)}
              stroke="var(--muted-foreground)"
              strokeDasharray="3 3"
              label={{ value: `Attempt ${a.attempt}`, position: 'insideTopLeft', fontSize: 12, className: 'fill-muted-foreground' }}
            />
          ))}
        <SpriteMarkers markers={markers} size={24} />
      </>
    ),
    tip: i => {
      const tick = ticks[i];
      const attempt = attemptStarts.filter(a => a.tick <= tick).at(-1);
      const near = marked.filter(e => Math.abs(clock.x(e.tick, measure) - xs[i]) <= span * 0.012);
      const items: TipItem[] = [{ name: measureName, value: formatInt(rows[i].v), color: spec.color }];
      if (run.attempts > 1 && attempt) items.unshift({ name: 'Attempt', value: String(attempt.attempt) });
      for (const e of near) items.push({ name: eventName(e), value: formatX(measure, clock.x(e.tick, measure)) });
      if (near.some(e => e.kind === 'quest' && e.source === 'inferred')) items.push({ name: '≈ guessed from the quest-points jump', value: '' });
      return { title: formatX(measure, xs[i]), items };
    },
  };
}

/** Each call's x on the measure: when it was sent, when the model answered. */
function callXs(ctx: Ctx) {
  const { run, clock, measure } = ctx;
  const calls = run.series.calls;
  const at = (seconds: number, tick: number | null): number => Math.min(ctx.maxX, measure === 'seconds' ? seconds : (tick ?? clock.toTick(seconds)));
  return {
    start: calls.seconds.map((s, i) => at(s, calls.tick[i])),
    end: calls.seconds.map((s, i) => at(s + calls.latency[i], null)),
  };
}

function spendLane(ctx: Ctx, price: Price | undefined, cut: RunSearch['cost']): Lane {
  const calls = ctx.run.series.calls;
  const usd = cut === 'usd' && price != null;
  const { end } = callXs(ctx);
  const at = lastAtOrBefore(end, ctx.xs);
  const kinds = TOKEN_KINDS.filter(k => ctx.visible(k.id));
  const valueOf = (kind: TokenKind, call: number): number => {
    if (call < 0) return 0;
    const tokens = calls[TOKEN_FIELDS[kind].calls][call] ?? 0;
    return usd ? (tokens * price![TOKEN_FIELDS[kind].price]) / 1e6 : tokens;
  };
  const rows = ctx.xs.map((x, i) => Object.fromEntries([['x', x], ...TOKEN_KINDS.map(k => [seriesKey(k.id), valueOf(k.id, at[i])])]) as Row);
  const total = kinds.reduce((sum, k) => sum + valueOf(k.id, calls.seconds.length - 1), 0);
  const format = (v: number): string => (usd ? formatCost(v) : formatTokens(v));
  return {
    id: 'spend',
    title: 'Spend',
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
    config: Object.fromEntries(TOKEN_KINDS.map(k => [seriesKey(k.id), { label: k.label, color: cssColor(k.color) }])),
    rows,
    yTicks: niceTicks(total || 1, 2),
    yFormat: v => (usd ? `$${Number(v.toPrecision(3))}` : formatCompact(v)),
    body: <>{kinds.map(k => area(seriesKey(k.id), 'spend'))}</>,
    bound: true,
    legend: TOKEN_KINDS.map(k => ({ id: k.id, label: k.label, swatchClassName: k.color.swatchClassName })),
    tip: i => {
      const items: TipItem[] = [...kinds].reverse().map(k => ({ name: k.label, value: format(valueOf(k.id, at[i])), color: cssColor(k.color) }));
      if (kinds.length > 1) items.push({ name: 'Total', value: format(kinds.reduce((sum, k) => sum + valueOf(k.id, at[i]), 0)) });
      return { title: formatX(ctx.measure, ctx.xs[i]), items };
    },
  };
}

function contextLane(ctx: Ctx): Lane {
  const calls = ctx.run.series.calls;
  const spec = modelSeries(ctx.run.model);
  const { start } = callXs(ctx);
  const at = lastAtOrBefore(start, ctx.xs);
  const rows = ctx.xs.map((x, i) => (at[i] >= 0 && calls.context[at[i]] != null ? { x, c: calls.context[at[i]]! } : { x }));
  const max = Math.max(1, ...calls.context.map(c => c ?? 0));
  return {
    id: 'context',
    title: 'Context',
    config: { c: { label: 'Context', color: spec.color } },
    rows,
    yTicks: niceTicks(max, 3),
    yFormat: formatCompact,
    body: <Line dataKey="c" type="stepAfter" stroke="var(--color-c)" strokeWidth={2} dot={false} activeDot={false} connectNulls={false} isAnimationActive={false} />,
    tip: i => ({
      title: at[i] >= 0 ? `Turn ${at[i] + 1}` : formatX(ctx.measure, ctx.xs[i]),
      items: [{ name: 'Context', value: at[i] >= 0 ? `${formatTokens(calls.context[at[i]])} tokens` : '–', color: spec.color }],
    }),
  };
}

/**
 * Each model call as a block: as wide as the time to the next call, as tall as the model took;
 * solid while the model worked, faint while its tools ran. Coloured by the call's tool category.
 */
function CallBlocks({ starts, ends, untils, latency, colors, shown, errors, selected }: {
  starts: number[];
  ends: number[];
  untils: number[];
  latency: number[];
  colors: string[];
  shown: boolean[];
  errors: boolean[];
  selected: number | null;
}) {
  const plot = usePlotArea();
  const x = useXAxisScale();
  const y = useYAxisScale();
  if (!plot || !x || !y) return null;
  const bottom = plot.y + plot.height;
  return (
    <g className="recharts-call-blocks">
      {starts.map((s, i) => {
        const x0 = Number(x(s));
        const x1 = Math.max(x0 + 1.5, Number(x(ends[i])));
        const x2 = Math.max(x1, Number(x(untils[i])));
        const top = Math.min(bottom - 2, Number(y(latency[i])));
        const opacity = shown[i] ? 1 : 0.2;
        return (
          <g key={i} opacity={opacity}>
            <rect x={x1} y={top} width={x2 - x1} height={bottom - top} fill={colors[i]} fillOpacity={0.25} />
            <rect x={x0} y={top} width={x1 - x0} height={bottom - top} fill={colors[i]} />
            {errors[i] && <rect x={x0} y={top - 4} width={Math.max(3, x1 - x0)} height={2} fill="var(--destructive)" />}
            {selected === i && (
              <rect x={x0 - 1.5} y={top - 1.5} width={Math.max(4.5, x2 - x0 + 3)} height={bottom - top + 1.5} fill="none" stroke="var(--foreground)" strokeWidth={1.5} />
            )}
          </g>
        );
      })}
    </g>
  );
}

function callsLane(ctx: Ctx): Lane {
  const { run } = ctx;
  const calls = run.series.calls;
  const turns: Turn[] = run.turns;
  const { start, end } = callXs(ctx);
  const untils = start.map((_, i) => (i + 1 < start.length ? start[i + 1] : end[i]));
  const colors = calls.category.map(cat => (cat ? cssColor(TOOL_CATEGORY[cat].color) : 'var(--muted-foreground)'));
  const shown = turns.map(
    t => (ctx.tools.length === 0 || t.actions.some(a => ctx.tools.includes(a.category))) && (!ctx.errorsOnly || turnHasError(t))
  );
  const errors = turns.map(turnHasError);
  const present = [...new Set(calls.category.filter((c): c is ToolCategory => c != null))];
  const at = lastAtOrBefore(start, ctx.xs);
  const latencyTicks = niceTicks(Math.max(1, ...calls.latency), 2);
  return {
    id: 'calls',
    title: 'Model calls',
    config: { zero: { label: 'Model calls' } },
    rows: ctx.xs.map(x => ({ x, zero: 0 })),
    yTicks: latencyTicks,
    yFormat: v => `${formatCompact(v)} s`,
    legend: present.map(cat => ({ label: TOOL_CATEGORY[cat].label, swatchClassName: TOOL_CATEGORY[cat].color.swatchClassName })),
    body: (
      <>
        <Line dataKey="zero" stroke="none" dot={false} activeDot={false} isAnimationActive={false} />
        <CallBlocks starts={start} ends={end} untils={untils} latency={calls.latency} colors={colors} shown={shown} errors={errors} selected={ctx.selTurn} />
      </>
    ),
    tip: i => {
      const t = Math.max(0, at[i]);
      const turn = turns[t];
      const cat = calls.category[t];
      const summary = turn ? turnSummary(turn) : null;
      const items: TipItem[] = [];
      if (cat) items.push({ name: TOOL_CATEGORY[cat].label, value: '', color: colors[t] });
      items.push({ name: 'Model', value: `${formatSeconds(calls.latency[t])} s` });
      items.push({ name: 'Then', value: calls.gap[t] == null ? 'End' : `${formatSeconds(calls.gap[t])} s` });
      if (errors[t]) items.push({ name: 'Error', value: '', color: 'var(--destructive)' });
      return {
        title: (
          <span className="flex max-w-64 flex-col gap-0.5">
            <span>Turn {t + 1}</span>
            {summary && <span className="truncate font-normal text-muted-foreground">{summary.text}</span>}
          </span>
        ),
        items,
      };
    },
  };
}

interface Group {
  id: string;
  label: string;
  color: string;
  swatch: string;
  values: number[];
}

/** A stacked lane of per-bucket counts (per 100 ticks), sampled on the grid. */
function bucketLane(ctx: Ctx, base: Omit<Lane, 'config' | 'rows' | 'yTicks' | 'yFormat' | 'body' | 'tip' | 'legend' | 'bound'>, bucket: number, groups: Group[]): Lane {
  const { clock, measure, xs, ticks } = ctx;
  const visible = groups.filter(g => ctx.visible(g.id));
  const index = ticks.map(t => Math.max(0, Math.floor(t / bucket)));
  const rows = xs.map((x, i) => Object.fromEntries([['x', x], ...visible.map(g => [seriesKey(g.id), g.values[index[i]] ?? 0])]) as Row);
  let max = 1;
  for (let b = 0; b < (groups[0]?.values.length ?? 0); b++) max = Math.max(max, visible.reduce((sum, g) => sum + (g.values[b] ?? 0), 0));
  const end = (b: number): string => (measure === 'ticks' ? formatInt((b + 1) * bucket) : formatClock(clock.toSeconds((b + 1) * bucket)));
  return {
    ...base,
    config: Object.fromEntries(groups.map(g => [seriesKey(g.id), { label: g.label, color: g.color }])),
    rows,
    yTicks: niceTicks(max, 3, true),
    yFormat: formatCompact,
    body: <>{visible.map(g => area(seriesKey(g.id), base.id, 0.5))}</>,
    bound: true,
    legend: groups.map(g => ({ id: g.id, label: g.label, swatchClassName: g.swatch })),
    tip: i => {
      const b = index[i];
      const items = [...visible]
        .reverse()
        .filter(g => (g.values[b] ?? 0) > 0)
        .map(g => ({ name: g.label, value: formatInt(g.values[b]), color: g.color }));
      return { title: `${formatX(measure, clock.x(b * bucket, measure))} to ${end(b)}`, items: items.length ? items : [{ name: 'None', value: '' }] };
    },
  };
}

function sdkLane(ctx: Ctx, cut: RunSearch['sdk']): Lane | null {
  const sdk = ctx.run.series.sdk;
  if (!sdk || sdk.bins.length === 0) return null;
  const n = Math.ceil(ctx.clock.maxTicks / sdk.bucket_ticks) + 1;
  const zeros = (): number[] => new Array(n).fill(0);
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
      { id: 'ok', label: SDK_OUTCOMES.ok.label, color: cssColor(SDK_OUTCOMES.ok.color), swatch: SDK_OUTCOMES.ok.color.swatchClassName, values: ok },
      { id: 'failed', label: SDK_OUTCOMES.failed.label, color: cssColor(SDK_OUTCOMES.failed.color), swatch: SDK_OUTCOMES.failed.color.swatchClassName, values: failed },
    ];
  } else {
    const byFn = sdk.functions.map(zeros);
    for (const [start, fn, good, bad] of sdk.bins) {
      const b = Math.floor(start / sdk.bucket_ticks);
      if (b < n) byFn[fn][b] += good + bad;
    }
    const total = (v: number[]): number => v.reduce((s, x) => s + x, 0);
    groups = sdk.functions
      .map((name, i) => ({ id: name, label: name, color: cssColor(hashColor(name)), swatch: hashColor(name).swatchClassName, values: byFn[i] }))
      .sort((a, b) => total(b.values) - total(a.values));
  }
  return bucketLane(
    ctx,
    {
      id: 'sdk',
      title: 'SDK actions per 100 ticks',
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
      { id: 'walking', label: 'Walking', color: WALKING, swatch: 'bg-data-sky', values: rows.map(r => Math.max(0, r[1] - r[2])) },
      { id: 'running', label: 'Running', color: RUNNING, swatch: 'bg-data-blue', values: rows.map(r => r[2]) },
    ];
  } else {
    const names = new Map<string, number>();
    for (const r of rows) if (r[5] && r[3] > 0) names.set(r[5], (names.get(r[5]) ?? 0) + r[3]);
    groups = [...names.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([seq]) => ({
        id: seq,
        label: animationName(seq),
        color: cssColor(hashColor(seq)),
        swatch: hashColor(seq).swatchClassName,
        values: rows.map(r => (r[5] === seq ? r[3] : 0)),
      }));
  }
  return bucketLane(
    ctx,
    {
      id: 'activity',
      title: cut === 'moving' ? 'Ticks moving per 100' : 'Animations per 100 ticks',
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

function xpLane(ctx: Ctx): Lane | null {
  const xp = ctx.run.series.xp;
  if (!xp || Object.keys(xp).length === 0) return null;
  const skills = Object.keys(xp).sort((a, b) => (xp[b].at(-1)?.[1] ?? 0) - (xp[a].at(-1)?.[1] ?? 0));
  const visible = skills.filter(s => ctx.visible(s));
  const label = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1);
  const idx = Object.fromEntries(
    skills.map(s => [
      s,
      lastAtOrBefore(
        xp[s].map(p => p[0]),
        ctx.ticks
      ),
    ])
  );
  const rows = ctx.xs.map((x, i) => Object.fromEntries([['x', x], ...skills.map(s => [seriesKey(s), xp[s][idx[s][i]]?.[1] ?? 0])]) as Row);
  const max = Math.max(1, ...visible.map(s => xp[s].at(-1)?.[1] ?? 0));
  return {
    id: 'xp',
    title: 'XP',
    config: Object.fromEntries(skills.map(s => [seriesKey(s), { label: label(s), color: cssColor(hashColor(s)) }])),
    rows,
    yTicks: niceTicks(max, 3),
    yFormat: formatCompact,
    bound: true,
    legend: skills.map(s => ({ id: s, label: label(s), color: hashColor(s), line: 'solid' as const, mark: <Sprite src={skillSrc(s)} size={14} alt="" /> })),
    body: (
      <>
        {visible.map(s => (
          <Line key={s} dataKey={seriesKey(s)} type="stepAfter" stroke={`var(--color-${seriesKey(s)})`} strokeWidth={2} dot={false} activeDot={false} isAnimationActive={false} />
        ))}
      </>
    ),
    tip: i => ({
      title: formatX(ctx.measure, ctx.xs[i]),
      items: visible.map(s => ({ name: label(s), value: formatInt(xp[s][idx[s][i]]?.[1] ?? 0), color: cssColor(hashColor(s)) })),
    }),
  };
}

export function Lanes({ run, clock, search, price }: { run: RunDetail; clock: Clock; search: RunSearch; price: Price | undefined }) {
  const update = useSearchUpdate(runSearch);
  const legend = useLegend();
  const hovered = useRef<string | null>(null);
  const measure = search.x;
  const maxX = measure === 'ticks' ? clock.maxTicks : clock.maxSeconds;
  const turns = run.turns;
  const selTurn = search.turn != null && search.turn <= turns.length ? search.turn - 1 : null;
  const selTick = search.t ?? (selTurn != null ? turnTick(turns[selTurn], clock) : null);
  const selX = selTick == null ? null : Math.min(maxX, clock.x(selTick, measure));
  const hasCalls = run.series.calls.seconds.length > 0;
  const { visible } = legend;

  const xControl = (
    <Segmented
      label="x axis"
      value={measure}
      onChange={x => update({ x })}
      options={[
        { value: 'ticks', label: 'Game ticks' },
        { value: 'seconds', label: 'Wall-clock' },
      ]}
    />
  );

  const { lanes, xs, ticks } = useMemo(() => {
    const xs = Array.from({ length: GRID_POINTS + 1 }, (_, i) => (i / GRID_POINTS) * maxX);
    const ticks = xs.map(x => (measure === 'ticks' ? x : clock.toTick(x)));
    const ctx: Ctx = { run, clock, measure, maxX, xs, ticks, visible, tools: search.tools as ToolCategory[], errorsOnly: search.errors === '1', selTurn };
    const lanes = [
      progressLane(ctx),
      ...(hasCalls ? [spendLane(ctx, price, search.cost), contextLane(ctx), callsLane(ctx)] : []),
      sdkLane(ctx, search.sdk),
      activityLane(ctx, search.act),
      xpLane(ctx),
    ].filter((l): l is Lane => l != null);
    return { lanes, xs, ticks };
  }, [run, clock, measure, maxX, visible, search.tools, search.errors, search.cost, search.sdk, search.act, selTurn, hasCalls, price]);

  const xTicks = useMemo(() => ticksWithin(maxX, measure), [maxX, measure]);

  /** Select the call running at a grid point and put the map there. */
  const select = (i: number): void => {
    const tick = Math.max(0, Math.round(ticks[i]));
    update({ t: tick, turn: turns.length ? turnAt(turns, clock, tick) + 1 : undefined });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Timeline</CardTitle>
        <CardAction>{xControl}</CardAction>
      </CardHeader>
      <CardContent
        className="flex cursor-crosshair flex-col gap-6 select-none"
        onMouseLeave={() => {
          hovered.current = null;
          setMoment({ hover: null });
        }}
      >
        {lanes.map((lane, n) => (
          <LaneChart
            key={lane.id}
            lane={lane}
            last={n === lanes.length - 1}
            measure={measure}
            maxX={maxX}
            xTicks={xTicks}
            selX={selX}
            legend={legend}
            hovered={hovered}
            onHover={i => setMoment({ hover: Math.round(ticks[i]) })}
            onSelect={select}
            gridSize={xs.length}
          />
        ))}
      </CardContent>
    </Card>
  );
}

function LaneChart({
  lane,
  last,
  measure,
  maxX,
  xTicks,
  selX,
  legend,
  hovered,
  onHover,
  onSelect,
  gridSize,
}: {
  lane: Lane;
  last: boolean;
  measure: XMeasure;
  maxX: number;
  xTicks: number[];
  selX: number | null;
  legend: LegendState;
  hovered: RefObject<string | null>;
  onHover: (i: number) => void;
  onSelect: (i: number) => void;
  gridSize: number;
}) {
  const index = (state: MouseHandlerDataParam): number | null => {
    const i = Number(state.activeIndex);
    return Number.isInteger(i) && i >= 0 && i < gridSize ? i : null;
  };
  const yTop = lane.yTicks[lane.yTicks.length - 1] ?? 1;
  return (
    <section aria-label={typeof lane.title === 'string' ? lane.title : lane.id} className="flex flex-col gap-2">
      <div className="flex min-h-7 flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-medium">{lane.title}</h3>
        {lane.control}
      </div>
      <ChartContainer config={lane.config} className={cn('aspect-auto w-full', last ? 'h-40' : 'h-32')}>
        <ComposedChart
          data={lane.rows}
          {...syncProps(SYNC)}
          // Room for the 0 label under the plot when the x axis is hidden
          margin={{ top: 8, right: 20, bottom: last ? 0 : 8, left: 0 }}
          onMouseMove={state => {
            hovered.current = lane.id;
            const i = index(state);
            if (i != null) onHover(i);
          }}
          onClick={state => {
            const i = index(state);
            if (i != null) onSelect(i);
          }}
        >
          <CartesianGrid {...gridProps} />
          <XAxis
            dataKey="x"
            type="number"
            domain={[0, maxX]}
            ticks={xTicks}
            tickFormatter={(v: number) => (measure === 'ticks' ? formatCompact(v) : formatClock(v))}
            tickLine={false}
            axisLine={false}
            tickMargin={8}
            interval={0}
            allowDataOverflow
            hide={!last}
          />
          <YAxis width={Y_WIDTH} domain={[0, yTop]} ticks={lane.yTicks} tickFormatter={lane.yFormat} tickLine={false} axisLine={false} tickMargin={8} interval={0} allowDataOverflow />
          <ChartTooltip
            cursor={crosshairCursor}
            isAnimationActive={false}
            content={(props: TooltipContentProps<ValueType, NameType>) => {
              // Every lane follows the crosshair; only the lane under the pointer shows its values
              if (hovered.current !== lane.id || !props.active) return null;
              const i = Number(props.activeIndex ?? -1);
              if (!Number.isInteger(i) || i < 0 || i >= gridSize) return null;
              const tip = lane.tip(i);
              return (
                <ChartTooltipContent
                  className="min-w-44"
                  active
                  label={tip.title as never}
                  labelFormatter={() => tip.title}
                  payload={tip.items.map(item => ({ name: item.name, dataKey: item.name, value: item.value, color: item.color ?? 'transparent', payload: {} })) as never}
                />
              );
            }}
          />
          {lane.body}
          {selX != null && <ReferenceLine x={selX} stroke="var(--primary)" strokeWidth={1.5} />}
        </ComposedChart>
      </ChartContainer>
      {lane.legend && lane.legend.length > 0 && <KeyLegend items={lane.legend} legend={lane.bound ? legend : undefined} />}
    </section>
  );
}
