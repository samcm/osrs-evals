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
import { CheckIcon, TrophyIcon } from '@heroicons/react/16/solid';
import clsx from 'clsx';
import {
  ChartFrame,
  XYChart,
  type ChartBand,
  type ChartLine,
  type Plot,
  type TooltipContent,
} from '@/components/Charts';
import { DataTable } from '@/components/DataTable';
import { Card } from '@/components/Layout/Card';
import { ScrollArea } from '@/components/Layout/ScrollArea';
import { PageSection } from '@/components/page';
import { VariantLabel } from '@/components/marks';
import type { Eval, Run } from '@/data/types';
import { variantSeries, type SeriesSpec } from '@/lib/chartSeries';
import { formatClock, formatDuration, formatInt } from '@/lib/format';
import { FADED_OPACITY } from '@/lib/hover';
import type { LegendState } from '@/lib/legend';
import { median } from '@/lib/stats';
import { roundTicks } from '@/pages/eval/chartBits';
import { faded, useLit } from '@/pages/eval/lit';
import { reachedAt } from '@/pages/eval/centerpiece/race';
import {
  medianRun,
  sampleGrid,
  totalBudgetTicks,
  valueAt,
  type Agg,
  type RankedVariant,
  type RunCurve,
} from '@/pages/eval/model';

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

/** Where each run reached the target: a dot in its pairing's colour with a check, over the plot. */
function FinishMarks({
  marks,
  lit,
  plot,
}: {
  marks: { key: string; spec: SeriesSpec; tick: number; value: number }[];
  lit: string | null;
  plot: Plot;
}): JSX.Element {
  return (
    <>
      {marks.map(m => (
        <span
          key={m.key}
          aria-hidden
          className={clsx(
            'pointer-events-none absolute flex size-3 -translate-1/2 items-center justify-center rounded-full ring-2 ring-surface transition-opacity',
            m.spec.swatch.swatchClassName
          )}
          style={{ left: plot.x(m.tick), top: plot.y(m.value), opacity: faded(lit, m.spec.id) ? FADED_OPACITY : 1 }}
        >
          <CheckIcon className="size-2.5 text-surface" />
        </span>
      ))}
    </>
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

  // Ticks on round game-clock times
  const xTicks = roundTicks(toSeconds(budget), 'seconds').map(s => (s * 1000) / e.tick_ms);
  const first = ranked[0];
  const winner = first && (first.medianResult ?? 0) > 0 ? first.variant.key : undefined;

  // The leaders draw last, over the rest; a line opens its run, a pairing's line its median run
  const lines: ChartLine[] = [...pairings]
    .reverse()
    .flatMap(p =>
      p.lines.map(l => ({ key: l.key, series: p.spec, points: l.points, width: p.spec.id === winner ? 2 : undefined }))
    );
  const runOf = new Map(pairings.flatMap(p => p.lines.flatMap(l => (l.run ? [[l.key, l.run] as const] : []))));
  // One band at a time, or thirty overlap into a grey wash: the lit pairing's, else the winner's
  const banded = pairings.find(p => p.spec.id === (lit ?? winner) && p.band.length);
  const bands: ChartBand[] = banded ? [{ series: banded.spec, points: banded.band }] : [];
  // At the crosshair, every line above zero, highest first
  const tooltip = (at: number): TooltipContent | null => {
    const rows = pairings
      .flatMap(p => p.lines.map(l => ({ series: p.spec, value: stepAt(l.points, at) ?? 0 })))
      .filter(r => r.value > 0)
      .sort((a, b) => b.value - a.value);
    return rows.length
      ? { title: formatClock(toSeconds(at)), rows: rows.map(r => ({ ...r, value: amount(r.value) })) }
      : null;
  };

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
        <ChartFrame height="lead">
          <XYChart
            x={{
              domain: [0, budget],
              ticks: xTicks,
              format: v => (v === 0 ? '0' : formatDuration(toSeconds(v))),
              formatValue: v => formatClock(toSeconds(v)),
            }}
            y={{ domain: [0, top], ticks: yTicks, format: target != null ? formatInt : axisAmount }}
            lines={lines}
            bands={bands}
            rules={target != null ? [{ y: target, tone: 'success' }] : []}
            lit={lit}
            axisTooltip={tooltip}
            onLineClick={line => {
              const run = runOf.get(line.key!);
              const pick = run ?? medianRun(ranked.find(r => r.variant.key === line.series?.id) ?? { runs: [] });
              if (pick) void navigate({ to: '/runs/$runId', params: { runId: pick.id }, search: {} as never });
            }}
            overlay={plot => marks.length > 0 && <FinishMarks marks={marks} lit={lit} plot={plot} />}
          />
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
                onRowClick={s => {
                  const run = medianRun(s.r);
                  if (run) void navigate({ to: '/runs/$runId', params: { runId: run.id }, search: {} as never });
                }}
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
