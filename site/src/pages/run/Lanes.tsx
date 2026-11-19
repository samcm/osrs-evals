/**
 * The run as lanes on one shared x axis: progress with its events, spend, context, model calls,
 * SDK actions, activity and XP. A synced crosshair runs through every lane; clicking any lane
 * selects the model call running then and puts the map at that moment.
 */

import { useMemo, useRef, type ReactNode, type RefObject } from 'react';
import type { CustomSeriesRenderItemAPI, CustomSeriesRenderItemParams, EChartsOption } from 'echarts';
import { Card } from '@/components/Card';
import { Chart } from '@/components/Chart';
import { ChartLegend, type LegendItem } from '@/components/ChartLegend';
import { ParamSegmented, Segmented } from '@/components/bits';
import { Sprite } from '@/components/marks';
import type { Price, RunDetail, RunEvent, ToolCategory } from '@/data/types';
import { questSrc, skillSrc, uiSrc } from '@/lib/assets';
import { crosshairTooltip, escapeHtml, formatAxisNumber, tooltipRow, tooltipTitle, valueAxis, categoryAxis } from '@/lib/chartChrome';
import { evalArt } from '@/lib/evals';
import { formatClock, formatCost, formatInt, formatSeconds, formatTokens } from '@/lib/format';
import { useLegend, type LegendState } from '@/lib/legend';
import { useSearchUpdate } from '@/lib/search';
import { hashColor, modelInfo } from '@/lib/series';
import { useThemeColors, withAlpha, type ThemeColors } from '@/lib/theme';
import {
  animationName,
  CATEGORIES,
  RUNNING,
  SDK_FAILED,
  SDK_OK,
  setMoment,
  TOKEN_KINDS,
  turnAt,
  turnHasError,
  turnSummary,
  turnTick,
  WALKING,
  type Clock,
  type XMeasure,
} from './model';
import { runSearch, type RunSearch } from './search';
import { useSpriteImages, type SpriteImage } from './spriteImages';

const GROUP = 'run-lanes';
const GRID = { left: 52, right: 16 };

interface Ctx {
  run: RunDetail;
  clock: Clock;
  measure: XMeasure;
  c: ThemeColors;
  maxX: number;
  /** The selected moment on the x measure, and the selected call's index */
  selX: number | null;
  selTurn: number | null;
  tools: ToolCategory[];
  errorsOnly: boolean;
  visible: (id: string) => boolean;
  hovered: RefObject<string | null>;
  lastX: RefObject<number | null>;
}

interface Lane {
  id: string;
  title: ReactNode;
  height: number;
  option: EChartsOption;
  legend?: LegendItem[];
  /** The legend toggles series (hide/focus) */
  bound?: boolean;
  control?: ReactNode;
}

/** An x value as text: a tick count or a clock. */
const formatX = (measure: XMeasure, x: number): string => (measure === 'ticks' ? `Tick ${formatInt(Math.round(x))}` : formatClock(x));

/** Seconds-axis label steps that give five to ten labels. */
function clockInterval(max: number): number | undefined {
  return [30, 60, 120, 300, 600, 900, 1800, 3600].find(step => max / step <= 10);
}

/** The chrome every lane shares: same grid edges and x range (for the synced crosshair), x labels on the last lane only. */
function frame(ctx: Ctx, id: string, { last, top = 6 }: { last: boolean; top?: number }, tooltip: (x: number) => string): EChartsOption {
  const { c, measure } = ctx;
  return {
    animation: false,
    grid: { ...GRID, top, bottom: last ? 24 : 4 },
    tooltip: {
      ...crosshairTooltip(c),
      // Every lane follows the crosshair; only the lane under the pointer shows its values
      formatter: (params: unknown) => {
        if (ctx.hovered.current !== id) return '';
        const x = (params as { axisValue?: number }[])[0]?.axisValue ?? ctx.lastX.current;
        return x == null ? '' : tooltip(x);
      },
    },
    xAxis: {
      type: 'value',
      min: 0,
      max: ctx.maxX,
      ...categoryAxis(c),
      interval: measure === 'seconds' ? clockInterval(ctx.maxX) : undefined,
      axisPointer: { snap: false },
      axisLabel: {
        ...categoryAxis(c).axisLabel,
        show: last,
        hideOverlap: true,
        formatter: (v: number) => (measure === 'ticks' ? formatAxisNumber(v) : formatClock(v)),
      },
    },
  };
}

