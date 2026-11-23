/** What each variant spent for its result (a Pareto), how soon runs finished (a success CDF), and attempts. */

import { Tip } from '@/components/bits';
import { useMemo, type ReactNode } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { createColumnHelper, type ColumnDef } from '@tanstack/react-table';
import {
  CartesianGrid,
  ComposedChart,
  Line,
  LineChart,
  Scatter,
  XAxis,
  YAxis,
  usePlotArea,
  useXAxisScale,
  useYAxisScale,
} from 'recharts';
import { cn } from '@/lib/utils';
import { ChartTooltip, ChartTooltipContent, type ChartConfig } from '@/components/ui/chart';
import { DataTable } from '@/components/DataTable';
import { VariantLabel } from '@/components/marks';
import {
  ChartFrame,
  chartMargin,
  SeriesLabel,
  SeriesLegend,
  SeriesTooltip,
  crosshairCursor,
  gridProps,
  lineProps,
  logAxisProps,
  xAxisProps,
  yAxisProps,
} from '@/components/Charts/legacy';
import type { Eval, Run } from '@/data/types';
import { extraLabelWidth, scatterShape, variantSeries, type SeriesSpec } from '@/lib/chartSeries';
import { variantKey } from '@/lib/series';
import { capitalize, formatInt } from '@/lib/format';
import { FADED_OPACITY, setHovered } from '@/lib/hover';
import { faded, useLit } from './lit';
import type { LegendState } from '@/lib/legend';
import { median, paretoFrontier } from '@/lib/stats';
import { formatTick, formatX, labelWidth, placePointLabels, roundMax, roundTicks } from './chartBits';
import type { CdfX, ParetoX, RankedVariant } from './model';
import { useWidth } from '@/lib/useWidth';

/** Charts grow to their card's height when the card beside is taller. */

const spendOf = (run: Run, px: ParetoX): number | null => {
  if (px === 'cost') return run.cost;
  if (px === 'seconds') return run.game_seconds;
  return run.game_ticks;
};

const PX_NAME: Record<ParetoX, string> = {
  cost: 'Median cost per run',
  seconds: 'Median time per run',
  ticks: 'Median ticks per run',
};

interface Point {
  r: RankedVariant;
  spec: SeriesSpec;
  x: number;
  y: number;
  frontier: boolean;
}

/** A tooltip of named values, built from shadcn's ChartTooltipContent, titled by a series. */
export function PointTooltip({
  active,
  payload,
  rows,
}: {
  active?: boolean;
  payload?: { payload?: unknown }[];
  rows: (datum: unknown) => { title: ReactNode; values: [string, string][] } | null;
}) {
  const content = active && payload?.length ? rows(payload[0].payload) : null;
  if (!content) return null;
  return (
    <ChartTooltipContent
      active
      label="title"
      labelFormatter={() => content.title}
      payload={content.values.map(([name, value]) => ({ dataKey: name, name, value, payload: {} })) as never}
      formatter={(value, name) => (
        <div className="flex w-full items-center justify-between gap-4">
          <span className="text-muted-foreground">{name}</span>
          <span className="font-mono font-medium text-foreground tabular-nums">{value as string}</span>
        </div>
      )}
    />
  );
}

/** Labels beside scatter points, placed so they clear each other, the points and the plot's edges. */
function PointLabels({ points }: { points: Point[] }) {
  const plot = usePlotArea();
  const x = useXAxisScale();
  const y = useYAxisScale();
  if (!plot || !x || !y) return null;
  const width = (p: Point) => labelWidth(p.spec.label) + extraLabelWidth(p.spec);
  // The frontier's labels first; any other point's only where it fits
  const placed = points.map(p => ({
    p,
    px: Number(x(p.x)),
    py: Number(y(p.y)),
    width: width(p),
    optional: !p.frontier,
  }));
  // Labels may run into the chart's margins, not past its edges
  const positions = placePointLabels(placed, { x: 0, y: plot.y, width: plot.x + plot.width + 16, height: plot.height });
  return (
    <g className="pointer-events-none">
      {placed.map((q, i) => {
        const at = positions[i];
        if (!at) return null;
        const [pos, [left, top]] = at;
        return (
          <foreignObject
            key={q.p.spec.key}
            x={pos.endsWith('left') ? left - 8 : left}
            y={top}
            width={q.width + 8}
            height={20}
          >
            <div
              className={cn(
                'flex h-full items-center text-xs',
                q.p.frontier ? 'text-foreground' : 'text-muted-foreground',
                pos.endsWith('left') && 'justify-end'
              )}
            >
              <SeriesLabel series={q.p.spec} size={14} />
            </div>
          </foreignObject>
        );
      })}
    </g>
  );
}

