/**
 * How the runs went about it, per pairing, model or harness: each measure as one dot per run with
 * the group's median marked (so a spread or an outlier shows), and the mix of tool calls each group
 * made.
 */

import { useMemo } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { Bar, BarChart, CartesianGrid, Cell, Scatter, ScatterChart, XAxis, YAxis } from 'recharts';
import { ChartTooltip, ChartTooltipContent, type ChartConfig } from '@/components/ui/chart';
import { ChartFrame, chartMargin, KeyLegend, Y_AXIS_WIDTH, SeriesLabel, SeriesTooltip, gridProps, xAxisProps } from '@/components/charts';
import type { Run } from '@/data/types';
import { toolSeries } from '@/lib/chartSeries';
import { FADED_OPACITY, setHovered } from '@/lib/hover';
import { faded, useLit } from './lit';
import { median } from '@/lib/stats';
import { TOOL_CATEGORIES } from '@/lib/tools';
import { useWidth } from '@/lib/useWidth';
import { formatTick, formatX, labelWidth, roundMax, roundTicks, type Measure } from './chartBits';
import { groupRuns, type Group, type GroupBy } from './model';


interface Column {
  title: string;
  measure: Measure;
  value: (run: Run) => number | null;
}

const COLUMNS: Column[] = [
  { title: 'Model calls', measure: 'count', value: r => (r.model_calls > 0 ? r.model_calls : null) },
  { title: 'Waiting on the model', measure: 'share', value: r => r.metrics.model_share },
  { title: 'Game actions', measure: 'count', value: r => r.metrics.sdk_actions },
  {
    title: 'Game actions failed',
    measure: 'share',
    value: r => (r.metrics.sdk_actions ? (r.metrics.sdk_failed ?? 0) / r.metrics.sdk_actions : null),
  },
];

export const GROUP_OPTIONS = [
  { value: 'variant' as const, label: 'Pairing' },
  { value: 'model' as const, label: 'Model' },
  { value: 'agent' as const, label: 'Harness' },
];

/** A group's label in the left gutter: its marks, short name and harness badge. */
function GroupTick({ x, y, payload, groups, width }: { x?: number; y?: number; payload?: { value: number }; groups: Group[]; width: number }) {
  const g = groups[payload?.value ?? -1];
  if (!g || x == null || y == null) return null;
  return (
    <foreignObject x={x - width} y={y - 11} width={width - 4} height={22}>
      <div className="flex h-full items-center justify-end text-xs text-foreground">
        <SeriesLabel series={g.spec} size={14} />
      </div>
    </foreignObject>
  );
}

/** A small vertical bar: the group's median. */
const MedianMark = (props: { cx?: number; cy?: number }) =>
  props.cx == null || props.cy == null ? <g /> : <rect x={props.cx - 1} y={props.cy - 8} width={2} height={16} rx={1} className="fill-foreground" />;

function Strip({ column, groups, labels, labelRoom, lit }: { column: Column; groups: Group[]; labels: boolean; labelRoom: number; lit: string | null }) {
  const navigate = useNavigate();
  const { dots, medians, max } = useMemo(() => {
    const dots = groups.flatMap((g, row) =>
      g.runs.flatMap((run, i) => {
        const v = column.value(run);
        // A little vertical spread by epoch, so runs with the same value don't hide each other
        return v == null ? [] : [{ x: v, y: row + ((i % 5) - 2) * 0.1, run, g }];
      })
    );
    const medians = groups.flatMap((g, row) => {
      const m = median(g.runs.map(column.value));
      return m == null ? [] : [{ x: m, y: row, g }];
    });
    const top = Math.max(0, ...dots.map(d => d.x));
    return { dots, medians, max: column.measure === 'share' ? 1 : roundMax(Math.max(1, top)) };
  }, [column, groups]);
  const ticks = column.measure === 'share' ? [0, 0.5, 1] : roundTicks(max, column.measure, 3);

  return (
    <div className="flex min-w-0 flex-col gap-1">
      <h3 className="text-sm text-muted-foreground" style={{ paddingLeft: labels ? labelRoom : 0 }}>
        {column.title}
      </h3>
      <ChartFrame config={{}} rows={groups.length}>
        <ScatterChart margin={chartMargin()}>
          <CartesianGrid {...gridProps} vertical horizontal={false} />
          <XAxis {...xAxisProps({ dataKey: 'x', domain: [0, max], ticks, format: v => formatTick(v, column.measure) })} />
          <YAxis
            dataKey="y"
            type="number"
            domain={[-0.5, groups.length - 0.5]}
            ticks={groups.map((_, i) => i)}
            reversed
            width={labels ? labelRoom : 0}
            hide={!labels}
            axisLine={false}
            tickLine={false}
            interval={0}
            tick={<GroupTick groups={groups} width={labelRoom} />}
          />
          <ChartTooltip
            cursor={false}
            content={({ active, payload }) => {
              const d = payload?.[0]?.payload as (typeof dots)[number] | undefined;
              if (!active || !d) return null;
              return (
                <ChartTooltipContent
                  active
                  label="title"
                  labelFormatter={() => <SeriesLabel series={d.g.spec} />}
                  payload={[{ dataKey: 'v', name: 'v', value: d.x, payload: {} }] as never}
                  formatter={value => (
                    <div className="flex w-full items-center justify-between gap-4">
                      <span className="text-muted-foreground">{d.run ? `Epoch ${d.run.epoch}` : 'Median'}</span>
                      <span className="font-mono font-medium text-foreground tabular-nums">{formatX(Number(value), column.measure)}</span>
                    </div>
                  )}
                />
              );
            }}
          />
          <Scatter
            data={dots}
            isAnimationActive={false}
            className="cursor-pointer"
            onClick={(d: { payload?: { run?: Run } }) => d.payload?.run && navigate({ to: '/runs/$runId', params: { runId: d.payload.run.id }, search: {} as never })}
          >
            {dots.map(d => (
              <Cell
                key={d.run.id}
                fill={d.g.spec.color}
                fillOpacity={faded(lit, d.g.spec.id) ? FADED_OPACITY : 0.8}
                onMouseEnter={() => setHovered(d.g.spec.id)}
                onMouseLeave={() => setHovered(undefined)}
              />
            ))}
          </Scatter>
          <Scatter data={medians} shape={<MedianMark />} isAnimationActive={false} />
        </ScatterChart>
      </ChartFrame>
    </div>
  );
}