function yAxis(c: ThemeColors, extra: Record<string, unknown> = {}) {
  return { type: 'value' as const, min: 0, splitNumber: 2, ...valueAxis(c), ...extra, axisLabel: { ...valueAxis(c).axisLabel, ...(extra.axisLabel as object) } };
}

/** The selected moment as a vertical line, plus any other vertical marks. */
function markLines(ctx: Ctx, extra: object[] = []) {
  const data = [...extra];
  if (ctx.selX != null) data.push({ xAxis: ctx.selX, lineStyle: { color: ctx.c.primary, width: 1.5, type: 'solid' }, label: { show: false } });
  if (!data.length) return undefined;
  return { silent: true, symbol: 'none', animation: false, lineStyle: { color: ctx.c.muted, type: [4, 4], width: 1 }, label: { show: false }, data };
}

/** A step series that holds its last value to the axis end. */
function hold(points: [number, number][], maxX: number): [number, number][] {
  const last = points[points.length - 1];
  return last && last[0] < maxX ? [...points, [maxX, last[1]]] : points;
}

/** The value of a timeline at a tick: the last point at or before it. */
function valueAt(run: RunDetail, tick: number): number {
  let value = run.timeline[0]?.value ?? 0;
  for (const p of run.timeline) {
    if (p.tick > tick) break;
    value = p.value;
  }
  return value;
}

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

function progressLane(ctx: Ctx, last: boolean, sprites: Record<string, SpriteImage>): Lane {
  const { run, clock, measure, c } = ctx;
  const measureName = evalArt(run.eval).measure;
  const colour = c.resolve(modelInfo(run.model).color.token);
  const points = hold(
    run.timeline.map(p => [clock.x(p.tick, measure), p.value]),
    ctx.maxX
  );
  const accounts = Object.keys(run.timeline[0]?.accounts ?? {});
  const marked = run.events.filter((e): e is Marked => e.kind === 'quest' || e.kind === 'death' || e.kind === 'level');
  const attempts = run.events.filter((e): e is Extract<RunEvent, { kind: 'attempt' }> => e.kind === 'attempt' && e.attempt > 1);
  const attemptStarts = run.events.filter((e): e is Extract<RunEvent, { kind: 'attempt' }> => e.kind === 'attempt');
  const span = ctx.maxX || 1;

  const tooltip = (x: number): string => {
    const tick = measure === 'ticks' ? x : clock.toTick(x);
    const attempt = [...attemptStarts].reverse().find(a => a.tick <= tick);
    const near = marked.filter(e => Math.abs(clock.x(e.tick, measure) - x) <= span * 0.012);
    return (
      tooltipTitle(formatX(measure, x)) +
      (run.attempts > 1 && attempt ? tooltipRow(null, 'Attempt', String(attempt.attempt)) : '') +
      tooltipRow(colour, measureName, formatInt(valueAt(run, tick))) +
      near.map(e => tooltipRow(null, eventName(e), formatX(measure, clock.x(e.tick, measure)))).join('') +
      (near.some(e => e.kind === 'quest' && e.source === 'inferred')
        ? `<div style="margin-top:4px;color:${c.muted}">≈ inferred from the quest-points jump</div>`
        : '')
    );
  };

  const option: EChartsOption = {
    ...frame(ctx, 'progress', { last, top: attempts.length ? 20 : 12 }, tooltip),
    yAxis: yAxis(c, { max: run.target ?? undefined, interval: run.target && run.target % 2 === 0 ? run.target / 2 : undefined, minInterval: 1 }),
    series: [
      {
        type: 'line',
        name: measureName,
        step: 'end',
        showSymbol: false,
        data: points,
        lineStyle: { width: 1.5, color: colour },
        itemStyle: { color: colour },
        areaStyle: { color: withAlpha(colour, 0.1) },
        markLine: markLines(
          ctx,
          attempts.map(a => ({
            xAxis: clock.x(a.tick, measure),
            label: { show: true, formatter: `Attempt ${a.attempt}`, position: 'end', color: c.muted, fontSize: 11 },
          }))
        ),
      },
      ...(accounts.length > 1
        ? accounts.map(a => {
            const accountColour = c.resolve(hashColor(a).token);
            return {
              type: 'line' as const,
              name: a,
              step: 'end' as const,
              showSymbol: false,
              data: hold(
                run.timeline.map(p => [clock.x(p.tick, measure), p.accounts?.[a] ?? 0]),
                ctx.maxX
              ),
              lineStyle: { width: 1, color: accountColour },
              itemStyle: { color: accountColour },
            };
          })
        : []),
      {
        type: 'scatter',
        silent: true,
        z: 5,
        data: marked.flatMap(e => {
          const img = sprites[eventSprite(e)];
          if (!img) return [];
          return [{ value: [clock.x(e.tick, measure), valueAt(run, e.tick)], symbol: `image://${img.url}`, symbolSize: [img.width, img.height] }];
        }),
      },
    ],
  } as EChartsOption;
  return { id: 'progress', title: measureName, height: (attempts.length ? 168 : 160) + (last ? 20 : 0), option };
}

