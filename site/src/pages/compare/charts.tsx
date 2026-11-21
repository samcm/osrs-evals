/** /compare's charts: every run as a point with its group's median, and the tool-call mix. */

import { useMemo, type ReactNode } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { Bar, BarChart, CartesianGrid, Scatter, ScatterChart, XAxis, YAxis } from 'recharts';
import { ChartFrame, KeyLegend, SeriesLabel, SeriesTooltip, seriesConfig, seriesColor, xAxisProps, logAxisProps, type LegendItem } from '@/components/charts';
import { ChartTooltip, ChartTooltipContent } from '@/components/ui/chart';
import type { Eval, Run, ToolCategory } from '@/data/types';
import { agentSeries, modelSeries, scatterShape, toolSeries, variantSeries, type SeriesSpec } from '@/lib/chartSeries';
import { formatPercent } from '@/lib/format';
import { useHover } from '@/lib/hover';
import type { SeriesColor } from '@/lib/series';
import type { LegendState } from '@/lib/legend';
import { roundCeil, roundTicks } from '@/lib/ticks';
import { TOOL_CATEGORIES } from '@/lib/tools';
import { useWidth } from '@/lib/useWidth';
import { GroupLabel, groupName, type GroupBy } from './groups';
import type { Metric } from './metrics';

export interface RankedGroup {
  key: string;
  sample: Run;
  /** Runs with a value, and the value */
  points: { run: Run; value: number }[];
  median: number;
}

/** A stable offset in [-1, 1] for a run, so points in a group spread the same way on every render. */
function jitter(id: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return ((h >>> 0) / 0xffffffff) * 2 - 1;
}

/** Room for group labels left of the plot: a pairing's model and badge, or one name. */
const LABEL_WIDTH = { pairing: 232, wide: 148, narrow: 112 };
const labelWidthFor = (by: GroupBy, narrow: boolean) => (narrow ? LABEL_WIDTH.narrow : by === 'variant' ? LABEL_WIDTH.pairing : LABEL_WIDTH.wide);

/** Harness keys are shapes in the text colour: colour belongs to models. */
const SHAPE_KEY_COLOR: SeriesColor = {
  token: '--foreground',
  swatchClassName: 'bg-foreground',
  borderClassName: 'border-foreground',
  fillClassName: 'fill-foreground',
};

/** Unique by `key`, in first-seen order. */
const uniqueBy = <T,>(items: T[], key: (item: T) => string): T[] => [...new Map(items.map(item => [key(item), item])).values()];
/** Room for each row's median right of the plot. */
const MEDIAN_WIDTH = 64;

/** A y-axis tick drawn as the group's label with its marks, right-aligned against the plot. */
function GroupTick({ x, y, width, height = 24, children }: { x: number; y: number; width: number; height?: number; children: ReactNode }) {
  return (
    <foreignObject x={x - width} y={y - height / 2} width={width - 4} height={height}>
      {/* A label wider than its room truncates its name, never its marks or its start */}
      <div className="flex h-full items-center justify-end overflow-hidden text-xs text-foreground">
        <div className="flex max-w-full min-w-0 justify-end">{children}</div>
      </div>
    </foreignObject>
  );
}

interface Point {
  x: number;
  y: number;
  run?: Run;
  group?: RankedGroup;
}

/**
 * Every run as a point on the metric, a group per row (ranked, best at the top), with the group's
 * median as a bar and its value at the row's right end: the chart is its own ranking. Points take
 * their model's colour and their harness's shape; the legend keys each once and hides or isolates
 * them through `legend` (the page drops hidden runs from `groups`).
 */