/** Each variant's median spend per run against its finish rate (or median result), with the frontier under the points. */
export function ParetoChart({
  e,
  ranked,
  px,
  legend,
}: {
  e: Eval;
  ranked: RankedVariant[];
  px: ParetoX;
  legend: LegendState;
}) {
  const lit = useLit(legend.focus);
  const target = e.target != null;
  const log = px === 'cost';

  const { points, left } = useMemo(() => {
    const all = ranked.map(r => ({
      r,
      spec: variantSeries(r.variant),
      x: median(r.runs.map(run => spendOf(run, px))),
      y: target ? r.finished / r.runs.length : (r.medianResult ?? 0),
      frontier: false,
    }));
    const drawable = all.filter((p): p is Point => p.x != null && (!log || p.x > 0));
    const frontier = new Set(
      paretoFrontier(
        drawable,
        p => p.x,
        p => p.y
      )
    );
    return {
      points: drawable.map(p => ({ ...p, frontier: frontier.has(p) })),
      left: all.filter(p => !drawable.includes(p as Point)),
    };
  }, [log, px, ranked, target]);

  const yMax = target ? 1 : roundMax(Math.max(1, ...points.map(p => p.y)));
  const xMax = log ? 0 : roundMax(Math.max(1, ...points.map(p => p.x)), px === 'seconds' ? 'seconds' : 'count');
  const xAxis = log
    ? logAxisProps(
        points.map(p => p.x),
        v => formatTick(v, 'cost')
      )
    : xAxisProps({
        domain: [0, xMax],
        ticks: roundTicks(xMax, px === 'seconds' ? 'seconds' : 'count'),
        format: v => formatTick(v, px),
      });
  const config = useMemo<ChartConfig>(
    () => Object.fromEntries(points.map(p => [p.spec.key, { label: p.spec.label, color: p.spec.color }])),
    [points]
  );
  const frontier = points.filter(p => p.frontier).sort((a, b) => a.x - b.x);
  const [ref, width] = useWidth();
  const narrow = width > 0 && width < 640;

  return (
    <div ref={ref} className="flex flex-1 flex-col">
      <ChartFrame
        config={config}
        height="lead"
        empty={
          points.length && xAxis ? undefined : `No pairing here has a ${px === 'cost' ? 'cost' : 'value'} to place.`
        }
        // Wide, the points' labels are the key; narrow, a legend is, and the points go unlabelled
        legend={
          narrow ? <SeriesLegend series={ranked.map(r => variantSeries(r.variant))} legend={legend} /> : undefined
        }
      >
        <ComposedChart margin={chartMargin()}>
          <CartesianGrid {...gridProps} />
          <XAxis {...xAxis!} dataKey="x" type="number" />
          <YAxis
            {...yAxisProps({
              domain: [0, yMax],
              ticks: target ? [0, 0.25, 0.5, 0.75, 1] : roundTicks(yMax),
              format: target ? v => `${Math.round(v * 100)}%` : formatInt,
            })}
            dataKey="y"
          />
          <ChartTooltip
            cursor={false}
            content={
              <PointTooltip
                rows={d => {
                  const p = points.find(q => q === d || (q.x === (d as Point)?.x && q.y === (d as Point)?.y));
                  if (!p) return null;
                  return {
                    title: <SeriesLabel series={p.spec} />,
                    values: [
                      [PX_NAME[px], formatX(p.x, px)],
                      target
                        ? ['Finished', `${p.r.finished} of ${p.r.runs.length}`]
                        : [`Median ${e.measure.toLowerCase()}`, formatInt(p.y)],
                    ],
                  };
                }}
              />
            }
          />
          <Line
            data={frontier}
            dataKey="y"
            type="linear"
            stroke="var(--muted-foreground)"
            strokeOpacity={0.6}
            strokeWidth={1.25}
            strokeDasharray="3 4"
            dot={false}
            activeDot={false}
            isAnimationActive={false}
            legendType="none"
          />
          {points.map(p => (
            <Scatter
              key={p.spec.key}
              data={[p]}
              dataKey="y"
              fill={p.spec.color}
              fillOpacity={legend.visible(p.spec.id) && !faded(lit, p.spec.id) ? 1 : FADED_OPACITY}
              onMouseEnter={() => setHovered(p.spec.id)}
              onMouseLeave={() => setHovered(undefined)}
              shape={scatterShape(p.spec.symbol)}
              isAnimationActive={false}
              className="cursor-pointer"
              onClick={() => legend.isolate(p.spec.id)}
            />
          ))}
          {/* The frontier always, every other point where its label fits; any point names itself on hover */}
          {!narrow && <PointLabels points={points} />}
        </ComposedChart>
      </ChartFrame>
      {left.length > 0 && points.length > 0 && (
        <p className="text-xs text-muted-foreground">
          {px === 'cost' ? 'No cost for' : 'Nothing to place for'} {left.map(p => p.r.variant.name).join(', ')}.
        </p>
      )}
    </div>
  );
}