/** Each call's x on the measure, at its start and at its end. */
function callXs(ctx: Ctx) {
  const { run, clock, measure } = ctx;
  const calls = run.series.calls;
  const at = (seconds: number, tick: number | null | undefined): number =>
    Math.min(ctx.maxX, measure === 'seconds' ? seconds : (tick ?? clock.toTick(seconds)));
  const start = calls.seconds.map((s, i) => at(s, calls.tick[i]));
  const end = calls.seconds.map((s, i) => at(s + calls.latency[i], null));
  return { start, end };
}

function spendLane(ctx: Ctx, last: boolean, price: Price | undefined, cut: RunSearch['cost']): Lane {
  const { run, c } = ctx;
  const calls = run.series.calls;
  const usd = cut === 'usd' && price != null;
  const { end } = callXs(ctx);
  const kinds = TOKEN_KINDS.filter(k => ctx.visible(k.id));
  const valueOf = (k: (typeof TOKEN_KINDS)[number], i: number): number => {
    const tokens = calls[k.key][i] ?? 0;
    return usd ? (tokens * price![k.price]) / 1e6 : tokens;
  };
  const format = (v: number): string => (usd ? formatCost(v) : formatTokens(v));
  const callIndexAt = (x: number): number => {
    let found = -1;
    for (let i = 0; i < end.length && end[i] <= x; i++) found = i;
    return found;
  };

  const tooltip = (x: number): string => {
    const i = callIndexAt(x);
    if (i < 0) return tooltipTitle(formatX(ctx.measure, x)) + tooltipRow(null, 'Spent', format(0));
    const rows = [...kinds].reverse().map(k => tooltipRow(c.resolve(k.color.token), k.label, format(valueOf(k, i))));
    const total = kinds.reduce((sum, k) => sum + valueOf(k, i), 0);
    return tooltipTitle(formatX(ctx.measure, x)) + rows.join('') + (kinds.length > 1 ? tooltipRow(null, 'Total', format(total)) : '');
  };

  const option = {
    ...frame(ctx, 'spend', { last, top: 8 }, tooltip),
    yAxis: yAxis(c, { axisLabel: { formatter: (v: number) => (usd ? `$${Number(v.toPrecision(2))}` : formatAxisNumber(v)) } }),
    series: kinds.map((k, n) => {
      const color = c.resolve(k.color.token);
      return {
        type: 'line',
        name: k.label,
        stack: 'spend',
        step: 'end',
        showSymbol: false,
        data: hold([[0, 0], ...end.map((x, i): [number, number] => [x, valueOf(k, i)])], ctx.maxX),
        lineStyle: { width: 1, color },
        itemStyle: { color },
        areaStyle: { color: withAlpha(color, 0.35) },
        markLine: n === 0 ? markLines(ctx) : undefined,
      };
    }),
  } as EChartsOption;

  return {
    id: 'spend',
    title: 'Spend',
    height: 104 + (last ? 20 : 0),
    option,
    bound: true,
    legend: TOKEN_KINDS.map(k => ({ id: k.id, label: k.label, swatchClassName: k.color.swatchClassName })),
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
  };
}

