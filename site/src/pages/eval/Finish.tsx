/**
 * The eval page's first view: who won and whether anyone finished, as a still chart and the eval's
 * ranked table beside it. Game time along x; up y, the eval's measure in even quarters of the most
 * any run reached (on an eval with a target, its stages up to the target). Each pairing is its runs'
 * median line (or their best, or every run), with the band of its runs for the lit pairing, else
 * the winner; every run that reached the target is checked where it did. The table ranks every
 * pairing by the eval's score, its swatch keying its line; a row lights its line, a click isolates it.
 */

import { useMemo, type JSX } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { createColumnHelper, type ColumnDef } from '@tanstack/react-table';
import { TrophyIcon } from '@heroicons/react/16/solid';
import clsx from 'clsx';
import {
  Area,
  CartesianGrid,
  ComposedChart,
  Line,
  ReferenceLine,
  XAxis,
  YAxis,
  useXAxisScale,
  useYAxisScale,
} from 'recharts';
import { ChartTooltip, type ChartConfig } from '@/components/ui/chart';
import {
  ChartFrame,
  chartMargin,
  crosshairCursor,
  gridProps,
  lineProps,
  SeriesTooltip,
  xAxisProps,
  yAxisProps,
} from '@/components/Charts/legacy';
import { DataTable } from '@/components/DataTable';
import { Card } from '@/components/Layout/Card';
import { ScrollArea } from '@/components/Layout/ScrollArea';
import { PageSection } from '@/components/page';
import { VariantLabel } from '@/components/marks';
import type { Eval, Run } from '@/data/types';
import { variantSeries, type SeriesSpec } from '@/lib/chartSeries';
import { formatClock, formatDuration, formatInt } from '@/lib/format';
import { FADED_OPACITY, setHovered } from '@/lib/hover';
import type { LegendState } from '@/lib/legend';
import { median } from '@/lib/stats';
import { roundTicks } from '@/pages/eval/chartBits';
import { faded, useLit } from '@/pages/eval/lit';
import { reachedAt } from '@/pages/eval/centerpiece/race';
import { sampleGrid, totalBudgetTicks, valueAt, type Agg, type RankedVariant, type RunCurve } from '@/pages/eval/model';

/** Axis amounts in two figures: "570K", "1.1M" */
const axisAmount = new Intl.NumberFormat('en-US', { notation: 'compact', maximumSignificantDigits: 2 }).format;
/** A median between two runs can fall on a half ("9.5 of 10", "17.5"); large amounts are whole */
const oneDecimal = new Intl.NumberFormat('en-US', { maximumFractionDigits: 1 }).format;
const amount = (v: number): string => (Math.abs(v) >= 1000 ? formatInt(v) : oneDecimal(v));

/** One pairing on the chart: its line (or its runs' lines) and its band. */
interface Pairing {
  spec: SeriesSpec;
  curves: RunCurve[];
  /** The line's value at each sampled moment; every run's own points when every run is shown */
  lines: { key: string; run?: Run; points: [number, number][] }[];
  band: [number, number, number][];
}

/** A step line's value at x: its last point at or before it. */
function stepAt(points: [number, number][], x: number): number | null {
  let value: number | null = null;
  for (const [px, py] of points) {
    if (px > x) break;
    value = py;
  }
  return value;
}

/** Where each run reached the target: a dot in its pairing's colour with a check. */
function FinishMarks({
  marks,
  lit,
}: {
  marks: { key: string; spec: SeriesSpec; tick: number; value: number }[];
  lit: string | null;
}) {
  const x = useXAxisScale();
  const y = useYAxisScale();
  if (!x || !y) return null;
  return (
    <g className="pointer-events-none">
      {marks.map(m => (
        <g
          key={m.key}
          transform={`translate(${Number(x(m.tick))} ${Number(y(m.value))})`}
          opacity={faded(lit, m.spec.id) ? FADED_OPACITY : 1}
        >
          <circle r={6} fill={m.spec.color} stroke="var(--card)" strokeWidth={1.5} />
          <path
            d="M-2.75 0.25 L-0.75 2.25 L2.75 -1.75"
            fill="none"
            stroke="var(--card)"
            strokeWidth={1.75}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </g>
      ))}
    </g>
  );
}