const finishOf = (run: Run, cx: CdfX): number | null =>
  cx === 'ticks' ? run.ticks : cx === 'seconds' ? run.seconds : run.cost;

/** Share of each variant's runs finished within a budget of ticks, time or cost. Unfinished runs never count. */
export function CdfChart({
  e,
  ranked,
  cx,
  legend,
}: {
  e: Eval;
  ranked: RankedVariant[];
  cx: CdfX;
  legend: LegendState;
}) {
  const lit = useLit(legend.focus);
  const navigate = useNavigate();
  const specs = useMemo(() => ranked.map(r => ({ r, spec: variantSeries(r.variant) })), [ranked]);
  const shown = specs.filter(s => legend.visible(s.spec.id));

  const chart = useMemo(() => {
    const costs = shown.flatMap(s => s.r.runs.map(run => run.cost));
    const costAxis = cx === 'cost' ? logAxisProps(costs, v => formatTick(v, 'cost')) : null;
    let lo = 0;
    let hi: number;
    if (cx === 'ticks') hi = e.budget_ticks;
    else if (cx === 'seconds') hi = (e.budget_ticks * e.tick_ms) / 1000;
    else if (costAxis) [lo, hi] = costAxis.domain as [number, number];
    else return null;
    const lines = shown.map(({ r, spec }) => {
      const eligible = r.runs.filter(run => cx !== 'cost' || run.cost != null);
      const finished = eligible
        .filter(run => run.success)
        .map(run => ({ run, x: Math.min(hi, Math.max(lo, finishOf(run, cx) ?? lo)) }))
        .sort((a, b) => a.x - b.x);
      return { spec, n: eligible.length, finished };
    });
    const xs = [...new Set([lo, hi, ...lines.flatMap(l => l.finished.map(f => f.x))])].sort((a, b) => a - b);
    const rows = xs.map(x => {
      const row: Record<string, number | string> = { x };
      for (const l of lines) {
        const k = l.finished.filter(f => f.x <= x).length;
        row[l.spec.key] = l.n ? k / l.n : 0;
        const here = l.finished.filter(f => f.x === x);
        if (here.length) row[`${l.spec.key}_run`] = here[here.length - 1].run.id;
      }
      return row;
    });
    const xAxis = costAxis
      ? { ...costAxis, dataKey: 'x' }
      : xAxisProps({ dataKey: 'x', domain: [lo, hi], ticks: roundTicks(hi, cx), format: v => formatTick(v, cx) });
    return { lines, rows, xAxis };
  }, [cx, e.budget_ticks, e.tick_ms, shown]);

  return (
    <div className="flex flex-1 flex-col">
      <ChartFrame
        config={Object.fromEntries(specs.map(s => [s.spec.key, { label: s.spec.label, color: s.spec.color }]))}
        height="lead"
        empty={chart ? undefined : 'No run here has a cost.'}
      >
        <LineChart data={chart?.rows} margin={chartMargin()}>
          <CartesianGrid {...gridProps} />
          {chart && <XAxis {...chart.xAxis} />}
          <YAxis
            {...yAxisProps({ domain: [0, 1], ticks: [0, 0.25, 0.5, 0.75, 1], format: v => `${Math.round(v * 100)}%` })}
          />
          <ChartTooltip
            cursor={crosshairCursor}
            content={
              <SeriesTooltip
                series={chart?.lines.map(l => l.spec) ?? []}
                format={v => formatX(v, 'share')}
                labelFormat={v => formatX(Number(v), cx)}
              />
            }
          />
          {chart?.lines.map(l => (
            <Line
              key={l.spec.key}
              {...lineProps(l.spec, { faded: faded(lit, l.spec.id) })}
              stroke={l.spec.color}
              onMouseEnter={() => setHovered(l.spec.id)}
              onMouseLeave={() => setHovered(undefined)}
              dot={(props: { index: number; cx?: number; cy?: number; payload?: Record<string, unknown> }) => {
                const runId = props.payload?.[`${l.spec.key}_run`] as string | undefined;
                if (!runId || props.cx == null || props.cy == null) return <g key={props.index} />;
                return (
                  <circle
                    key={props.index}
                    cx={props.cx}
                    cy={props.cy}
                    r={3}
                    fill={l.spec.color}
                    className="cursor-pointer"
                    onClick={() => navigate({ to: '/runs/$runId', params: { runId }, search: {} as never })}
                  />
                );
              }}
            />
          ))}
        </LineChart>
      </ChartFrame>
    </div>
  );
}