function contextLane(ctx: Ctx, last: boolean): Lane {
  const { run, c } = ctx;
  const calls = run.series.calls;
  const colour = c.resolve(modelInfo(run.model).color.token);
  const { start } = callXs(ctx);
  const points = start.flatMap((x, i): [number, number][] => (calls.context[i] == null ? [] : [[x, calls.context[i]!]]));
  const tooltip = (x: number): string => {
    let i = 0;
    while (i + 1 < start.length && start[i + 1] <= x) i++;
    return tooltipTitle(`Turn ${i + 1}`) + tooltipRow(colour, 'Context', `${formatTokens(calls.context[i])} tokens`);
  };
  return {
    id: 'context',
    title: 'Context',
    height: 84 + (last ? 20 : 0),
    option: {
      ...frame(ctx, 'context', { last, top: 8 }, tooltip),
      yAxis: yAxis(c, { axisLabel: { formatter: (v: number) => formatAxisNumber(v) } }),
      series: [
        {
          type: 'line',
          name: 'Context',
          showSymbol: points.length < 80,
          symbolSize: 3,
          data: points,
          lineStyle: { width: 1.5, color: colour },
          itemStyle: { color: colour },
          markLine: markLines(ctx),
        },
      ],
    } as EChartsOption,
  };
}

