/**
 * The eval page's first view: who won, and whether anyone did. One card, the eval's one ranked list
 * beside a step chart of every run.
 *
 * With a target (Dragon Slayer), a line per pairing climbs as its runs finish: the share of its runs
 * finished by each moment of game time (or each dollar spent). Without one, a line per pairing falls
 * as its runs drop out: the share of its runs that reached at least each result, as a share of the
 * eval's best run. Either way the line furthest up and to the left (target) or right (no target)
 * wins. Each run is a dot that opens it. A pairing that never finished (or never scored) draws no
 * line; it stays in the list, muted, with how far it got.
 */

import { useMemo } from 'react';
import { Link, useNavigate } from '@tanstack/react-router';
import { TrophyIcon } from 'lucide-react';
import { CartesianGrid, Line, LineChart, XAxis, YAxis } from 'recharts';
import { ChartTooltip, type ChartConfig } from '@/components/ui/chart';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ChartFrame, SeriesTooltip, chartMargin, crosshairCursor, gridProps, lineProps, logAxisProps, xAxisProps, yAxisProps } from '@/components/charts';
import { VariantLabel } from '@/components/marks';
import { ParamSegmented } from '@/components/bits';
import { PageSection } from '@/components/page';
import type { Eval, Run } from '@/data/types';
import { variantSeries, type SeriesSpec } from '@/lib/chartSeries';
import { evalSlug } from '@/lib/evals';
import { formatAxisNumber, formatClock, formatCost, formatInt } from '@/lib/format';
import { hoverProps, setHovered } from '@/lib/hover';
import type { LegendState } from '@/lib/legend';
import { modelSlug } from '@/lib/series';
import { median } from '@/lib/stats';
import { cn } from '@/lib/utils';
import { formatTick, roundTicks } from './chartBits';
import { faded, useLit } from './lit';
import { resultValue, type RankedVariant } from './model';

export type FinishX = 'ticks' | 'cost';
export type FinishScale = 'linear' | 'log';

const X_OPTIONS = [
  { value: 'ticks' as const, label: 'Game time' },
  { value: 'cost' as const, label: 'Cost' },
];
const SCALE_OPTIONS = [
  { value: 'linear' as const, label: 'Linear' },
  { value: 'log' as const, label: 'Log' },
];

/** A share as a percentage: whole above 1%, one significant digit below (a log axis reaches 0.01%). */
const percent = (v: number): string => (v >= 0.01 || v === 0 ? `${Math.round(v * 100)}%` : `${Number((v * 100).toPrecision(1))}%`);

interface Drawn {
  spec: SeriesSpec;
  /** Each run's place on x, in order */
  runs: { run: Run; x: number }[];
  /** Runs the share counts over */
  n: number;
  /** Past here the line stops (no target: its best run) */
  end: number;
}

type Row = { x: number } & Record<string, number | string | null>;

