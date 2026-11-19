/** The page's answer: every run's progress over time, coloured by model, beside the variants ranked. */

import { useMemo, useState, type ReactNode } from 'react';
import { Link, useNavigate } from '@tanstack/react-router';
import { CartesianGrid, Line, LineChart, ReferenceLine, XAxis, YAxis } from 'recharts';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Card, CardAction, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ChartContainer, ChartTooltip, type ChartConfig } from '@/components/ui/chart';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ParamSegmented } from '@/components/bits';
import { VariantLabel } from '@/components/marks';
import {
  EndLabels,
  SeriesLegend,
  SeriesTooltip,
  crosshairCursor,
  gridProps,
  lineProps,
  logAxisProps,
  showEndLabels,
  xAxisProps,
  yAxisProps,
} from '@/components/charts';
import type { Eval, Run } from '@/data/types';
import { variantSeries, type SeriesSpec } from '@/lib/chartSeries';
import { formatClock, formatCost, formatInt } from '@/lib/format';
import type { LegendState } from '@/lib/legend';
import { median } from '@/lib/stats';
import { useWidth } from '@/lib/useWidth';
import { formatTick, formatX, roundMax, roundTicks, shortSeries } from './chartBits';
import {
  aggregate,
  hasX,
  resultValue,
  valueAt,
  X_OPTIONS,
  xOf,
  type Agg,
  type RankedVariant,
  type RunCurve,
  type XMeasure,
  type XRange,
} from './model';

/** The y axis width, shared with the chart under it so their x scales line up. */
export const Y_AXIS_WIDTH = 64;
/** Room at the right for line-end labels: a short key, a mark and a short model name. */
const LABEL_ROOM = 136;

export interface ProgressFrame {
  range: XRange;
  ticks: number[] | undefined;
  /** Right margin, matching the progress chart's */
  right: number;
  /** Where the progress chart's crosshair is, to carry it down */
  hover: number | null;
}

interface DrawnLine {
  key: string;
  spec: SeriesSpec;
  run?: Run;
  points: [number, number][];
}

/** One row per x; each line's value where it has a point. */
type Row = { x: number } & Record<string, number>;

const SHAPES: Record<SeriesSpec['symbol'], (cx: number, cy: number) => string> = {
  circle: (x, y) => `M${x - 3.5},${y}a3.5,3.5 0 1,0 7,0a3.5,3.5 0 1,0 -7,0`,
  rect: (x, y) => `M${x - 3},${y - 3}h6v6h-6z`,
  roundRect: (x, y) => `M${x - 3},${y - 3}h6v6h-6z`,
  diamond: (x, y) => `M${x},${y - 4.5}l4.5,4.5l-4.5,4.5l-4.5,-4.5z`,
  triangle: (x, y) => `M${x},${y - 4.5}l4.5,8h-9z`,
  pin: (x, y) => `M${x - 3.5},${y}a3.5,3.5 0 1,0 7,0a3.5,3.5 0 1,0 -7,0`,
};

/** The tooltip: at the crosshair's x, each variant's runs finished by then, or its median or best value. */
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