function callsLane(ctx: Ctx, last: boolean): Lane {
  const { run, c } = ctx;
  const calls = run.series.calls;
  const turns = run.turns;
  const { start, end } = callXs(ctx);
  const until = start.map((_, i) => (i + 1 < start.length ? start[i + 1] : Math.min(ctx.maxX, end[i])));
  const colours = calls.category.map(cat => (cat ? c.resolve(CATEGORIES[cat].color.token) : c.muted));
  const shown = turns.map(
    t => (ctx.tools.length === 0 || t.actions.some(a => ctx.tools.includes(a.category))) && (!ctx.errorsOnly || turnHasError(t))
  );
  const errors = turns.map(turnHasError);
  const present = [...new Set(calls.category.filter((x): x is ToolCategory => x != null))];

  const tooltip = (x: number): string => {
    let i = 0;
    while (i + 1 < start.length && start[i + 1] <= x) i++;
    const turn = turns[i];
    const cat = calls.category[i];
    const summary = turn ? turnSummary(turn) : null;
    return (
      tooltipTitle(`Turn ${i + 1}`) +
      (summary ? `<div style="max-width:260px;white-space:normal;margin-bottom:4px;color:${c.muted}">${escapeHtml(summary.text.slice(0, 120))}</div>` : '') +
      (cat ? tooltipRow(colours[i], CATEGORIES[cat].label, '') : '') +
      tooltipRow(null, 'Model', `${formatSeconds(calls.latency[i])} s`) +
      tooltipRow(null, 'Then', calls.gap[i] == null ? 'End' : `${formatSeconds(calls.gap[i])} s`) +
      (errors[i] ? tooltipRow(c.danger, 'Error', '') : '')
    );
  };

  return {
    id: 'calls',
    title: 'Model calls',
    height: 56 + (last ? 20 : 0),
    legend: present.map(cat => ({ label: CATEGORIES[cat].label, color: CATEGORIES[cat].color })),
    option: {
      ...frame(ctx, 'calls', { last, top: 4 }, tooltip),
      yAxis: { type: 'value', min: 0, max: 1, show: false },
      series: [
        {
          type: 'custom',
          encode: { x: [1, 2, 3], y: 0 },
          data: start.map((x, i) => [0, x, end[i], until[i], i]),
          renderItem: (params: CustomSeriesRenderItemParams, api: CustomSeriesRenderItemAPI) => {
            const i = api.value(4) as number;
            const sys = params.coordSys as unknown as { y: number; height: number };
            const [x0] = api.coord([api.value(1), 0]);
            const [x1] = api.coord([api.value(2), 0]);
            const [x2] = api.coord([api.value(3), 0]);
            const top = sys.y + 4;
            const h = sys.height - 8;
            const alpha = shown[i] ? 1 : 0.2;
            const fill = colours[i];
            const children: object[] = [
              { type: 'rect', shape: { x: x1, y: top + h * 0.3, width: Math.max(0, x2 - x1), height: h * 0.4 }, style: { fill: withAlpha(fill, 0.3 * alpha) } },
              { type: 'rect', shape: { x: x0, y: top, width: Math.max(1.5, x1 - x0), height: h }, style: { fill: withAlpha(fill, alpha) } },
            ];
            if (errors[i] && shown[i]) children.push({ type: 'rect', shape: { x: x0, y: top - 3, width: Math.max(3, x1 - x0), height: 2 }, style: { fill: c.danger } });
            if (ctx.selTurn === i) {
              children.push({
                type: 'rect',
                shape: { x: x0 - 1.5, y: top - 1.5, width: Math.max(4.5, x2 - x0 + 3), height: h + 3 },
                style: { fill: 'none', stroke: c.foreground, lineWidth: 1.5 },
              });
            }
            return { type: 'group', children } as never;
          },
          markLine: markLines(ctx),
        },
      ],
    } as EChartsOption,
  };
}

/** Per-bucket values (from tick 0 to the end) as step points on the measure. */
function bucketSeries(ctx: Ctx, bucket: number, values: number[]): [number, number][] {
  return hold(
    values.map((v, b): [number, number] => [ctx.clock.x(b * bucket, ctx.measure), v]),
    ctx.maxX
  );
}

function stackedLane(
  ctx: Ctx,
  id: string,
  bucket: number,
  groups: { id: string; label: string; color: string; values: number[] }[],
  tooltipExtra?: (b: number) => string
): { option: EChartsOption; tooltip: (x: number) => string } {
  const { c, clock, measure } = ctx;
  const visible = groups.filter(g => ctx.visible(g.id));
  const tooltip = (x: number): string => {
    const tick = measure === 'ticks' ? x : clock.toTick(x);
    const b = Math.max(0, Math.floor(tick / bucket));
    const rows = [...visible].reverse().filter(g => (g.values[b] ?? 0) > 0);
    return (
      tooltipTitle(`${formatX(measure, clock.x(b * bucket, measure))}–${measure === 'ticks' ? formatInt((b + 1) * bucket) : formatClock(clock.toSeconds((b + 1) * bucket))}`) +
      (rows.length ? rows.map(g => tooltipRow(g.color, g.label, formatInt(g.values[b]))).join('') : `<div style="color:${c.muted}">None</div>`) +
      (tooltipExtra?.(b) ?? '')
    );
  };
  const option = {
    yAxis: yAxis(c, { minInterval: 1 }),
    series: visible.map((g, n) => ({
      type: 'line',
      name: g.label,
      stack: id,
      step: 'end',
      showSymbol: false,
      data: bucketSeries(ctx, bucket, g.values),
      lineStyle: { width: 1, color: g.color },
      itemStyle: { color: g.color },
      areaStyle: { color: withAlpha(g.color, 0.45) },
      markLine: n === 0 ? markLines(ctx) : undefined,
    })),
  } as EChartsOption;
  if (visible.length === 0) (option.series as object[]).push({ type: 'line', data: [[0, 0], [ctx.maxX, 0]], showSymbol: false, lineStyle: { opacity: 0 }, markLine: markLines(ctx) });
  return { option, tooltip };
}

