/**
 * How a measure changes with thinking level, for one model on one eval: the thinking levels along x,
 * lowest first, each run a point (its harness's shape, its level's lightness of the model's colour)
 * and each harness a series with a line through its median at each level. A point opens its run.
 */

import { useMemo } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { CartesianGrid, Cell, ComposedChart, Line, Scatter, XAxis, YAxis } from 'recharts';
import { ChartTooltip, type ChartConfig } from '@/components/ui/chart';
import { ChartFrame, chartMargin, gridProps, logAxisProps, SeriesLabel, SeriesLegend, xAxisProps, Y_AXIS_WIDTH, yAxisProps } from '@/components/charts';
import type { Eval, Run } from '@/data/types';
import { agentSeries, cssColor, dashArray, scatterShape, type SeriesSpec } from '@/lib/chartSeries';
import { formatCost, formatInt } from '@/lib/format';
import { FADED_OPACITY, setHovered, useHover } from '@/lib/hover';
import { resultValue } from '@/lib/runResult';
import { levelColor, levelName, modelInfo, thinkingOf } from '@/lib/series';
import { useWidth } from '@/lib/useWidth';
import { median } from '@/lib/stats';
import { formatTick, roundMax, roundTicks } from '../eval/chartBits';
import { PointTooltip } from '../eval/Cuts';

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

/** One eval's measures: its result, ticks to finish, and cost per run. */
export function evalMeasure(e: Eval, y: 'result' | 'ticks' | 'cost'): ThinkingMeasure {
  if (y === 'cost') return costMeasure;
  if (y === 'ticks')
    return { label: 'Ticks to finish', value: r => (r.success ? r.ticks : null), format: v => `${formatInt(v)} ticks`, ticks: true, empty: 'No run here finished.' };
  return { label: e.measure, value: resultValue, format: formatInt, max: e.target ?? undefined, empty: 'No run here has a result.' };
}

export const costMeasure: ThinkingMeasure = {
  label: 'Cost',
  value: r => (r.cost != null && r.cost > 0 ? r.cost : null),
  format: formatCost,
  log: true,
  empty: 'No run here has a cost.',
};

/** Short names for the level labels when the full ones don't fit; the tooltip names the level in full. */
const SHORT: Record<string, string> = { none: 'none', between_tools: 'btw tools', minimal: 'min', medium: 'med', xhigh: 'xhi' };
/** text-xs at about 6.6px a character, plus a gap between neighbours */
const labelPx = (text: string): number => text.length * 6.6 + 8;

/**
 * How the level labels fit the width each level has: in full, shortened, or shortened and slanted
 * when even the short names would run into each other.
 */
function levelLabels(levels: string[], width: number): { names: string[]; slant: boolean } {
  const each = (width - Y_AXIS_WIDTH - chartMargin().right) / Math.max(1, levels.length);
  const fits = (names: string[]) => Math.max(...names.map(labelPx)) <= each;
  const names = levels.map(levelName);
  if (fits(names)) return { names, slant: false };
  const short = levels.map(l => SHORT[l] ?? l);
  return { names: short, slant: !fits(short) };
}