export function StripChart({
  groups,
  keyed,
  metric,
  by,
  log,
  evals,
  legend,
}: {
  groups: RankedGroup[];
  /** Every run with a value, hidden or not: the legend keys their models and harnesses */
  keyed: Run[];
  metric: Metric;
  by: GroupBy;
  log: boolean;
  /** When runs pool several evals: each point's tooltip names its eval */
  evals?: Eval[];
  legend: LegendState;
}) {
  const navigate = useNavigate();
  const hover = useHover();
  const [ref, width] = useWidth();
  const narrow = width > 0 && width < 520;
  const labelWidth = labelWidthFor(by, narrow);
  const titles = useMemo(() => new Map((evals ?? []).map(e => [e.id, e.title])), [evals]);

  // One scatter per variant: its model's colour, its agent's point shape
  const variants = useMemo(() => {
    const byKey = new Map<string, { series: SeriesSpec; model: string; agent: string; points: Point[] }>();
    groups.forEach((g, i) =>
      g.points.forEach(p => {
        const series = variantSeries(p.run);
        const entry = byKey.get(series.key) ?? { series, model: p.run.model, agent: p.run.agent, points: [] };
        entry.points.push({ x: p.value, y: i + jitter(p.run.id) * 0.22, run: p.run });
        byKey.set(series.key, entry);
      })
    );
    return [...byKey.values()];
  }, [groups]);
  const medians: Point[] = groups.map((g, i) => ({ x: g.median, y: i, group: g }));

  const legendItems = useMemo<LegendItem[]>(() => {
    const models = uniqueBy(keyed, r => r.model)
      .map(r => modelSeries(r.model))
      .sort((a, b) => a.name.localeCompare(b.name));
    const agents = uniqueBy(keyed, r => r.agent)
      .map(r => agentSeries(r.agent, r.agent_name))
      .sort((a, b) => a.name.localeCompare(b.name));
    return [
      { label: 'Median', swatchClassName: 'bg-foreground' },
      ...models.map(s => ({ id: s.id, name: s.name, label: null, mark: <SeriesLabel series={s} size={14} />, color: s.swatch })),
      ...agents.map(s => ({ id: s.id, name: s.name, label: null, mark: <SeriesLabel series={s} size={14} />, color: SHAPE_KEY_COLOR, symbol: s.symbol })),
    ];
  }, [keyed]);

  // A key is lit while any of its runs is drawn: isolating a harness keeps lit the models it ran
  const keyLegend = useMemo<LegendState>(() => {
    const drawn = new Set(groups.flatMap(g => g.points.flatMap(p => [p.run.model, p.run.agent])));
    return { ...legend, visible: id => drawn.has(id) };
  }, [groups, legend]);

  const values = groups.flatMap(g => g.points.map(p => p.value));
  const tick = metric.tick ?? metric.format;
  const integer = metric.whole ?? false;
  const max = roundCeil(Math.max(...values, 0), 5, integer);
  const xProps = (log && logAxisProps(values, tick)) || {
    ...xAxisProps({ dataKey: 'x', domain: [0, max], ticks: roundTicks(max, 5, integer), format: tick }),
  };
  const rowTicks = groups.map((_, i) => i);

  return (
    <div ref={ref}>
      <ChartFrame
        config={seriesConfig(variants.map(v => v.series))}
        rows={Math.max(groups.length, 2)}
        empty={groups.length === 0 ? 'Every run here is hidden.' : undefined}
        legend={<KeyLegend legend={keyLegend} items={legendItems} />}
      >
        <ScatterChart margin={{ top: 8, right: 0, bottom: 0, left: 0 }}>
          <CartesianGrid horizontal={false} />
          {/* Unclipped, so a point at either end of the scale stays whole */}
          <XAxis {...xProps} dataKey="x" allowDataOverflow={false} />
          <YAxis
            type="number"
            dataKey="y"
            domain={[-0.5, groups.length - 0.5]}
            ticks={rowTicks}
            reversed
            interval={0}
            tickLine={false}
            axisLine={false}
            width={labelWidth}
            tick={(props: unknown) => {
              const { x, y, payload } = props as { x: number; y: number; payload: { value: number } };
              const g = groups[payload.value];
              return g ? (
                <GroupTick x={x} y={y} width={labelWidth} height={narrow ? 42 : 24}>
                  <GroupLabel sample={g.sample} by={by} size={14} stacked={narrow} />
                </GroupTick>
              ) : (
                <g />
              );
            }}
          />
          {/* The ranking: each row's median, read off the right edge */}
          <YAxis
            yAxisId="median"
            orientation="right"
            type="number"
            dataKey="y"
            domain={[-0.5, groups.length - 0.5]}
            ticks={rowTicks}
            reversed
            interval={0}
            tickLine={false}
            axisLine={false}
            width={MEDIAN_WIDTH}
            tick={(props: unknown) => {
              const { x, y, payload } = props as { x: number; y: number; payload: { value: number } };
              const g = groups[payload.value];
              return g ? (
                <text x={x + 8} y={y} dy="0.35em" textAnchor="start" className="fill-foreground text-xs font-medium tabular-nums">
                  {metric.format(g.median)}
                </text>
              ) : (
                <g />
              );
            }}
          />
          <ChartTooltip
            cursor={false}
            content={props => {
              const point = (props.payload?.[0]?.payload ?? null) as Point | null;
              if (!point) return null;
              const rows = point.run
                ? [...(evals ? [['Eval', titles.get(point.run.eval) ?? point.run.eval]] : []), [metric.label, metric.format(point.x)]]
                : [
                    ['Median', metric.format(point.x)],
                    ['Runs', String(point.group!.points.length)],
                  ];
              return (
                <ChartTooltipContent
                  active={props.active}
                  payload={props.payload?.slice(0, 1)}
                  hideLabel
                  formatter={() => (
                    <div className="grid w-full gap-1.5">
                      {point.run ? <SeriesLabel series={variantSeries(point.run)} /> : <span className="font-medium">{groupName(point.group!.sample, by)}</span>}
                      {rows.map(([k, v]) => (
                        <div key={k} className="flex justify-between gap-4">
                          <span className="text-muted-foreground">{k}</span>
                          <span className="font-medium tabular-nums">{v}</span>
                        </div>
                      ))}
                    </div>
                  )}
                />
              );
            }}
          />
          {variants.map(({ series, model, agent, points }) => (
            <Scatter
              key={series.key}
              name={series.key}
              data={points}
              shape={scatterShape(series.symbol)}
              fill={seriesColor(series)}
              // A hovered legend key names a model or a harness
              fillOpacity={hover.id != null && hover.id !== model && hover.id !== agent && hover.id !== series.id ? 0.15 : 0.75}
              isAnimationActive={false}
              className="cursor-pointer"
              onClick={(d: { payload?: Point }) => d.payload?.run && navigate({ to: '/runs/$runId', params: { runId: d.payload.run.id } })}
            />
          ))}
          <Scatter
            name="median"
            yAxisId="median"
            data={medians}
            isAnimationActive={false}
            shape={(props: { cx?: number; cy?: number }) => (
              <rect x={(props.cx ?? 0) - 1} y={(props.cy ?? 0) - 12} width={2} height={24} rx={1} className="fill-foreground" />
            )}
          />
        </ScatterChart>
      </ChartFrame>
    </div>
  );
}