function sdkLane(ctx: Ctx, last: boolean, cut: RunSearch['sdk']): Lane | null {
  const sdk = ctx.run.series.sdk;
  if (!sdk || sdk.bins.length === 0) return null;
  const { c } = ctx;
  const n = Math.ceil(ctx.clock.maxTicks / sdk.bucket_ticks);
  const zeros = (): number[] => new Array(n).fill(0);
  let groups: { id: string; label: string; color: string; values: number[]; legendColor: (typeof SDK_OK) }[];
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
      { id: 'ok', label: 'Succeeded', color: c.resolve(SDK_OK.token), values: ok, legendColor: SDK_OK },
      { id: 'failed', label: 'Failed', color: c.danger, values: failed, legendColor: SDK_FAILED },
    ];
  } else {
    const byFn = sdk.functions.map(zeros);
    for (const [start, fn, good, bad] of sdk.bins) {
      const b = Math.floor(start / sdk.bucket_ticks);
      if (b < n) byFn[fn][b] += good + bad;
    }
    groups = sdk.functions
      .map((name, i) => ({ id: name, label: name, color: c.resolve(hashColor(name).token), values: byFn[i], legendColor: hashColor(name) }))
      .sort((a, b) => b.values.reduce((s, v) => s + v, 0) - a.values.reduce((s, v) => s + v, 0));
  }
  const { option, tooltip } = stackedLane(ctx, 'sdk', sdk.bucket_ticks, groups);
  return {
    id: 'sdk',
    title: 'SDK actions per 100 ticks',
    height: 92 + (last ? 20 : 0),
    option: { ...frame(ctx, 'sdk', { last, top: 8 }, tooltip), ...option },
    bound: true,
    legend: groups.map(g => ({ id: g.id, label: g.label, swatchClassName: g.legendColor.swatchClassName })),
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
  };
}

function activityLane(ctx: Ctx, last: boolean, cut: RunSearch['act']): Lane | null {
  const activity = ctx.run.series.activity;
  if (!activity || activity.rows.length === 0) return null;
  const { c } = ctx;
  const bucket = activity.bucket_ticks;
  const n = Math.min(activity.rows.length, Math.ceil(ctx.clock.maxTicks / bucket));
  const rows = activity.rows.slice(0, n);
  let groups: { id: string; label: string; color: string; values: number[]; swatch: string }[];
  if (cut === 'moving') {
    groups = [
      { id: 'walking', label: 'Walking', color: c.resolve(WALKING.token), values: rows.map(r => Math.max(0, r[1] - r[2])), swatch: WALKING.swatchClassName },
      { id: 'running', label: 'Running', color: c.resolve(RUNNING.token), values: rows.map(r => r[2]), swatch: RUNNING.swatchClassName },
    ];
  } else {
    const names = new Map<string, number>();
    for (const r of rows) if (r[5] && r[3] > 0) names.set(r[5], (names.get(r[5]) ?? 0) + r[3]);
    groups = [...names.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([seq]) => ({
        id: seq,
        label: animationName(seq),
        color: c.resolve(hashColor(seq).token),
        values: rows.map(r => (r[5] === seq ? r[3] : 0)),
        swatch: hashColor(seq).swatchClassName,
      }));
  }
  const { option, tooltip } = stackedLane(ctx, 'activity', bucket, groups);
  return {
    id: 'activity',
    title: cut === 'moving' ? 'Ticks moving per 100' : 'Animations per 100 ticks',
    height: 92 + (last ? 20 : 0),
    option: { ...frame(ctx, 'activity', { last, top: 8 }, tooltip), ...option },
    bound: true,
    legend: groups.map(g => ({ id: g.id, label: g.label, swatchClassName: g.swatch })),
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
  };
}