export function ProgressChart({
  e,
  curves,
  ranked,
  x,
  agg,
  range,
  legend,
  pending,
  below,
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
  /** A chart under this one that shares its x and crosshair */
  below?: (frame: ProgressFrame) => ReactNode;
}) {
  const navigate = useNavigate();
  const [ref, width] = useWidth();
  // Transient: the crosshair's x, for the chart below
  const [hover, setHover] = useState<number | null>(null);
  const labels = showEndLabels(width);
  const target = e.target;
  const specs = useMemo(() => new Map(ranked.map(r => [r.variant.key, variantSeries(r.variant)])), [ranked]);
  const drawn = useMemo(() => curves.filter(cv => legend.visible(cv.variant.key) && hasX(cv, x)), [curves, legend, x]);
  const missing = ranked.filter(r => legend.visible(r.variant.key) && !curves.some(cv => cv.variant.key === r.variant.key && hasX(cv, x)));

  const yMax = useMemo(() => roundMax(Math.max(target ?? 0, ...curves.flatMap(cv => cv.points.map(p => p.value)), 1)), [curves, target]);

  const lines = useMemo<DrawnLine[]>(() => {
    const clampX = (v: number): number => Math.min(range.max, Math.max(range.min, v));
    if (agg === 'runs') {
      return drawn.map(cv => ({
        key: `r${cv.run.id.replace(/[^a-zA-Z0-9]/g, '')}`,
        spec: specs.get(cv.variant.key)!,
        run: cv.run,
        points: cv.points.map(p => [clampX(xOf(p, x)!), p.value] as [number, number]),
      }));
    }
    return ranked.flatMap(r => {
      const mine = drawn.filter(cv => cv.variant.key === r.variant.key);
      if (mine.length === 0) return [];
      const spec = specs.get(r.variant.key)!;
      return [{ key: spec.key, spec, points: aggregate(mine, x, range, agg).map(([a, v]) => [clampX(a), v] as [number, number]) }];
    });
  }, [agg, drawn, range, ranked, specs, x]);

  const { rows, last } = useMemo(() => {
    const byX = new Map<number, Row>();
    for (const line of lines) {
      for (const [px, py] of line.points) {
        const row = byX.get(px) ?? ({ x: px } as Row);
        row[line.key] = py;
        byX.set(px, row);
      }
    }
    const sorted = [...byX.values()].sort((a, b) => a.x - b.x);
    // Where each line ends: its end mark goes there
    const end = new Map(lines.map(l => [l.key, sorted.findLastIndex(r => r[l.key] != null)]));
    return { rows: sorted, last: end };
  }, [lines]);

  const config = useMemo<ChartConfig>(
    () => Object.fromEntries([...specs.values()].map(s => [s.key, { label: s.label, color: s.color }])),
    [specs]
  );

  const ends = ranked
    .filter(r => lines.some(l => l.spec.id === r.variant.key))
    .map((r, i) => ({
      series: shortSeries(specs.get(r.variant.key)!),
      value: Math.max(...lines.filter(l => l.spec.id === r.variant.key).map(l => l.points[l.points.length - 1]?.[1] ?? 0)),
      priority: ranked.length - i,
    }));

  const xTicks = range.log ? undefined : roundTicks(range.max, x);
  const xAxis = range.log
    ? { ...logAxisProps([range.min, range.max], v => formatTick(v, x))!, dataKey: 'x' }
    : xAxisProps({ dataKey: 'x', domain: [range.min, range.max], ticks: xTicks, format: v => formatTick(v, x) });
  const right = labels ? LABEL_ROOM : 12;
  const tooltipRows = ranked
    .filter(r => legend.visible(r.variant.key))
    .map(r => ({ spec: specs.get(r.variant.key)!, curves: drawn.filter(cv => cv.variant.key === r.variant.key) }))
    .filter(r => r.curves.length > 0);

  return (
    <div ref={ref} className="flex min-w-0 flex-col">
      <ChartContainer config={config} className="aspect-auto h-80 w-full">
        <LineChart
          data={rows}
          margin={{ top: 20, right, bottom: 0, left: 0 }}
          onMouseMove={below ? state => setHover(state.activeLabel != null ? Number(state.activeLabel) : null) : undefined}
          onMouseLeave={below ? () => setHover(null) : undefined}
        >
          <CartesianGrid {...gridProps} />
          <XAxis {...xAxis} />
          <YAxis {...yAxisProps({ domain: [0, yMax], ticks: roundTicks(yMax) })} width={Y_AXIS_WIDTH} />
          <ChartTooltip cursor={crosshairCursor} content={<ProgressTooltip rows={tooltipRows} x={x} agg={agg} target={target} />} />
          {target != null && (
            <ReferenceLine
              y={target}
              stroke="var(--muted-foreground)"
              strokeDasharray="4 4"
              label={{ value: 'Target', position: 'insideTopLeft', className: 'fill-muted-foreground text-xs' }}
            />
          )}
          {range.budget != null && (
            <ReferenceLine
              x={range.budget}
              stroke="var(--muted-foreground)"
              strokeDasharray="4 4"
              // Above the plot, ending at the line, so it never runs off the chart or into a line's end
              label={({ viewBox }: { viewBox?: { x?: number; y?: number } }) => (
                <text x={viewBox?.x} y={(viewBox?.y ?? 0) - 6} textAnchor="end" className="fill-muted-foreground text-xs">
                  Budget
                </text>
              )}
            />
          )}
          {lines.map(line => {
            const end = last.get(line.key);
            return (
              <Line
                key={line.key}
                {...lineProps(line.spec)}
                dataKey={line.key}
                name={line.key}
                stroke={line.spec.color}
                strokeOpacity={agg === 'runs' ? 0.85 : 1}
                connectNulls
                activeDot={false}
                className="cursor-pointer"
                onClick={() =>
                  line.run
                    ? navigate({ to: '/runs/$runId', params: { runId: line.run.id }, search: {} as never })
                    : legend.isolate(line.spec.id)
                }
                dot={(props: { index: number; cx?: number; cy?: number }) =>
                  props.index === end && props.cx != null && props.cy != null ? (
                    <path key={props.index} d={SHAPES[line.spec.symbol](props.cx, props.cy)} fill={line.spec.color} />
                  ) : (
                    <g key={props.index} />
                  )
                }
              />
            );
          })}
          {labels && <EndLabels items={ends} line />}
        </LineChart>
      </ChartContainer>
      {below?.({ range, ticks: xTicks, right, hover })}
      <SeriesLegend series={ranked.map(r => specs.get(r.variant.key)!)} legend={legend} />
      {pending ? (
        <p className="pt-2 text-center text-xs text-muted-foreground">Loading model calls.</p>
      ) : (
        missing.length > 0 && (
          <p className="pt-2 text-center text-xs text-muted-foreground">
            {x === 'cost' ? 'No cost to draw' : 'No model calls to draw'}: {missing.map(r => r.variant.name).join(', ')}.
          </p>
        )
      )}
    </div>
  );
}

