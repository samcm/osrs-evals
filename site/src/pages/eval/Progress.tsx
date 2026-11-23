/**
 * The eval's measure over time: every run's progress (or each pairing's median or best), coloured by
 * model, dashed by harness, keyed by one compact legend. The focused pairing stands out and the rest
 * fade; the playhead is marked where it is.
 */

import { useMemo } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { CartesianGrid, Line, LineChart, XAxis, YAxis } from 'recharts';
import { ChartTooltip, type ChartConfig } from '@/components/ui/chart';
import {
  ChartFrame,
  chartMargin,
  SeriesTooltip,
  Y_AXIS_WIDTH,
  crosshairCursor,
  gridProps,
  lineProps,
  logAxisProps,
  xAxisProps,
  yAxisProps,
} from '@/components/Charts';
import type { Eval, Run } from '@/data/types';
import { variantSeries, type SeriesSpec } from '@/lib/chartSeries';
import { formatInt } from '@/lib/format';
import { setHovered } from '@/lib/hover';
import { faded, useLit } from './lit';
import type { LegendState } from '@/lib/legend';
import { median } from '@/lib/stats';
import { useWidth } from '@/lib/useWidth';
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

const MARGIN = chartMargin();
const RIGHT = MARGIN.right;
const TOP = MARGIN.top;
/** The lead height (h-80) and Recharts' default x axis height, to keep the playhead off the labels */
const CHART_HEIGHT = 320;
const X_AXIS_HEIGHT = 30;

interface DrawnLine {
  key: string;
  spec: SeriesSpec;
  run?: Run;
  points: [number, number][];
}

/** One row per x; each line's value where it has a point. */
type Row = { x: number } & Record<string, number>;

/** The tooltip: at the crosshair's x, each pairing's runs finished by then, or its median or best value. */
function ProgressTooltip({
  active,
  label,
  rows,
  x,
  agg,
  target,
}: {
  active?: boolean;
  label?: number | string;
  rows: { spec: SeriesSpec; curves: RunCurve[] }[];
  x: XMeasure;
  agg: Agg;
  target: number | null;
}) {
  const at = Number(label);
  if (!active || !Number.isFinite(at)) return null;
  const counts = new Map<string, number>();
  const payload = rows.map(({ spec, curves }) => {
    const values = curves.map(cv => valueAt(cv, x, at)).filter((v): v is number => v != null);
    counts.set(spec.key, curves.length);
    const value =
      agg === 'runs' && target != null
        ? values.filter(v => v >= target).length
        : agg === 'best'
          ? Math.max(...values)
          : (median(values) ?? 0);
    return { dataKey: spec.key, name: spec.key, value, color: spec.color, payload: {} };
  });
  return (
    <SeriesTooltip
      active
      label={at}
      payload={payload as never}
      series={rows.map(r => r.spec)}
      labelFormat={v => formatX(Number(v), x)}
      format={(v, s) => (agg === 'runs' && target != null ? `${v} of ${counts.get(s.key)} finished` : formatInt(v))}
    />
  );
}

/**
 * The playhead over the chart: its own component, so a moving playhead
 * redraws one line, not the chart. Only on game ticks, the one x every run shares.
 */