function xpLane(ctx: Ctx, last: boolean): Lane | null {
  const xp = ctx.run.series.xp;
  if (!xp || Object.keys(xp).length === 0) return null;
  const { c, clock, measure } = ctx;
  const skills = Object.keys(xp).sort((a, b) => (xp[b].at(-1)?.[1] ?? 0) - (xp[a].at(-1)?.[1] ?? 0));
  const visible = skills.filter(s => ctx.visible(s));
  const label = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1);
  const at = (s: string, tick: number): number => {
    let v = 0;
    for (const [t, value] of xp[s]) {
      if (t > tick) break;
      v = value;
    }
    return v;
  };
  const tooltip = (x: number): string => {
    const tick = measure === 'ticks' ? x : clock.toTick(x);
    return tooltipTitle(formatX(measure, x)) + visible.map(s => tooltipRow(c.resolve(hashColor(s).token), label(s), formatInt(at(s, tick)))).join('');
  };
  return {
    id: 'xp',
    title: 'XP',
    height: 120 + (last ? 20 : 0),
    bound: true,
    legend: skills.map(s => ({ id: s, label: label(s), color: hashColor(s), line: 'solid' as const, mark: <Sprite src={skillSrc(s)} size={14} alt="" /> })),
    option: {
      ...frame(ctx, 'xp', { last, top: 8 }, tooltip),
      yAxis: yAxis(c, { axisLabel: { formatter: (v: number) => formatAxisNumber(v) } }),
      series: (visible.length ? visible : ['']).map((s, n) => {
        const color = s ? c.resolve(hashColor(s).token) : c.muted;
        return {
          type: 'line',
          name: s,
          step: 'end',
          showSymbol: false,
          data: s ? hold(xp[s].map(([t, v]): [number, number] => [clock.x(t, measure), v]), ctx.maxX) : [],
          lineStyle: { width: 1.5, color },
          itemStyle: { color },
          markLine: n === 0 ? markLines(ctx) : undefined,
        };
      }),
    } as EChartsOption,
  };
}

const RAIL_POINTS = 2000;

/**
 * ECharts connects charts by series and data index: a lane's crosshair shows only where the other
 * lanes have the same series index and data index. So every lane gets the same invisible rail as
 * series 0, the only series the axis pointer looks at; the lanes compute their tooltips themselves.
 */
function withRail(lane: Lane, maxX: number): Lane {
  const rail = {
    type: 'line',
    data: Array.from({ length: RAIL_POINTS + 1 }, (_, i) => [(i / RAIL_POINTS) * maxX, 0]),
    symbol: 'none',
    silent: true,
    emphasis: { disabled: true },
    lineStyle: { opacity: 0 },
    z: 0,
  };
  const series = ((lane.option.series ?? []) as object[]).map(s => ({ ...s, tooltip: { show: false } }));
  return { ...lane, option: { ...lane.option, series: [rail, ...series] } as EChartsOption };
}