interface AttemptRow {
  run: Run;
}

const col = createColumnHelper<AttemptRow>();

/** For evals with several attempts: each run's attempts, finished in so many ticks or reaching some value. */
export function AttemptsTable({ e, ranked, legend }: { e: Eval; ranked: RankedVariant[]; legend: LegendState }) {
  const navigate = useNavigate();
  const rows = ranked.filter(r => legend.visible(r.variant.key)).flatMap(r => r.runs.map(run => ({ run })));
  const columns = useMemo(() => {
    const reached = capitalize(e.measure.replace(/^Quest /, ''));
    return [
      col.display({
        id: 'variant',
        header: 'Pairing',
        cell: ({ row }) => <VariantLabel run={row.original.run} compact />,
      }),
      col.accessor(r => r.run.epoch, { id: 'epoch', header: 'Epoch', meta: { numeric: true } }),
      ...Array.from({ length: e.attempts }, (_, i) =>
        col.display({
          id: `a${i + 1}`,
          header: String(i + 1),
          meta: { numeric: true },
          cell: ({ row }) => {
            const result = row.original.run.attempt_results?.find(a => a.attempt === i + 1);
            if (!result) return null;
            if (result.ticks != null) {
              return (
                <Tip content={`Finished attempt ${i + 1} in ${formatInt(result.ticks)} ticks`}>
                  <span className="inline-flex items-center gap-1.5">
                    <span aria-hidden className="size-2 rounded-full bg-success" />
                    {formatInt(result.ticks)}
                  </span>
                </Tip>
              );
            }
            return (
              <Tip content={`Not finished: ${e.measure.toLowerCase()} ${formatInt(result.best_value)}`}>
                <span className="inline-flex items-center gap-1.5 text-muted-foreground">
                  <span aria-hidden className="size-2 rounded-full border-2 border-destructive" />
                  {reached} {formatInt(result.best_value)}
                </span>
              </Tip>
            );
          },
        })
      ),
    ] as ColumnDef<AttemptRow, unknown>[];
  }, [e.attempts, e.measure]);

  return (
    <>
      <DataTable
        data={rows}
        columns={columns}
        getRowId={r => r.run.id}
        onRowClick={r => navigate({ to: '/runs/$runId', params: { runId: r.run.id }, search: {} as never })}
        hoverId={r => variantKey(r.run)}
      />
    </>
  );
}