const TO_FINISH: Record<XMeasure, string> = { ticks: 'Ticks', seconds: 'Time', cost: 'Cost', calls: 'Calls' };

function formatFinish(value: number | null, x: XMeasure): string {
  if (value == null) return '–';
  if (x === 'seconds') return formatClock(value);
  if (x === 'cost') return formatCost(value);
  return formatInt(value);
}

/** One dot per run: filled when it finished; each opens its run. */
function RunDots({ e, runs }: { e: Eval; runs: Run[] }) {
  return (
    <span className="inline-flex justify-end">
      {runs.map(run => (
        <Link
          key={run.id}
          to="/runs/$runId"
          params={{ runId: run.id }}
          search={{} as never}
          title={
            run.success
              ? `Epoch ${run.epoch}: finished in ${formatInt(run.ticks)} ticks`
              : `Epoch ${run.epoch}: ${e.measure.toLowerCase()} ${formatInt(resultValue(run))}`
          }
          className="grid size-3.5 place-items-center rounded-full outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          <span className={cn('size-2.5 rounded-full', run.success ? 'bg-success' : 'border-2 border-destructive')} />
        </Link>
      ))}
    </span>
  );
}

/** Each run's result as a small badge that opens the run, best first. */
function RunValues({ runs }: { runs: Run[] }) {
  const sorted = [...runs].sort((a, b) => (resultValue(b) ?? 0) - (resultValue(a) ?? 0));
  return (
    <span className="inline-flex justify-end gap-1">
      {sorted.map(run => (
        <Badge key={run.id} variant="outline" asChild className="tabular-nums">
          <Link to="/runs/$runId" params={{ runId: run.id }} search={{} as never} title={`Epoch ${run.epoch}`}>
            {formatInt(resultValue(run))}
          </Link>
        </Badge>
      ))}
    </span>
  );
}

const LINE_CLASS = { solid: 'border-solid', dashed: 'border-dashed', dotted: 'border-dotted' } as const;

/** The variants ranked by the headline result; a click hides one, a double click shows only it. */
export function RankedPanel({ e, ranked, x, legend }: { e: Eval; ranked: RankedVariant[]; x: XMeasure; legend: LegendState }) {
  const target = e.target != null;
  return (
    <Table>
      <TableHeader>
        <TableRow className="hover:bg-transparent">
          <TableHead>
            <span className="sr-only">Variant</span>
          </TableHead>
          <TableHead className="text-right">{target ? 'Finished' : 'Runs'}</TableHead>
          {target && (
            <TableHead className="text-right" title="Median over finished runs">
              {TO_FINISH[x]}
              <span className="max-sm:hidden"> to finish</span>
            </TableHead>
          )}
        </TableRow>
      </TableHeader>
      <TableBody>
        {ranked.map(r => {
          const key = r.variant.key;
          const focused = legend.focus === key;
          return (
            <TableRow key={key} data-state={focused ? 'selected' : undefined} className={cn(!legend.visible(key) && 'opacity-40')}>
              <TableCell>
                <button
                  type="button"
                  aria-pressed={legend.visible(key)}
                  title={focused ? 'Click to show every variant' : 'Click to hide; double-click to show only this'}
                  onClick={event => (event.detail >= 2 ? legend.isolate(key) : legend.toggle(key))}
                  className="flex min-w-0 items-center gap-2 rounded-md text-left outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
                >
                  <span
                    aria-hidden
                    className={cn('w-4 shrink-0 border-t-2 max-sm:hidden', r.variant.color.borderClassName, LINE_CLASS[r.variant.line])}
                  />
                  <VariantLabel variant={r.variant} run={r.runs[0]} compact />
                </button>
              </TableCell>
              <TableCell className="text-right">{target ? <RunDots e={e} runs={r.runs} /> : <RunValues runs={r.runs} />}</TableCell>
              {target && <TableCell className="text-right tabular-nums">{formatFinish(r.toFinish, x)}</TableCell>}
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}

/** The progress card: the chart with its cuts, and the ranked variants beside it. */
export function ProgressCard({ e, x, agg, chart }: { e: Eval; x: XMeasure; agg: Agg; chart: ReactNode }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{e.measure}</CardTitle>
        <CardAction className="flex flex-wrap gap-2 max-sm:col-start-1 max-sm:row-start-auto max-sm:justify-self-start">
          <ParamSegmented param="x" value={x} label="Along" options={X_OPTIONS} />
          <ParamSegmented
            param="agg"
            value={agg}
            label="Lines"
            options={[
              { value: 'runs', label: 'Runs' },
              { value: 'median', label: 'Median' },
              { value: 'best', label: 'Best' },
            ]}
          />
        </CardAction>
      </CardHeader>
      <CardContent>{chart}</CardContent>
    </Card>
  );
}