interface Point {
  x: number;
  y: number;
  run: Run;
  spec: SeriesSpec;
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

export function ThinkingChart({
  runs,
  measure,
  levels,
  series,
  evalOf,
}: {
  /** Runs with a recorded thinking level */
  runs: Run[];
  measure: ThinkingMeasure;
  levels: string[];
  series: SeriesSpec[];
  /** Name each point's eval in its tooltip, for a chart across evals */
  evalOf?: (run: Run) => string;
}) {
  const navigate = useNavigate();
  const hover = useHover();
  const [ref, width] = useWidth();
  const labels = levelLabels(levels, width);
  const { points, medians } = useMemo(() => {
    const points: Point[] = [];
    const medians = new Map<string, { x: number; y: number }[]>();
    series.forEach((spec, h) => {
      // Harnesses side by side at each level, so their points don't hide each other
      const offset = (h - (series.length - 1) / 2) * 0.12;
      const own = runs.filter(r => r.agent === spec.id);
      const line: { x: number; y: number }[] = [];
      levels.forEach((level, i) => {
        const values = own.filter(r => thinkingOf(r) === level).flatMap(run => {
          const v = measure.value(run);
          if (v == null) return [];
          points.push({ x: i + offset, y: v, run, spec });
          return [v];
        });
        const m = median(values);
        if (m != null) line.push({ x: i + offset, y: m });
      });
      medians.set(spec.id, line);
    });
    return { points, medians };
  }, [runs, measure, levels, series]);

  const config = useMemo<ChartConfig>(() => Object.fromEntries(series.map(s => [s.key, { label: s.label, color: s.color }])), [series]);
  const max = measure.max ?? roundMax(Math.max(1, ...points.map(p => p.y)), measure.ticks ? 'ticks' : 'count');
  const yAxis = measure.log
    ? { ...logAxisProps(points.map(p => p.y)), width: Y_AXIS_WIDTH }
    : yAxisProps({ domain: [0, max], ticks: roundTicks(max, measure.ticks ? 'ticks' : 'count'), format: v => (measure.ticks ? formatTick(v, 'ticks') : formatInt(v)) });
  const empty = runs.length === 0 ? 'No run here has a recorded thinking level.' : points.length === 0 ? measure.empty : undefined;

  return (
    <div ref={ref} className="min-w-0">
    <ChartFrame config={config} height="compact" empty={empty} legend={<SeriesLegend series={series} kind="symbol" />}>
      <ComposedChart margin={chartMargin()}>
        <CartesianGrid {...gridProps} />
        <XAxis
          {...xAxisProps({ domain: [-0.5, levels.length - 0.5], ticks: levels.map((_, i) => i), format: i => labels.names[i] ?? '' })}
          dataKey="x"
          type="number"
          // Every level named, however many: they are the chart's categories, shortened and then
          // slanted when the width each one has can't hold its name
          interval={0}
          {...(labels.slant ? { angle: -40, textAnchor: 'end', height: 44 } : {})}
        />
        <YAxis {...yAxis} dataKey="y" />
        <ChartTooltip
          cursor={false}
          content={
            <PointTooltip
              rows={d => {
                const p = d as Point;
                if (!p?.run) return null;
                return {
                  title: <SeriesLabel series={{ ...p.spec, thinking: thinkingOf(p.run) ?? undefined }} />,
                  values: [
                    ...(evalOf ? [['Eval', evalOf(p.run)] as [string, string]] : []),
                    ['Epoch', formatInt(p.run.epoch)],
                    [measure.label, measure.format(p.y)],
                  ],
                };
              }}
            />
          }
        />
        {series.map(s => (
          <Line
            key={`${s.key}-median`}
            data={medians.get(s.id)}
            dataKey="y"
            type="linear"
            stroke={s.color}
            strokeWidth={1.5}
            strokeDasharray={dashArray(s.line)}
            strokeOpacity={hover.faded(s.id) ? FADED_OPACITY : 0.8}
            dot={false}
            activeDot={false}
            isAnimationActive={false}
            legendType="none"
          />
        ))}
        {series.map(s => (
          <Scatter
            key={s.key}
            data={points.filter(p => p.spec.id === s.id)}
            dataKey="y"
            fill={s.color}
            fillOpacity={hover.faded(s.id) ? FADED_OPACITY : 1}
            shape={scatterShape(s.symbol)}
            isAnimationActive={false}
            className="cursor-pointer"
            onMouseEnter={() => setHovered(s.id)}
            onMouseLeave={() => setHovered(undefined)}
            onClick={(p: unknown) => {
              const run = (p as { payload?: Point })?.payload?.run;
              if (run) navigate({ to: '/runs/$runId', params: { runId: run.id }, search: {} as never });
            }}
          >
            {points
              .filter(p => p.spec.id === s.id)
              .map(p => (
                <Cell key={p.run.id} fill={cssColor(levelColor(modelInfo(p.run.model).color, thinkingOf(p.run)))} />
              ))}
          </Scatter>
        ))}
      </ComposedChart>
    </ChartFrame>
    </div>
  );
}
