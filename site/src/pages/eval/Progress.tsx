/**
 * The eval's measure over time: every run's progress (or each pairing's median or best), coloured by
 * model, dashed by harness, keyed by one compact legend. The focused pairing stands out and the rest
 * fade; the playhead is marked where it is.
 */

import { useMemo, type JSX } from 'react';
import { useNavigate } from '@tanstack/react-router';
import {
  ChartFrame,
  XYChart,
  logAxis,
  type AxisSpec,
  type ChartLine,
  type Plot,
  type TooltipContent,
} from '@/components/Charts';
import type { Eval } from '@/data/types';
import { variantSeries, type SeriesSpec } from '@/lib/chartSeries';
import { formatInt } from '@/lib/format';
import { useLit } from './lit';
import type { LegendState } from '@/lib/legend';
import { median } from '@/lib/stats';
import { formatTick, formatX, roundMax, roundTicks } from './chartBits';
import {
  aggregate,
  hasX,
  valueAt,
  xOf,
  type Agg,
  type RankedVariant,
  type RunCurve,
  type XMeasure,
  type XRange,
} from './model';
import { usePlayheadMark } from './playhead';

/**
 * The playhead over the chart: its own component, so a moving playhead redraws one line, not the
 * chart. Only on game ticks, the one x every run shares.
 */
function PlayheadMark({ t, range, plot }: { t: number | undefined; range: XRange; plot: Plot }): JSX.Element | null {
  const tick = usePlayheadMark(t);
  if (tick == null) return null;
  const left = plot.x(Math.min(range.max, Math.max(range.min, tick)));
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute w-px bg-primary"
      style={{ left, top: plot.top, height: plot.height }}
    />
  );
}

export function ProgressChart({
  e,
  curves,
  ranked,
  x,
  agg,
  range,
  legend,
  pending,
  t,
  field,
}: {
  e: Eval;
  curves: RunCurve[];
  ranked: RankedVariant[];
  x: XMeasure;
  agg: Agg;
  range: XRange;
  legend: LegendState;
  /** The x measure's data is still loading */
  pending: boolean;
  /** The playhead's settled tick (`?t=`) */
  t?: number;
  /** Every model's runs on the eval: their median drawn under the lines in grey, so a few runs read against the field */
  field?: RunCurve[];
}): JSX.Element {
  const navigate = useNavigate();
  const target = e.target;
  const specs = useMemo(() => new Map(ranked.map(r => [r.variant.key, variantSeries(r.variant)])), [ranked]);
  // A focused pairing keeps the others on the chart, faded, so it reads against them
  const drawn = curves.filter(
    cv => (!legend.hidden.includes(cv.variant.key) || legend.focus === cv.variant.key) && hasX(cv, x)
  );
  const missing = ranked.filter(
    r => legend.visible(r.variant.key) && !curves.some(cv => cv.variant.key === r.variant.key && hasX(cv, x))
  );
  const lit = useLit(legend.focus);

  // The axis tops out at the target when no run passes it
  const top = Math.max(1, ...curves.flatMap(cv => cv.points.map(p => p.value)));
  const yMax = target != null && top <= target ? target : roundMax(Math.max(target ?? 0, top));
  const yTicks = target != null && yMax === target ? roundTicks(target).filter(v => v <= target) : roundTicks(yMax);
  if (yTicks[yTicks.length - 1] !== yMax) yTicks.push(yMax);

  // One line per run shown: every run, or each pairing's median or best run (picked by the page)
  const clampX = (v: number): number => Math.min(range.max, Math.max(range.min, v));
  const lines: ChartLine[] = drawn.map(cv => ({
    key: cv.run.id,
    series: specs.get(cv.variant.key)!,
    points: cv.points.map(p => [clampX(xOf(p, x)!), p.value]),
  }));
  // Every model's median, under the lines in grey, so a few runs read against the field
  const fieldLine = useMemo(() => (field?.length ? aggregate(field, x, range, 'median') : []), [field, x, range]);
  if (fieldLine.length) lines.unshift({ key: 'field', label: "Every model's median", points: fieldLine });

  const xAxis: AxisSpec = range.log
    ? logAxis([range.min, range.max], v => formatTick(v, x))!
    : { domain: [range.min, range.max], ticks: roundTicks(range.max, x), format: v => formatTick(v, x) };

  // At the crosshair's x, each pairing's runs finished by then, or its median or best value
  const tooltipRows = ranked
    .filter(r => legend.visible(r.variant.key))
    .map(r => ({ spec: specs.get(r.variant.key)!, curves: drawn.filter(cv => cv.variant.key === r.variant.key) }))
    .filter(r => r.curves.length > 0);
  const tooltip = (at: number): TooltipContent => ({
    title: formatX(at, x),
    rows: tooltipRows
      .map(({ spec, curves: runs }) => {
        const values = runs.map(cv => valueAt(cv, x, at)).filter((v): v is number => v != null);
        const value =
          agg === 'runs' && target != null
            ? values.filter(v => v >= target).length
            : agg === 'best'
              ? Math.max(...values)
              : (median(values) ?? 0);
        return { spec, value, runs: runs.length };
      })
      .sort((a, b) => b.value - a.value)
      .map(({ spec, value, runs }: { spec: SeriesSpec; value: number; runs: number }) => ({
        series: spec,
        value: agg === 'runs' && target != null ? `${value} of ${runs} finished` : formatInt(value),
      })),
  });

  return (
    <div className="flex min-w-0 flex-col">
      <ChartFrame height="lead" loading={pending}>
        <XYChart
          x={xAxis}
          y={{ domain: [0, yMax], ticks: yTicks }}
          lines={lines}
          lit={lit}
          axisTooltip={tooltip}
          onLineClick={line => navigate({ to: '/runs/$runId', params: { runId: line.key! }, search: {} as never })}
          overlay={plot => x === 'ticks' && <PlayheadMark t={t} range={range} plot={plot} />}
        />
      </ChartFrame>
      {!pending && missing.length > 0 && (
        <p className="pt-2 text-center text-xs text-muted">
          {x === 'cost' ? 'No cost for' : 'No model calls for'} {missing.map(r => r.variant.name).join(', ')}.
        </p>
      )}
    </div>
  );
}