export function Lanes({ run, clock, search, price }: { run: RunDetail; clock: Clock; search: RunSearch; price: Price | undefined }) {
  const c = useThemeColors();
  const update = useSearchUpdate(runSearch);
  const legend = useLegend();
  const hovered = useRef<string | null>(null);
  const lastX = useRef<number | null>(null);
  const measure = search.x;
  const maxX = measure === 'ticks' ? clock.maxTicks : clock.maxSeconds;
  const turns = run.turns;
  const selTurn = search.turn != null && search.turn <= turns.length ? search.turn - 1 : null;
  const selTick = search.t ?? (selTurn != null ? turnTick(turns[selTurn], clock) : null);
  const selX = selTick == null ? null : Math.min(maxX, clock.x(selTick, measure));

  const spriteSrcs = useMemo(
    () => run.events.flatMap(e => (e.kind === 'quest' || e.kind === 'death' || e.kind === 'level' ? [eventSprite(e)] : [])),
    [run.events]
  );
  const sprites = useSpriteImages(spriteSrcs);
  const hasCalls = run.series.calls.seconds.length > 0;
  const { visible } = legend;

  const lanes = useMemo(() => {
    const ctx: Ctx = { run, clock, measure, c, maxX, selX, selTurn, tools: search.tools as ToolCategory[], errorsOnly: search.errors === '1', visible, hovered, lastX };
    const builders: ((last: boolean) => Lane | null)[] = [
      last => progressLane(ctx, last, sprites),
      ...(hasCalls
        ? [(last: boolean) => spendLane(ctx, last, price, search.cost), (last: boolean) => contextLane(ctx, last), (last: boolean) => callsLane(ctx, last)]
        : []),
      last => sdkLane(ctx, last, search.sdk),
      last => activityLane(ctx, last, search.act),
      last => xpLane(ctx, last),
    ];
    // Build once to see which lanes exist, then again so the last one carries the x labels
    const present = builders.filter(b => b(false) != null);
    return present.map((b, i) => withRail(b(i === present.length - 1)!, maxX));
  }, [run, clock, measure, c, maxX, selX, selTurn, search.tools, search.errors, search.cost, search.sdk, search.act, visible, sprites, hasCalls, price]);

  /** Select the call running at the crosshair and put the map there. */
  const select = (): void => {
    const x = lastX.current;
    if (x == null) return;
    const tick = Math.max(0, Math.round(measure === 'ticks' ? x : clock.toTick(x)));
    update({ t: tick, turn: turns.length ? turnAt(turns, clock, tick) + 1 : undefined });
  };

  const onEvents = useMemo(
    () => ({
      updateaxispointer: (params: unknown) => {
        const value = (params as { axesInfo?: { axisDim: string; value: number }[] }).axesInfo?.find(a => a.axisDim === 'x')?.value;
        if (value == null) return;
        lastX.current = value;
        setMoment({ hover: Math.round(measure === 'ticks' ? value : clock.toTick(value)) });
      },
    }),
    [clock, measure]
  );

  // The x measure sits on the first lane, for all of them
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

  return (
    <Card className="select-none">
      <div
        className="flex cursor-crosshair flex-col divide-y divide-border"
        onMouseLeave={() => {
          hovered.current = null;
          setMoment({ hover: null });
        }}
      >
        {lanes.map((lane, i) => (
          <LaneRow key={lane.id} lane={i === 0 ? { ...lane, control: xControl } : lane} legend={legend} hovered={hovered} onEvents={onEvents} onSelect={select} />
        ))}
      </div>
    </Card>
  );
}

function LaneRow({
  lane,
  legend,
  hovered,
  onEvents,
  onSelect,
}: {
  lane: Lane;
  legend: LegendState;
  hovered: RefObject<string | null>;
  onEvents: Record<string, (params: unknown) => void>;
  onSelect: () => void;
}) {
  return (
    <section aria-label={typeof lane.title === 'string' ? lane.title : lane.id} className="pt-2 first:pt-0">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
        <h3 className="text-xs/7 font-medium whitespace-nowrap text-foreground">{lane.title}</h3>
        {/* Narrow, the legend takes its own line under the title and the cut */}
        {lane.legend && lane.legend.length > 0 && (
          <ChartLegend items={lane.legend} legend={lane.bound ? legend : undefined} className="order-last basis-full sm:order-none sm:basis-0 sm:flex-1" />
        )}
        {lane.control && <div className="ml-auto">{lane.control}</div>}
      </div>
      <div
        onMouseEnter={() => {
          hovered.current = lane.id;
        }}
        onClick={onSelect}
      >
        <Chart option={lane.option} height={lane.height} group={GROUP} onEvents={onEvents} />
      </div>
    </section>
  );
}