function PlayheadMark({ t, range, width }: { t: number | undefined; range: XRange; width: number }) {
  const tick = usePlayheadMark(t);
  if (tick == null || width === 0) return null;
  const plot = width - Y_AXIS_WIDTH - RIGHT;
  const f = (Math.min(range.max, Math.max(range.min, tick)) - range.min) / (range.max - range.min);
  const left = Y_AXIS_WIDTH + f * plot;
  // Over the plot, leaving the x axis' labels clear
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute w-px bg-primary"
      style={{ left, top: TOP, height: CHART_HEIGHT - X_AXIS_HEIGHT - TOP }}
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
}) {
  const navigate = useNavigate();
  const [ref, width] = useWidth();
  const target = e.target;
  const specs = useMemo(() => new Map(ranked.map(r => [r.variant.key, variantSeries(r.variant)])), [ranked]);
  // A focused pairing keeps the others on the chart, faded, so it reads against them
  const shown = (key: string): boolean => !legend.hidden.includes(key) || legend.focus === key;
  const drawn = useMemo(() => curves.filter(cv => shown(cv.variant.key) && hasX(cv, x)), [curves, legend, x]);
  const missing = ranked.filter(
    r => legend.visible(r.variant.key) && !curves.some(cv => cv.variant.key === r.variant.key && hasX(cv, x))
  );
  const lit = useLit(legend.focus);

  // The axis tops out at the target when no run passes it
  const yMax = useMemo(() => {
    const top = Math.max(1, ...curves.flatMap(cv => cv.points.map(p => p.value)));
    return target != null && top <= target ? target : roundMax(Math.max(target ?? 0, top));
  }, [curves, target]);

  // One line per run shown: every run, or each pairing's median or best run (picked by the page)
  const lines = useMemo<DrawnLine[]>(() => {
    const clampX = (v: number): number => Math.min(range.max, Math.max(range.min, v));
    return drawn.map(cv => ({
      key: `r${cv.run.id.replace(/[^a-zA-Z0-9]/g, '')}`,
      spec: specs.get(cv.variant.key)!,
      run: cv.run,
      points: cv.points.map(p => [clampX(xOf(p, x)!), p.value] as [number, number]),
    }));
  }, [drawn, range, specs, x]);

  // The field's median on the same x values as the lines, so they share the crosshair
  const fieldLine = useMemo(() => (field?.length ? aggregate(field, x, range, 'median') : []), [field, x, range]);

  const rows = useMemo(() => {
    const byX = new Map<number, Row>();
    for (const [px, py] of fieldLine) byX.set(px, { x: px, field: py } as Row);
    for (const line of lines) {
      for (const [px, py] of line.points) {
        const row = byX.get(px) ?? ({ x: px } as Row);
        row[line.key] = py;
        byX.set(px, row);
      }
    }
    return [...byX.values()].sort((a, b) => a.x - b.x);
  }, [lines, fieldLine]);

  const config = useMemo<ChartConfig>(
    () => Object.fromEntries([...specs.values()].map(s => [s.key, { label: s.label, color: s.color }])),
    [specs]
  );

  const yTicks = target != null && yMax === target ? roundTicks(target).filter(v => v <= target) : roundTicks(yMax);
  if (yTicks[yTicks.length - 1] !== yMax) yTicks.push(yMax);
  const xTicks = range.log ? undefined : roundTicks(range.max, x);
  const xAxis = range.log
    ? { ...logAxisProps([range.min, range.max], v => formatTick(v, x))!, dataKey: 'x' }
    : xAxisProps({ dataKey: 'x', domain: [range.min, range.max], ticks: xTicks, format: v => formatTick(v, x) });
  const tooltipRows = ranked
    .filter(r => legend.visible(r.variant.key))
    .map(r => ({ spec: specs.get(r.variant.key)!, curves: drawn.filter(cv => cv.variant.key === r.variant.key) }))
    .filter(r => r.curves.length > 0);
  // Lit lines draw last, over the faded ones
  const ordered = lit ? [...lines.filter(l => l.spec.id !== lit), ...lines.filter(l => l.spec.id === lit)] : lines;

  return (
    <div className="flex min-w-0 flex-col">
      <div ref={ref} className="relative">
        <ChartFrame config={config} height="lead" loading={pending}>
          <LineChart data={rows} margin={MARGIN} onMouseLeave={() => setHovered(undefined)}>
            <CartesianGrid {...gridProps} />
            <XAxis {...xAxis} />
            <YAxis {...yAxisProps({ domain: [0, yMax], ticks: yTicks })} />
            <ChartTooltip
              cursor={crosshairCursor}
              content={<ProgressTooltip rows={tooltipRows} x={x} agg={agg} target={target} />}
            />
            {fieldLine.length > 0 && (
              <Line
                dataKey="field"
                name="Every model's median"
                type="stepAfter"
                stroke="var(--muted-foreground)"
                strokeOpacity={0.6}
                strokeWidth={1.5}
                dot={false}
                activeDot={false}
                connectNulls
                isAnimationActive={false}
                legendType="none"
              />
            )}
            {ordered.map(line => {
              return (
                <Line
                  key={line.key}
                  {...lineProps(line.spec, {
                    faded: faded(lit, line.spec.id),
                    width: lit === line.spec.id ? 2.25 : 1.75,
                  })}
                  dataKey={line.key}
                  name={line.key}
                  stroke={line.spec.color}
                  connectNulls
                  activeDot={false}
                  className="cursor-pointer"
                  onMouseEnter={() => setHovered(line.spec.id)}
                  onMouseLeave={() => setHovered(undefined)}
                  onClick={() =>
                    line.run && navigate({ to: '/runs/$runId', params: { runId: line.run.id }, search: {} as never })
                  }
                />
              );
            })}
          </LineChart>
        </ChartFrame>
        {x === 'ticks' && <PlayheadMark t={t} range={range} width={width} />}
      </div>
      {!pending && missing.length > 0 && (
        <p className="pt-2 text-center text-xs text-muted-foreground">
          {x === 'cost' ? 'No cost for' : 'No model calls for'} {missing.map(r => r.variant.name).join(', ')}.
        </p>
      )}
    </div>
  );
}