const useGroups = (runs: Run[], by: GroupBy) => useMemo(() => groupRuns(runs, by), [runs, by]);
/** The row labels' gutter: the widest label (mark, short name, harness badge), at least the y axis width. */
const roomFor = (groups: Group[]): number =>
  Math.max(Y_AXIS_WIDTH, ...groups.map(g => labelWidth(g.spec.label) + (g.spec.harness ? g.spec.harness.length * 7 + 26 : 0) + 8));

export function EffortStrips({ runs, by, focus }: { runs: Run[]; by: GroupBy; focus?: string }) {
  const [ref, width] = useWidth();
  const groups = useGroups(runs, by);
  const lit = useLit(focus);
  const wide = width >= 900;
  const labelRoom = roomFor(groups);
  return (
    <div
      ref={ref}
      className={wide ? 'grid gap-6' : 'flex flex-col gap-6'}
      // Wide, the first column also holds the labels, so every column's plot is the same width
      style={wide ? { gridTemplateColumns: `calc(${labelRoom}px + (100% - ${labelRoom}px - 4.5rem) / 4) repeat(3, minmax(0, 1fr))` } : undefined}
    >
      {width > 0 && COLUMNS.map((column, i) => <Strip key={column.title} column={column} groups={groups} labels={!wide || i === 0} labelRoom={labelRoom} lit={lit} />)}
    </div>
  );
}

/** What each group's tool calls were for, as shares of its calls. */
export function ToolMix({ runs, by }: { runs: Run[]; by: GroupBy }) {
  const groups = useGroups(runs, by);
  const labelRoom = roomFor(groups);
  const present = TOOL_CATEGORIES.filter(cat => runs.some(r => (r.metrics.tool_mix[cat.id] ?? 0) > 0));
  const series = present.map(cat => toolSeries(cat.id));
  const rows = useMemo(
    () =>
      groups.map((g, i) => {
        const counts = present.map(cat => g.runs.reduce((sum, r) => sum + (r.metrics.tool_mix[cat.id] ?? 0), 0));
        const total = counts.reduce((a, b) => a + b, 0) || 1;
        return { group: i, total, ...Object.fromEntries(series.map((s, j) => [s.key, counts[j] / total])) };
      }),
    [groups, present, series]
  );
  const config: ChartConfig = Object.fromEntries(series.map(s => [s.key, { label: s.label, color: s.color }]));
  return (
    <div className="flex flex-col">
        <ChartFrame config={config} rows={groups.length} legend={<KeyLegend items={present.map(cat => ({ label: cat.label, color: cat.color }))} />}>
          <BarChart data={rows} layout="vertical" margin={chartMargin()} barCategoryGap={12} maxBarSize={20}>
            <CartesianGrid {...gridProps} vertical horizontal={false} />
            <XAxis {...xAxisProps({ domain: [0, 1], ticks: [0, 0.25, 0.5, 0.75, 1], format: v => `${Math.round(v * 100)}%` })} />
            <YAxis
              type="category"
              dataKey="group"
              width={labelRoom}
              axisLine={false}
              tickLine={false}
              interval={0}
              tick={<GroupTick groups={groups} width={labelRoom} />}
            />
            <ChartTooltip
              cursor={{ fill: 'var(--muted)', opacity: 0.6 }}
              content={({ active, payload, label }) => {
                const g = groups[Number(label)];
                if (!g) return null;
                return (
                  <SeriesTooltip
                    active={active}
                    payload={payload}
                    label={g.spec.name}
                    series={series}
                    sort="none"
                    labelFormat={() => <SeriesLabel series={g.spec} />}
                    format={v => formatX(v, 'share')}
                  />
                );
              }}
            />
            {series.map((s, i) => (
              <Bar key={s.key} dataKey={s.key} stackId="a" fill={s.color} isAnimationActive={false} radius={i === series.length - 1 ? [0, 4, 4, 0] : 0} />
            ))}
          </BarChart>
        </ChartFrame>
    </div>
  );
}