export interface MixGroup {
  key: string;
  sample: Run;
  counts: Map<string, number>;
  total: number;
}

/** Each group's tool calls as shares by kind, stacked to 100%. */
export function ToolMixChart({ groups, by }: { groups: MixGroup[]; by: GroupBy }) {
  const [ref, width] = useWidth();
  const narrow = width > 0 && width < 520;
  const labelWidth = labelWidthFor(by, narrow);
  const used = TOOL_CATEGORIES.filter(c => groups.some(g => g.counts.get(c.id)));
  const series = used.map(c => toolSeries(c.id as ToolCategory));
  const rows = groups.map(g => ({
    key: g.key,
    ...Object.fromEntries(series.map(s => [s.key, (g.counts.get(s.id) ?? 0) / g.total])),
  }));
  const byKey = new Map(groups.map(g => [g.key, g]));

  return (
    <div ref={ref}>
      <ChartFrame config={seriesConfig(series)} rows={groups.length} legend={<KeyLegend items={series.map(s => ({ label: s.label, color: s.swatch }))} />}>
        <BarChart data={rows} layout="vertical" margin={{ top: 0, right: 16, bottom: 0, left: 0 }}>
          <CartesianGrid horizontal={false} />
          <XAxis {...xAxisProps({ domain: [0, 1], ticks: [0, 0.25, 0.5, 0.75, 1], format: v => formatPercent(v) })} />
          <YAxis
            type="category"
            dataKey="key"
            tickLine={false}
            axisLine={false}
            width={labelWidth}
            interval={0}
            tick={(props: unknown) => {
              const { x, y, payload } = props as { x: number; y: number; payload: { value: string } };
              const g = byKey.get(payload.value);
              return g ? (
                <GroupTick x={x} y={y} width={labelWidth} height={narrow ? 42 : 24}>
                  <GroupLabel sample={g.sample} by={by} size={14} stacked={narrow} />
                </GroupTick>
              ) : (
                <g />
              );
            }}
          />
          <ChartTooltip
            cursor={false}
            content={
              <SeriesTooltip
                series={series}
                sort="none"
                format={v => formatPercent(v)}
                labelFormat={key => {
                  const g = byKey.get(String(key));
                  return g ? groupName(g.sample, by) : String(key);
                }}
              />
            }
          />
          {series.map(s => (
            <Bar key={s.key} dataKey={s.key} stackId="mix" fill={seriesColor(s)} barSize={18} isAnimationActive={false} />
          ))}
        </BarChart>
      </ChartFrame>
    </div>
  );
}
