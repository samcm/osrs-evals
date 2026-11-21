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
import { levelColor, modelInfo, thinkingOf } from '@/lib/series';
import { median } from '@/lib/stats';
import { formatTick, roundMax, roundTicks } from '../eval/chartBits';
import { PointTooltip } from '../eval/Cuts';

export type ThinkingY = 'result' | 'ticks' | 'cost';

/** A run's value on the chart's measure; null when it has none (no finish, no price). */
function yOf(run: Run, y: ThinkingY): number | null {
  if (y === 'cost') return run.cost != null && run.cost > 0 ? run.cost : null;
  if (y === 'ticks') return run.success ? run.ticks : null;
  return resultValue(run);
}

const format = (v: number, y: ThinkingY): string => (y === 'cost' ? formatCost(v) : y === 'ticks' ? `${formatInt(v)} ticks` : formatInt(v));

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

export function ThinkingChart({ e, runs, y, levels, series }: { e: Eval; runs: Run[]; y: ThinkingY; levels: string[]; series: SeriesSpec[] }) {
  const navigate = useNavigate();
  const hover = useHover();
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
          const v = yOf(run, y);
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
  }, [runs, y, levels, series]);

  const config = useMemo<ChartConfig>(() => Object.fromEntries(series.map(s => [s.key, { label: s.label, color: s.color }])), [series]);
  const max = y === 'result' && e.target != null ? e.target : roundMax(Math.max(1, ...points.map(p => p.y)), y === 'ticks' ? 'ticks' : 'count');
  const yAxis =
    y === 'cost'
      ? { ...logAxisProps(points.map(p => p.y)), width: Y_AXIS_WIDTH }
      : yAxisProps({ domain: [0, max], ticks: roundTicks(max, y === 'ticks' ? 'ticks' : 'count'), format: v => (y === 'ticks' ? formatTick(v, 'ticks') : formatInt(v)) });
  const empty = points.length === 0 ? (y === 'ticks' ? 'No run here finished.' : y === 'cost' ? 'No run here has a cost.' : 'No run here has a result.') : undefined;

  return (
    <ChartFrame config={config} height="compact" empty={empty} legend={<SeriesLegend series={series} kind="symbol" />}>
      <ComposedChart margin={chartMargin()}>
        <CartesianGrid {...gridProps} />
        <XAxis
          {...xAxisProps({ domain: [-0.5, levels.length - 0.5], ticks: levels.map((_, i) => i), format: i => levels[i] ?? '' })}
          dataKey="x"
          type="number"
          // Every level named, however many: they are the chart's categories, slanted when they crowd
          interval={0}
          {...(levels.length > 4 ? { angle: -35, textAnchor: 'end', height: 52 } : {})}
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
                  title: <SeriesLabel series={{ ...p.spec, thinking: thinkingOf(p.run) }} />,
                  values: [
                    ['Epoch', formatInt(p.run.epoch)],
                    [y === 'result' ? e.measure : y === 'ticks' ? 'Ticks to finish' : 'Cost', format(p.y, y)],
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
  );
}