export function FinishChart({
  e,
  curves,
  ranked,
  agg,
  legend,
}: {
  e: Eval;
  /** Every run in scope */
  curves: RunCurve[];
  /** The pairings in the eval's order */
  ranked: RankedVariant[];
  agg: Agg;
  legend: LegendState;
}): JSX.Element {
  const navigate = useNavigate();
  const lit = useLit(legend.focus);
  const target = e.target;
  const budget = totalBudgetTicks(e);
  const toSeconds = (tick: number): number => (tick * e.tick_ms) / 1000;
  const lastValue = (cv: RunCurve): number => cv.points[cv.points.length - 1]?.value ?? 0;

  // The top of the axis: the target, or the most any run reached
  const top = useMemo(
    () => target ?? Math.max(1, ...curves.map(lastValue), ...ranked.map(r => r.bestResult ?? 0)),
    [curves, ranked, target]
  );
  const yTicks =
    target != null ? roundTicks(target).filter(v => v <= target) : [0, 0.25, 0.5, 0.75, 1].map(f => f * top);

  const pairings = useMemo<Pairing[]>(() => {
    const grid = sampleGrid({ min: 0, max: budget, log: false, budget }, 320);
    // A focused pairing keeps the others, faded, so it reads against them
    const shown = ranked.filter(r => !legend.hidden.includes(r.variant.key) || legend.focus === r.variant.key);
    return shown.map(r => {
      const group = curves.filter(cv => cv.variant.key === r.variant.key);
      const spec = variantSeries(r.variant);
      const end = Math.min(budget, Math.max(0, ...group.map(cv => cv.points[cv.points.length - 1].tick)));
      const xs = [...grid.filter(v => v < end), end];
      const values = xs.map(at => group.map(cv => Math.min(top, valueAt(cv, 'ticks', at) ?? 0)));
      const lines =
        agg === 'runs'
          ? group.map(cv => ({
              key: `r${cv.run.id.replace(/[^a-zA-Z0-9]/g, '')}`,
              run: cv.run,
              points: cv.points.map(p => [Math.min(budget, p.tick), Math.min(top, p.value)] as [number, number]),
            }))
          : [
              {
                key: spec.key,
                points: xs.map(
                  (x, i) => [x, agg === 'best' ? Math.max(...values[i]) : (median(values[i]) ?? 0)] as [number, number]
                ),
              },
            ];
      return {
        spec,
        curves: group,
        lines,
        band:
          agg === 'runs' || group.length < 2
            ? []
            : xs.map((x, i) => [x, Math.min(...values[i]), Math.max(...values[i])] as [number, number, number]),
      };
    });
  }, [curves, ranked, legend, agg, budget, top]);

  const rows = useMemo(() => {
    const byX = new Map<number, Record<string, unknown>>();
    const row = (x: number) => byX.get(x) ?? (byX.set(x, { x }), byX.get(x)!);
    for (const p of pairings) {
      for (const [x, lo, hi] of p.band) row(x)[`b${p.spec.key}`] = [lo, hi];
      for (const line of p.lines) for (const [x, y] of line.points) row(x)[line.key] = y;
    }
    return [...byX.values()].sort((a, b) => (a.x as number) - (b.x as number));
  }, [pairings]);

  // Every run that reached the target, where it did
  const marks = useMemo(
    () =>
      target == null
        ? []
        : pairings.flatMap(p =>
            p.curves
              .filter(cv => cv.run.success)
              .map(cv => ({
                key: cv.run.id,
                spec: p.spec,
                tick: Math.min(budget, reachedAt(cv, target)),
                value: target,
              }))
              .filter(m => Number.isFinite(m.tick))
          ),
    [pairings, target, budget]
  );

  const config = useMemo<ChartConfig>(
    () => Object.fromEntries(pairings.map(p => [p.spec.key, { label: p.spec.label, color: p.spec.color }])),
    [pairings]
  );

  // Ticks on round game-clock times
  const xTicks = roundTicks(toSeconds(budget), 'seconds').map(s => (s * 1000) / e.tick_ms);
  const first = ranked[0];
  const winner = first && (first.medianResult ?? 0) > 0 ? first.variant.key : undefined;
  const lineSeries = pairings.flatMap(p => p.lines.map(l => ({ ...p.spec, key: l.key })));

  // The table: every pairing in the eval's order, its result by the eval's score (median, or best)
  const standings = useMemo<Standing[]>(
    () =>
      ranked.map((r, i) => {
        const finishes = r.runs.filter(run => run.success && run.ticks != null).map(run => run.ticks!);
        return {
          r,
          place: i + 1,
          value: Math.min(top, (agg === 'best' ? r.bestResult : r.medianResult) ?? 0),
          toFinish: finishes.length ? (agg === 'best' ? Math.min(...finishes) : median(finishes)) : null,
        };
      }),
    [ranked, agg, top]
  );
  const columns = useMemo(() => tableColumns(e, winner), [e, winner]);

  return (
    <div className="grid gap-gutter xl:grid-cols-12">
      <PageSection
        className="xl:col-span-7"
        title={e.measure}
        description={
          target != null
            ? `${formatInt(ranked.reduce((n, r) => n + r.finished, 0))} of ${formatInt(ranked.reduce((n, r) => n + r.runs.length, 0))} runs finished`
            : undefined
        }
      >
        <ChartFrame config={config} height="lead">
          <ComposedChart data={rows} margin={chartMargin()} onMouseLeave={() => setHovered(undefined)}>
            <CartesianGrid {...gridProps} />
            <XAxis
              {...xAxisProps({
                dataKey: 'x',
                domain: [0, budget],
                ticks: xTicks,
                format: v => (v === 0 ? '0' : formatDuration(toSeconds(v))),
              })}
            />
            <YAxis
              {...yAxisProps({
                domain: [0, top],
                ticks: yTicks,
                clamp: true,
                format: target != null ? formatInt : axisAmount,
              })}
            />
            {target != null && (
              <ReferenceLine y={target} stroke="var(--success)" strokeDasharray="3 3" strokeOpacity={0.7} />
            )}
            <ChartTooltip
              cursor={crosshairCursor}
              content={({ active, label }) => {
                const at = Number(label);
                if (!active || !Number.isFinite(at)) return null;
                const payload = pairings
                  .flatMap(p =>
                    p.lines.map(l => ({
                      dataKey: l.key,
                      name: l.key,
                      value: stepAt(l.points, at) ?? 0,
                      color: p.spec.color,
                      payload: {},
                    }))
                  )
                  .filter(p => p.value > 0);
                if (payload.length === 0) return null;
                return (
                  <SeriesTooltip
                    active
                    label={at}
                    payload={payload as never}
                    series={lineSeries}
                    labelFormat={v => formatClock(toSeconds(Number(v)))}
                    format={amount}
                  />
                );
              }}
            />
            {pairings
              .filter(p => p.band.length)
              .map(p => (
                <Area
                  key={`b${p.spec.key}`}
                  dataKey={`b${p.spec.key}`}
                  type="stepAfter"
                  fill={p.spec.color}
                  // One band at a time, or thirty overlap into a grey wash: the lit pairing's, else the winner's
                  fillOpacity={(lit ?? winner) === p.spec.id ? 0.15 : 0}
                  stroke="none"
                  connectNulls
                  activeDot={false}
                  isAnimationActive={false}
                  legendType="none"
                />
              ))}
            {/* The leaders draw last, over the rest */}
            {[...pairings].reverse().flatMap(p =>
              p.lines.map(l => (
                <Line
                  key={l.key}
                  {...lineProps(p.spec, {
                    faded: faded(lit, p.spec.id),
                    width: lit === p.spec.id || p.spec.id === winner ? 2.25 : 1.5,
                  })}
                  dataKey={l.key}
                  name={l.key}
                  connectNulls
                  activeDot={false}
                  className="cursor-pointer"
                  onMouseEnter={() => setHovered(p.spec.id)}
                  onMouseLeave={() => setHovered(undefined)}
                  onClick={() =>
                    l.run
                      ? navigate({ to: '/runs/$runId', params: { runId: l.run.id }, search: {} as never })
                      : legend.isolate(p.spec.id)
                  }
                />
              ))
            )}
            {marks.length > 0 && <FinishMarks marks={marks} lit={lit} />}
          </ComposedChart>
        </ChartFrame>
      </PageSection>
      {/* Beside the chart, as tall as it, its rows scrolling inside; under it on a narrower screen. The card's
          one grid row holds its body to the chart's height, and the scroll area covers the body */}
      <Card className="min-w-0 xl:col-span-5 xl:grid xl:h-0 xl:min-h-full xl:grid-rows-1">
        {/* Radix positions the scroll area itself, so a wrapper covers the body */}
        <div className="mx-card-bleed-inner my-card-bleed-inner xl:absolute xl:inset-px xl:m-0">
          <ScrollArea className="xl:h-full">
            {/* The table bleeds to the card's edges by the inset; this gives it back inside the scroll area */}
            <div className="px-card-inset py-4 sm:py-5">
              <DataTable
                data={standings}
                columns={columns}
                getRowId={s => s.r.variant.key}
                hoverId={s => s.r.variant.key}
                onRowClick={s => legend.isolate(s.r.variant.key)}
              />
            </div>
          </ScrollArea>
        </div>
      </Card>
    </div>
  );
}

