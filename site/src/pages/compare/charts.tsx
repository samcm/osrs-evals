/** /compare's charts: every run as a point with its group's median, and the tool-call mix. */

import { useMemo, type ReactNode } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { Bar, BarChart, CartesianGrid, Scatter, ScatterChart, XAxis, YAxis } from 'recharts';
import { KeyLegend, SeriesLabel, SeriesTooltip, seriesConfig, seriesColor, xAxisProps, logAxisProps } from '@/components/charts';
import { ChartContainer, ChartTooltip, ChartTooltipContent } from '@/components/ui/chart';
import type { Eval, Run, ToolCategory } from '@/data/types';
import { scatterShape, toolSeries, variantSeries, type SeriesSpec } from '@/lib/chartSeries';
import { formatPercent } from '@/lib/format';
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
  /** Runs in the group, with or without a value */
  total: number;
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

/** Room for group labels left of the plot. */
const LABEL_WIDTH = { wide: 196, narrow: 112 };

/** A y-axis tick drawn as the group's label with its marks, right-aligned against the plot. */
function GroupTick({ x, y, width, height = 24, children }: { x: number; y: number; width: number; height?: number; children: ReactNode }) {
  return (
    <foreignObject x={x - width} y={y - height / 2} width={width - 4} height={height}>
      <div className="flex h-full items-center justify-end overflow-hidden text-xs text-foreground">{children}</div>
    </foreignObject>
  );
}

interface Point {
  x: number;
  y: number;
  run?: Run;
  group?: RankedGroup;
}

/** Every run as a point on the metric, a group per row (ranked, best at the top), with the group's median as a bar. */
export function StripChart({
  groups,
  metric,
  by,
  log,
  evals,
  legend,
}: {
  groups: RankedGroup[];
  metric: Metric;
  by: GroupBy;
  log: boolean;
  evals: Eval[];
  legend: LegendState;
}) {
  const navigate = useNavigate();
  const [ref, width] = useWidth();
  const narrow = width > 0 && width < 520;
  const labelWidth = narrow ? LABEL_WIDTH.narrow : LABEL_WIDTH.wide;
  const titles = useMemo(() => new Map(evals.map(e => [e.id, e.title])), [evals]);

  // One scatter per variant: its model's colour, its agent's point shape
  const variants = useMemo(() => {
    const byKey = new Map<string, { series: SeriesSpec; points: Point[] }>();
    groups.forEach((g, i) =>
      g.points.forEach(p => {
        const series = variantSeries(p.run);
        const entry = byKey.get(series.key) ?? { series, points: [] };
        entry.points.push({ x: p.value, y: i + jitter(p.run.id) * 0.22, run: p.run });
        byKey.set(series.key, entry);
      })
    );
    return [...byKey.values()].sort((a, b) => a.series.name.localeCompare(b.series.name));
  }, [groups]);
  const medians: Point[] = groups.map((g, i) => ({ x: g.median, y: i, group: g }));

  const values = groups.flatMap(g => g.points.map(p => p.value));
  const tick = metric.tick ?? metric.format;
  const integer = metric.whole ?? false;
  const max = roundCeil(Math.max(...values, 0), 5, integer);
  const xProps = (log && logAxisProps(values, tick)) || {
    ...xAxisProps({ dataKey: 'x', domain: [0, max], ticks: roundTicks(max, 5, integer), format: tick }),
  };

  return (
    <div ref={ref}>
      <ChartContainer config={seriesConfig(variants.map(v => v.series))} className="aspect-auto w-full" style={{ height: groups.length * 44 + 40 }}>
        <ScatterChart margin={{ top: 8, right: 24, bottom: 0, left: 0 }}>
          <CartesianGrid horizontal={false} />
          <XAxis {...xProps} dataKey="x" />
          <YAxis
            type="number"
            dataKey="y"
            domain={[-0.5, groups.length - 0.5]}
            ticks={groups.map((_, i) => i)}
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
          <ChartTooltip
            cursor={false}
            content={props => {
              const point = (props.payload?.[0]?.payload ?? null) as Point | null;
              if (!point) return null;
              const rows = point.run
                ? [
                    ['Eval', titles.get(point.run.eval) ?? point.run.eval],
                    [metric.label, metric.format(point.x)],
                  ]
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
                          <span className="font-mono font-medium tabular-nums">{v}</span>
                        </div>
                      ))}
                    </div>
                  )}
                />
              );
            }}
          />
          {variants.map(({ series, points }) => (
            <Scatter
              key={series.key}
              name={series.key}
              data={points}
              shape={scatterShape(series.symbol)}
              fill={seriesColor(series)}
              fillOpacity={0.75}
              hide={!legend.visible(series.id)}
              isAnimationActive={false}
              className="cursor-pointer"
              onClick={(d: { payload?: Point }) => d.payload?.run && navigate({ to: '/runs/$runId', params: { runId: d.payload.run.id } })}
            />
          ))}
          <Scatter
            name="median"
            data={medians}
            isAnimationActive={false}
            shape={(props: { cx?: number; cy?: number }) => (
              <rect x={(props.cx ?? 0) - 1.5} y={(props.cy ?? 0) - 13} width={3} height={26} rx={1} className="fill-foreground" />
            )}
          />
        </ScatterChart>
      </ChartContainer>
      <KeyLegend
        legend={legend}
        items={[
          { label: 'Median', swatchClassName: 'bg-foreground' },
          ...variants.map(({ series }) => ({
            id: series.id,
            name: series.name,
            label: null,
            mark: <SeriesLabel series={series} size={14} />,
            color: series.swatch,
            symbol: series.symbol,
          })),
        ]}
      />
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
  const labelWidth = narrow ? LABEL_WIDTH.narrow : LABEL_WIDTH.wide;
  const used = TOOL_CATEGORIES.filter(c => groups.some(g => g.counts.get(c.id)));
  const series = used.map(c => toolSeries(c.id as ToolCategory));
  const rows = groups.map(g => ({
    key: g.key,
    ...Object.fromEntries(series.map(s => [s.key, (g.counts.get(s.id) ?? 0) / g.total])),
  }));
  const byKey = new Map(groups.map(g => [g.key, g]));

  return (
    <div ref={ref}>
      <ChartContainer config={seriesConfig(series)} className="aspect-auto w-full" style={{ height: groups.length * 44 + 40 }}>
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
      </ChartContainer>
      <KeyLegend items={series.map(s => ({ label: s.label, color: s.swatch }))} />
    </div>
  );
}
