/**
 * The eval page's first view: where every pairing finished, as one still chart. Game time along x;
 * up y, the eval's measure in even quarters of the most any run reached (on an eval with a target,
 * its stages up to the target). Each pairing is its runs' median line (or their best, or every
 * run) over a light band of all its runs (the lit one's, else the winner's), labelled at the right with its result by the eval's score,
 * the winner first; every run that reached the target is checked where it did.
 */

import { useMemo, type ReactNode } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { Check, Trophy } from 'lucide-react';
import { Area, CartesianGrid, ComposedChart, Line, ReferenceLine, XAxis, YAxis, usePlotArea, useXAxisScale, useYAxisScale } from 'recharts';
import { ChartTooltip, type ChartConfig } from '@/components/ui/chart';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import {
  ChartFrame,
  chartMargin,
  crosshairCursor,
  END_LABEL_WIDTH,
  gridProps,
  KeyLegend,
  lineProps,
  SeriesLabel,
  SeriesTooltip,
  showEndLabels,
  xAxisProps,
  yAxisProps,
} from '@/components/charts';
import type { Eval, Run } from '@/data/types';
import { variantSeries, type SeriesSpec } from '@/lib/chartSeries';
import { formatClock, formatDuration, formatInt } from '@/lib/format';
import { FADED_OPACITY, setHovered } from '@/lib/hover';
import type { LegendState } from '@/lib/legend';
import { layoutEndLabels } from '@/lib/endLabels';
import { median } from '@/lib/stats';
import { useWidth } from '@/lib/useWidth';
import { roundTicks } from './chartBits';
import { faded, useLit } from './lit';
import { reachedAt } from './centerpiece/race';
import { sampleGrid, totalBudgetTicks, valueAt, type Agg, type RankedVariant, type RunCurve } from './model';

const LINE_HEIGHT = 20;
/** Amounts in a few figures: "570K" on the axis, "2.26M" at a line's end */
const figures = (digits: number) => new Intl.NumberFormat('en-US', { notation: 'compact', maximumSignificantDigits: digits }).format;
const axisAmount = figures(2);
const endAmount = figures(3);
/** A median stage between two runs' stages ("9.5 of 10") */
const stage = new Intl.NumberFormat('en-US', { maximumFractionDigits: 1 }).format;