interface Standing {
  r: RankedVariant;
  place: number;
  value: number;
  toFinish: number | null;
}

const col = createColumnHelper<Standing>();

/** Place, pairing (its swatch keys its line), and its result; on an eval with a target, how many of its runs finished. */
function tableColumns(e: Eval, winner: string | undefined): ColumnDef<Standing, unknown>[] {
  const target = e.target;
  const toSeconds = (tick: number): number => (tick * e.tick_ms) / 1000;
  const still = (s: Standing): boolean => s.value <= 0 && s.r.finished === 0;
  return [
    col.accessor('place', {
      header: '#',
      enableSorting: false,
      meta: { className: 'w-px' },
      cell: ({ row }) =>
        row.original.r.variant.key === winner ? (
          <TrophyIcon aria-label="Winner" className="size-4 text-foreground" />
        ) : (
          <span className="text-muted">{row.original.place}</span>
        ),
    }),
    col.accessor(s => s.r.variant.name, {
      id: 'pairing',
      header: 'Pairing',
      enableSorting: false,
      cell: ({ row }) => (
        <VariantLabel
          variant={row.original.r.variant}
          run={row.original.r.runs[0]}
          compact
          swatch
          className={clsx('max-md:max-w-52', still(row.original) && 'text-muted')}
        />
      ),
    }),
    ...(target != null
      ? [
          col.accessor(s => s.r.finished, {
            id: 'finished',
            header: 'Finished',
            enableSorting: false,
            // A phone keeps the result beside the name
            meta: { numeric: true, minWidth: 380 },
            cell: ({ row }) => (
              <span
                className={clsx(row.original.r.finished === 0 && 'text-muted')}
              >{`${formatInt(row.original.r.finished)} of ${formatInt(row.original.r.runs.length)}`}</span>
            ),
          }),
        ]
      : []),
    col.accessor('value', {
      id: 'result',
      header: target != null ? 'Result' : e.measure,
      enableSorting: false,
      meta: { numeric: true },
      // A finish is its time in game time; else the stage it reached ("Stage 6": beside "0 of 2" finished, "6 of 10" read as runs)
      cell: ({ row }) => {
        const s = row.original;
        if (s.toFinish != null) return formatClock(toSeconds(s.toFinish));
        const text = target != null ? `Stage ${oneDecimal(s.value)}` : amount(s.value);
        return <span className={clsx((target != null || still(s)) && 'text-muted')}>{text}</span>;
      },
    }),
  ] as ColumnDef<Standing, unknown>[];
}