export function FinishCurves({ e, ranked, x, scale, legend }: { e: Eval; ranked: RankedVariant[]; x: FinishX; scale: FinishScale; legend: LegendState }) {
  const target = e.target != null;
  const navigate = useNavigate();
  const lit = useLit(legend.focus);
  const specs = useMemo(() => new Map(ranked.map(r => [r.variant.key, variantSeries(r.variant)])), [ranked]);
  // The scale every result is read against: the eval's best run
  const best = useMemo(() => Math.max(0, ...ranked.flatMap(r => r.runs.map(run => resultValue(run) ?? 0))), [ranked]);

  const chart = useMemo(() => {
    const shown = ranked.filter(r => legend.visible(r.variant.key) || legend.focus === r.variant.key);
    let lines: Drawn[];
    let lo: number;
    let hi: number;
    let axis: ReturnType<typeof xAxisProps> | NonNullable<ReturnType<typeof logAxisProps>>;
    if (target) {
      // Game time to finish, or what the run cost; a run that never finished never counts
      const place = (run: Run): number | null => (x === 'cost' ? run.cost : run.ticks != null ? (run.ticks * e.tick_ms) / 1000 : null);
      const costAxis = x === 'cost' ? logAxisProps(shown.flatMap(r => r.runs.filter(run => run.success).map(run => run.cost ?? 0)), v => formatTick(v, 'cost')) : null;
      if (x === 'cost' && !costAxis) return null;
      [lo, hi] = costAxis ? (costAxis.domain as [number, number]) : [0, (e.budget_ticks * e.tick_ms) / 1000];
      axis = costAxis ?? xAxisProps({ domain: [lo, hi], ticks: roundTicks(hi, 'seconds'), format: v => formatTick(v, 'seconds') });
      lines = shown
        .filter(r => r.finished > 0)
        .map(r => ({
          spec: specs.get(r.variant.key)!,
          runs: r.runs
            .filter(run => run.success && place(run) != null)
            .map(run => ({ run, x: Math.min(hi, Math.max(lo, place(run)!)) }))
            .sort((a, b) => a.x - b.x),
          n: r.runs.filter(run => x !== 'cost' || run.cost != null).length,
          end: hi,
        }));
    } else {
      if (!(best > 0)) return null;
      const share = (run: Run): number => (resultValue(run) ?? 0) / best;
      const logAxis = scale === 'log' ? logAxisProps(shown.flatMap(r => r.runs.map(share)), percent) : null;
      [lo, hi] = logAxis ? [(logAxis.domain as [number, number])[0], 1] : [0, 1];
      axis = logAxis ? { ...logAxis, domain: [lo, hi], ticks: logAxis.ticks.filter(t => t <= 1) } : xAxisProps({ domain: [0, 1], ticks: [0, 0.25, 0.5, 0.75, 1], format: percent });
      lines = shown
        .map(r => {
          const runs = r.runs.map(run => ({ run, x: share(run) })).sort((a, b) => a.x - b.x);
          return { spec: specs.get(r.variant.key)!, runs, n: r.runs.length, end: runs[runs.length - 1]?.x ?? 0 };
        })
        .filter(l => l.end > 0 && l.end >= lo);
    }
    const xs = [...new Set([lo, hi, ...lines.flatMap(l => l.runs.map(p => p.x))])].filter(v => v >= lo && v <= hi).sort((a, b) => a - b);
    const rows = xs.map(at => {
      const row: Row = { x: at };
      for (const l of lines) {
        // Finished by then; or reached at least this much, until the line's best run
        const k = target ? l.runs.filter(p => p.x <= at).length : at > l.end ? null : l.runs.filter(p => p.x >= at).length;
        row[l.spec.key] = k == null ? null : l.n ? k / l.n : 0;
        const here = l.runs.filter(p => p.x === at);
        if (here.length) row[`${l.spec.key}_run`] = here[here.length - 1].run.id;
      }
      return row;
    });
    return { lines, rows, axis: { ...axis, dataKey: 'x' } };
  }, [best, e, legend, ranked, scale, specs, target, x]);

  const config = useMemo<ChartConfig>(() => Object.fromEntries([...specs.values()].map(s => [s.key, { label: s.label, color: s.color }])), [specs]);
  // Drawn last to first, so the leader sits on top; a lit line over everything
  const ordered = chart ? [...chart.lines].reverse().sort((a, b) => Number(a.spec.id === lit) - Number(b.spec.id === lit)) : [];
  const leader = chart?.lines[0]?.spec.id;
  const finishedRuns = ranked.reduce((n, r) => n + r.finished, 0);
  const runs = ranked.reduce((n, r) => n + r.runs.length, 0);

  return (
    <PageSection
      title={target ? 'Runs finished' : e.measure}
      // Without a target, what 100% stands for; with one, how many finished at all
      description={target ? `${formatInt(finishedRuns)} of ${formatInt(runs)}` : `100% is the best run, ${formatInt(best)}`}
      actions={
        target ? <ParamSegmented param="x" value={x} label="Along" options={X_OPTIONS} /> : <ParamSegmented param="scale" value={scale} label="Scale" options={SCALE_OPTIONS} />
      }
    >
      <div className="grid gap-6 lg:grid-cols-12">
        <div className="min-w-0 lg:col-span-7">
          <ChartFrame config={config} height="lead" empty={!chart ? 'No run has a cost.' : chart.lines.length === 0 ? (target ? 'No run finished.' : 'No run scored.') : undefined}>
            <LineChart data={chart?.rows} margin={chartMargin()} onMouseLeave={() => setHovered(undefined)}>
              <CartesianGrid {...gridProps} />
              {chart && <XAxis {...chart.axis} />}
              <YAxis {...yAxisProps({ domain: [0, 1], ticks: [0, 0.25, 0.5, 0.75, 1], format: percent })} />
              <ChartTooltip
                cursor={crosshairCursor}
                content={
                  <SeriesTooltip
                    series={chart?.lines.map(l => l.spec) ?? []}
                    format={percent}
                    labelFormat={v => (target ? (x === 'cost' ? formatCost(Number(v)) : formatClock(Number(v))) : `${formatInt(Math.round(Number(v) * best))} or more`)}
                  />
                }
              />
              {ordered.map(l => (
                <Line
                  key={l.spec.key}
                  {...lineProps(l.spec, { faded: faded(lit, l.spec.id), width: lit === l.spec.id || (!lit && leader === l.spec.id) ? 2.25 : 1.5 })}
                  // Finished by: steps up at each finish. Reached at least: holds up to each run, then steps down
                  type={target ? 'stepAfter' : 'stepBefore'}
                  className="cursor-pointer"
                  onMouseEnter={() => setHovered(l.spec.id)}
                  onMouseLeave={() => setHovered(undefined)}
                  dot={(props: { index: number; cx?: number; cy?: number; payload?: Row }) => {
                    const runId = props.payload?.[`${l.spec.key}_run`] as string | undefined;
                    if (!runId || props.cx == null || props.cy == null) return <g key={props.index} />;
                    return (
                      <circle
                        key={props.index}
                        cx={props.cx}
                        cy={props.cy}
                        r={3}
                        fill={l.spec.color}
                        fillOpacity={faded(lit, l.spec.id) ? 0.25 : 1}
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
        <div className="min-w-0 lg:col-span-5 lg:h-80 lg:overflow-y-auto">
          <Ranking e={e} ranked={ranked} drawn={new Set(chart?.lines.map(l => l.spec.id))} lit={lit} />
        </div>
      </div>
    </PageSection>
  );
}

/** The eval's one ranked list: the winner first, a pairing without a line muted with how far it got. */
function Ranking({ e, ranked, drawn, lit }: { e: Eval; ranked: RankedVariant[]; drawn: Set<string>; lit: string | null }) {
  const target = e.target != null;
  return (
    <Table className="table-fixed text-xs" aria-label="Ranking">
      <colgroup>
        <col className="w-8" />
        <col />
        {target && <col className="w-16" />}
        <col className="w-16" />
      </colgroup>
      <TableHeader className="sticky top-0 bg-card">
        <TableRow className="hover:bg-transparent">
          <TableHead>
            <span className="sr-only">Place</span>
          </TableHead>
          <TableHead>
            <span className="sr-only">Pairing</span>
          </TableHead>
          {target && <TableHead className="text-right">Finished</TableHead>}
          <TableHead className="text-right" title={target ? 'Median time to finish, or how far it got' : 'Median over its runs'}>
            {target ? 'Time' : 'Median'}
          </TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {ranked.map((r, i) => {
          const v = r.variant;
          const line = drawn.has(v.key);
          const times = r.runs.filter(run => run.success && run.ticks != null).map(run => run.ticks!);
          const result = target
            ? times.length
              ? formatClock((median(times)! * e.tick_ms) / 1000)
              : `${formatInt(r.medianResult)} of ${formatInt(e.target)}`
            : formatAxisNumber(r.medianResult ?? 0);
          // The winner: first, and something to beat
          const won = i === 0 && line;
          return (
            <TableRow key={v.key} {...hoverProps(v.key)} className={cn('transition-opacity duration-150', faded(lit, v.key) && 'opacity-30', !line && 'text-muted-foreground')}>
              <TableCell className="text-muted-foreground tabular-nums">{won ? <TrophyIcon aria-label="Winner" className="size-3.5 text-foreground" /> : i + 1}</TableCell>
              <TableCell>
                <Link
                  to="/evals/$evalId/$model"
                  params={{ evalId: evalSlug(e.id), model: modelSlug(v.model) }}
                  search={{ level: [v.thinking], harness: [v.agent] } as never}
                  className="flex min-w-0 items-center rounded-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
                >
                  <VariantLabel run={r.runs[0]} variant={v} compact swatch={line} size={14} className="min-w-0" />
                </Link>
              </TableCell>
              {target && (
                <TableCell className="text-right tabular-nums">
                  {formatInt(r.finished)}
                  <span className="text-muted-foreground"> of {formatInt(r.runs.length)}</span>
                </TableCell>
              )}
              <TableCell className="text-right tabular-nums" title={target ? undefined : formatInt(r.medianResult)}>
                {result}
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}