/** One pairing: its line (or its runs' lines), its band, and its result by the eval's score. */
interface Pairing {
  spec: SeriesSpec;
  place: number;
  curves: RunCurve[];
  /** The line's value at each sampled moment; every run's own points when every run is shown */
  lines: { key: string; run?: Run; points: [number, number][] }[];
  band: [number, number, number][];
  /** Where its label sits: the median (or best) result */
  value: number;
  /** Its runs that reached the target, and the median (or best) time they took, in ticks */
  finished: number;
  toFinish: number | null;
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

/** Each pairing's name and result at the right of the plot, level with its result, nudged apart, the winner first. */
function ResultLabels({ pairings, result, winner }: { pairings: Pairing[]; result: (p: Pairing) => ReactNode; winner: string | undefined }) {
  const plot = usePlotArea();
  const y = useYAxisScale();
  if (!plot || !y) return null;
  // Ties at one height keep the ranking's order, top to bottom
  const want = new Map(pairings.map(p => [p.spec.key, Number(y(p.value)) - plot.y + p.place * 0.001]));
  const offsets = layoutEndLabels(
    pairings.map(p => ({ id: p.spec.key, value: plot.height - want.get(p.spec.key)!, priority: -p.place })),
    { min: 0, max: plot.height, height: plot.height, lineHeight: LINE_HEIGHT }
  );
  return (
    <g>
      {pairings.map(p => {
        const dy = offsets.get(p.spec.key);
        if (dy == null) return null;
        const top = plot.y + want.get(p.spec.key)! + dy - LINE_HEIGHT / 2;
        const right = plot.x + plot.width;
        return (
          <foreignObject key={p.spec.key} x={right + 6} y={top} width={LABEL_WIDTH - 8} height={LINE_HEIGHT}>
            <div className="flex h-full items-center gap-1.5 text-xs text-foreground" onMouseEnter={() => setHovered(p.spec.id)} onMouseLeave={() => setHovered(undefined)}>
              <span aria-hidden className="size-2 shrink-0 rounded-[2px]" style={{ backgroundColor: p.spec.color }} />
              <SeriesLabel series={p.spec} size={14} className={p.spec.id === winner ? 'min-w-0 font-medium' : 'min-w-0'} />
              {p.spec.id === winner && <Trophy aria-label="Winner" className="size-3.5 shrink-0 text-muted-foreground" />}
              <span className="ml-auto flex shrink-0 items-center gap-1 pl-2 tabular-nums">{result(p)}</span>
            </div>
          </foreignObject>
        );
      })}
    </g>
  );
}

/** Where each run reached the target: a dot in its pairing's colour with a check. */
function FinishMarks({ marks, lit }: { marks: { key: string; spec: SeriesSpec; tick: number; value: number }[]; lit: string | null }) {
  const x = useXAxisScale();
  const y = useYAxisScale();
  if (!x || !y) return null;
  return (
    <g className="pointer-events-none">
      {marks.map(m => (
        <g key={m.key} transform={`translate(${Number(x(m.tick))} ${Number(y(m.value))})`} opacity={faded(lit, m.spec.id) ? FADED_OPACITY : 1}>
          <circle r={6} fill={m.spec.color} stroke="var(--card)" strokeWidth={1.5} />
          <path d="M-2.75 0.25 L-0.75 2.25 L2.75 -1.75" fill="none" stroke="var(--card)" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" />
        </g>
      ))}
    </g>
  );
}

/** The label column's width: the series label, then its result */
const LABEL_WIDTH = END_LABEL_WIDTH + 112;

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
}) {
  const navigate = useNavigate();
  const [ref, width] = useWidth();
  const labelled = showEndLabels(width);
  const lit = useLit(legend.focus);
  const target = e.target;
  const budget = totalBudgetTicks(e);
  const toSeconds = (tick: number): number => (tick * e.tick_ms) / 1000;
  const lastValue = (cv: RunCurve): number => cv.points[cv.points.length - 1]?.value ?? 0;

  // The top of the axis: the target, or the most any run reached
  const top = useMemo(() => target ?? Math.max(1, ...curves.map(lastValue), ...ranked.map(r => r.bestResult ?? 0)), [curves, ranked, target]);
  const yTicks = target != null ? roundTicks(target).filter(v => v <= target) : [0, 0.25, 0.5, 0.75, 1].map(f => f * top);

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
          : [{ key: spec.key, points: xs.map((x, i) => [x, agg === 'best' ? Math.max(...values[i]) : (median(values[i]) ?? 0)] as [number, number]) }];
      const finishes = group.filter(cv => cv.run.success).map(cv => cv.run.ticks ?? reachedAt(cv, target ?? Infinity));
      return {
        spec: { ...spec, harness: undefined },
        place: ranked.indexOf(r),
        curves: group,
        lines,
        band: agg === 'runs' || group.length < 2 ? [] : xs.map((x, i) => [x, Math.min(...values[i]), Math.max(...values[i])] as [number, number, number]),
        value: Math.min(top, (agg === 'best' ? r.bestResult : r.medianResult) ?? 0),
        finished: r.finished,
        toFinish: finishes.length ? (agg === 'best' ? Math.min(...finishes) : median(finishes)) : null,
      };
    });
  }, [curves, ranked, legend, agg, budget, top, target]);

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
              .map(cv => ({ key: cv.run.id, spec: p.spec, tick: Math.min(budget, reachedAt(cv, target)), value: target }))
              .filter(m => Number.isFinite(m.tick))
          ),
    [pairings, target, budget]
  );

  const config = useMemo<ChartConfig>(() => Object.fromEntries(pairings.map(p => [p.spec.key, { label: p.spec.label, color: p.spec.color }])), [pairings]);

  // Ticks on round game-clock times
  const xTicks = roundTicks(toSeconds(budget), 'seconds').map(s => (s * 1000) / e.tick_ms);
  const first = ranked[0];
  const winner = first && (first.medianResult ?? 0) > 0 && legend.visible(first.variant.key) ? first.variant.key : undefined;
  // A pairing that never left 0 lies on the axis: it keeps its line, not a label
  const moved = pairings.filter(p => p.value > 0 || p.finished > 0);
  const stayed = pairings.filter(p => !moved.includes(p));

  const result = (p: Pairing): ReactNode =>
    p.toFinish != null ? (
      <>
        {agg !== 'best' && p.finished < p.curves.length && <span className="pr-1 text-muted-foreground">{`${formatInt(p.finished)} of ${formatInt(p.curves.length)}`}</span>}
        <Check aria-label="Finished" className="size-3.5 text-success" />
        {formatClock(toSeconds(p.toFinish))}
      </>
    ) : target != null ? (
      <span className="text-muted-foreground">{`${stage(p.value)} of ${formatInt(target)}`}</span>
    ) : (
      endAmount(p.value)
    );

  const lineSeries = pairings.flatMap(p => p.lines.map(l => ({ ...p.spec, key: l.key })));

  return (
    <div ref={ref} className="flex min-w-0 flex-col">
      <ChartFrame
        config={config}
        height="lead"
        loading={width === 0}
        legend={
          labelled ? undefined : (
            <KeyLegend
              legend={legend}
              items={moved.map(p => ({
                id: p.spec.id,
                name: p.spec.name,
                mark: <SeriesLabel series={p.spec} size={14} />,
                label: <span className="flex items-center gap-1 tabular-nums">{result(p)}</span>,
                color: p.spec.swatch,
                line: p.spec.line,
              }))}
            />
          )
        }
      >
        <ComposedChart data={rows} margin={{ ...chartMargin(), right: labelled ? LABEL_WIDTH : 12 }} onMouseLeave={() => setHovered(undefined)}>
          <CartesianGrid {...gridProps} />
          <XAxis {...xAxisProps({ dataKey: 'x', domain: [0, budget], ticks: xTicks, format: v => (v === 0 ? '0' : formatDuration(toSeconds(v))) })} />
          <YAxis {...yAxisProps({ domain: [0, top], ticks: yTicks, clamp: true, format: target != null ? formatInt : axisAmount })} />
          {target != null && <ReferenceLine y={target} stroke="var(--success)" strokeDasharray="3 3" strokeOpacity={0.7} />}
          <ChartTooltip
            cursor={crosshairCursor}
            content={({ active, label }) => {
              const at = Number(label);
              if (!active || !Number.isFinite(at)) return null;
              const payload = pairings
                .flatMap(p => p.lines.map(l => ({ dataKey: l.key, name: l.key, value: stepAt(l.points, at) ?? p.lines[0].points.at(-1)?.[1] ?? 0, color: p.spec.color, payload: {} })))
                .filter(p => p.value > 0);
              if (payload.length === 0) return null;
              return <SeriesTooltip active label={at} payload={payload as never} series={lineSeries} labelFormat={v => formatClock(toSeconds(Number(v)))} format={stage} />;
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
                {...lineProps(p.spec, { faded: faded(lit, p.spec.id), width: lit === p.spec.id || p.spec.id === winner ? 2.25 : 1.5 })}
                dataKey={l.key}
                name={l.key}
                connectNulls
                activeDot={false}
                className="cursor-pointer"
                onMouseEnter={() => setHovered(p.spec.id)}
                onMouseLeave={() => setHovered(undefined)}
                onClick={() => (l.run ? navigate({ to: '/runs/$runId', params: { runId: l.run.id }, search: {} as never }) : legend.isolate(p.spec.id))}
              />
            ))
          )}
          {marks.length > 0 && <FinishMarks marks={marks} lit={lit} />}
          {labelled && <ResultLabels pairings={moved} result={result} winner={winner} />}
        </ComposedChart>
      </ChartFrame>
      {stayed.length > 0 && (
        <Tooltip>
          <TooltipTrigger className="mx-auto cursor-help pt-2 text-xs text-muted-foreground underline decoration-dotted underline-offset-4">
            {`${formatInt(stayed.length)} more stayed at 0`}
          </TooltipTrigger>
          <TooltipContent className="flex max-w-80 flex-wrap gap-x-3 gap-y-1">
            {stayed.map(p => (
              <SeriesLabel key={p.spec.key} series={p.spec} size={14} />
            ))}
          </TooltipContent>
        </Tooltip>
      )}
    </div>
  );
}
