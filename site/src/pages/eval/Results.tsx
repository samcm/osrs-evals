/**
 * The eval's first view: who won, who finished and how each got there, as small multiples. A card
 * per pairing in the eval's order (the leaderboard's: median result, or how many finished and their
 * median time to finish in game time), best first. Each card holds its result as the one big number,
 * how many of its runs finished where the eval has a target, and its runs' progress on axes every
 * card shares, so heights and slopes compare across the grid. The first card is the winner: twice
 * as wide, with a trophy, when it won anything (on an eval with a target, when it finished).
 */

import { useMemo } from 'react';
import { Link, useNavigate } from '@tanstack/react-router';
import { TrophyIcon } from 'lucide-react';
import { CartesianGrid, Line, LineChart, XAxis, YAxis } from 'recharts';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ChartTooltip, ChartTooltipContent, type ChartConfig } from '@/components/ui/chart';
import { ChartFrame, chartMargin, crosshairCursor, gridProps, lineProps, logAxisProps, xAxisProps, yAxisProps } from '@/components/charts';
import { VariantLabel } from '@/components/marks';
import type { Eval } from '@/data/types';
import { variantSeries, type SeriesSpec } from '@/lib/chartSeries';
import { evalSlug } from '@/lib/evals';
import { formatAxisNumber, formatDuration, formatInt } from '@/lib/format';
import { modelSlug } from '@/lib/series';
import { median } from '@/lib/stats';
import { cn } from '@/lib/utils';
import { formatTick, formatX, roundTicks } from './chartBits';
import { gameTime } from './centerpiece/Standings';
import { hasX, xOf, type RankedVariant, type RunCurve, type XMeasure, type XRange } from './model';

const MARGIN = chartMargin();

type Row = { x: number } & Record<string, number>;

interface Axes {
  x: XMeasure;
  range: XRange;
  xAxis: object;
  yMax: number;
  yTicks: number[];
  /** The tooltip's title: a position on x */
  label: (v: number) => string;
}

/** A pairing's runs on the shared axes: a line per run, ending in a filled dot if it finished, a ring if not. */
function RunsChart({ e, curves, spec, axes }: { e: Eval; curves: RunCurve[]; spec: SeriesSpec; axes: Axes }) {
  const navigate = useNavigate();
  const { x, range } = axes;
  const lines = useMemo(() => {
    const clampX = (v: number): number => Math.min(range.max, Math.max(range.min, v));
    return curves
      .filter(cv => hasX(cv, x))
      .map(cv => ({
        key: `r${cv.run.id.replace(/[^a-zA-Z0-9]/g, '')}`,
        curve: cv,
        points: cv.points.map(p => [clampX(xOf(p, x)!), p.value] as [number, number]),
      }));
  }, [curves, x, range]);
  const rows = useMemo(() => {
    const byX = new Map<number, Row>();
    for (const line of lines) {
      for (const [px, py] of line.points) {
        const row = byX.get(px) ?? ({ x: px } as Row);
        row[line.key] = py;
        byX.set(px, row);
      }
    }
    return [...byX.values()].sort((a, b) => a.x - b.x);
  }, [lines]);
  const config = useMemo<ChartConfig>(
    () => Object.fromEntries(lines.map(l => [l.key, { label: `Epoch ${l.curve.run.epoch}`, color: spec.color }])),
    [lines, spec]
  );
  const target = e.target != null;

  return (
    <ChartFrame config={config} height="compact" empty={lines.length === 0 ? `No ${x === 'cost' ? 'cost' : 'model calls'} for these runs.` : undefined}>
      <LineChart data={rows} margin={MARGIN}>
        <CartesianGrid {...gridProps} />
        <XAxis {...axes.xAxis} />
        <YAxis {...yAxisProps({ domain: [0, axes.yMax], ticks: axes.yTicks })} />
        <ChartTooltip
          cursor={crosshairCursor}
          content={<ChartTooltipContent indicator="line" labelFormatter={(_, payload) => axes.label(payload?.[0]?.payload?.x)} />}
        />
        {lines.map(line => {
          const end = line.points[line.points.length - 1];
          const finished = line.curve.run.success;
          return (
            <Line
              key={line.key}
              {...lineProps(spec)}
              stroke={spec.color}
              dataKey={line.key}
              name={line.key}
              connectNulls
              activeDot={false}
              className="cursor-pointer"
              onClick={() => navigate({ to: '/runs/$runId', params: { runId: line.curve.run.id }, search: {} as never })}
              dot={(props: { cx?: number; cy?: number; payload?: Row; index?: number }) =>
                target && props.payload?.x === end[0] && props.cx != null && props.cy != null ? (
                  <circle
                    key={`${line.key}-end`}
                    cx={props.cx}
                    cy={props.cy}
                    r={3.5}
                    fill={finished ? spec.color : 'var(--card)'}
                    stroke={spec.color}
                    strokeWidth={1.5}
                  />
                ) : (
                  <g key={`${line.key}-${props.index}`} />
                )
              }
            />
          );
        })}
      </LineChart>
    </ChartFrame>
  );
}

/** The pairing's result: its median time to finish over finished runs, or how far its median run got. */
function resultOf(e: Eval, r: RankedVariant): { text: string; exact?: string; finished: boolean } {
  if (e.target != null) {
    const times = r.runs.filter(run => run.success && run.ticks != null).map(run => run.ticks!);
    if (times.length) return { text: gameTime(e, median(times)!), exact: `${formatInt(median(times))} ticks`, finished: true };
    return { text: `${formatInt(r.medianResult)} of ${formatInt(e.target)}`, finished: false };
  }
  // Without a target a value can run to millions: compact, exact on hover
  return { text: formatAxisNumber(r.medianResult ?? 0), exact: formatInt(r.medianResult), finished: true };
}

/** The results' x measures: game ticks read as game time (the server's clock runs with the harness's, so wall time is the same), cost or model calls. */
export const RESULT_X_OPTIONS: { value: XMeasure; label: string }[] = [
  { value: 'ticks', label: 'Game time' },
  { value: 'cost', label: 'Cost' },
  { value: 'calls', label: 'Calls' },
];

export function ResultsGrid({ e, ranked, curves, x, range }: { e: Eval; ranked: RankedVariant[]; curves: RunCurve[]; x: XMeasure; range: XRange }) {
  const target = e.target;
  // One y axis for every card: up to the target, or the highest any run reached
  const axes = useMemo<Axes>(() => {
    const top = Math.max(1, ...curves.flatMap(cv => cv.points.map(p => p.value)));
    // Three or four round ticks, the axis ending on one
    const yTicks = roundTicks(target != null && top <= target ? target : Math.max(target ?? 0, top), 'count', 3);
    if (yTicks[yTicks.length - 1] < top) yTicks.push(yTicks[yTicks.length - 1] + (yTicks[1] ?? 1));
    const yMax = yTicks[yTicks.length - 1];
    // Game ticks read as game time, on round hours and minutes, as the big numbers do
    const seconds = (v: number): number => (v * e.tick_ms) / 1000;
    const xAxis = range.log
      ? { ...logAxisProps([range.min, range.max], v => formatTick(v, x))!, dataKey: 'x' }
      : x === 'ticks'
        ? xAxisProps({
            dataKey: 'x',
            domain: [range.min, range.max],
            ticks: roundTicks(seconds(range.max), 'seconds', 2).map(s => (s * 1000) / e.tick_ms),
            format: v => (v === 0 ? '0' : formatDuration(seconds(v))),
          })
        : xAxisProps({ dataKey: 'x', domain: [range.min, range.max], ticks: roundTicks(range.max, x, 2), format: v => formatTick(v, x) });
    const label = (v: number): string => (x === 'ticks' ? gameTime(e, v) : formatX(v, x));
    return { x, range, xAxis, yMax, yTicks, label };
  }, [curves, target, range, x, e]);
  const byVariant = useMemo(() => {
    const map = new Map<string, RunCurve[]>();
    for (const cv of curves) map.set(cv.variant.key, [...(map.get(cv.variant.key) ?? []), cv]);
    return map;
  }, [curves]);
  // A winner only when someone won: on an eval with a target, the first pairing finished
  const won = ranked.length > 0 && (target == null || ranked[0].finished > 0);

  return (
    <div className="grid gap-gutter sm:grid-cols-2 xl:grid-cols-4 3xl:grid-cols-5">
      {ranked.map((r, i) => {
        const v = r.variant;
        const result = resultOf(e, r);
        const winner = won && i === 0;
        return (
          <Card key={v.key} className={cn('@container/card min-w-0', winner && 'sm:col-span-2')}>
            <CardHeader>
              <CardDescription className="flex min-w-0 items-center gap-2">
                {winner ? (
                  <Badge variant="outline">
                    <TrophyIcon />
                    Winner
                  </Badge>
                ) : (
                  <span className="tabular-nums">{i + 1}</span>
                )}
                <Link
                  to="/evals/$evalId/$model"
                  params={{ evalId: evalSlug(e.id), model: modelSlug(v.model) }}
                  search={{ level: [v.thinking], harness: [v.agent] } as never}
                  className="min-w-0 rounded-sm text-foreground outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
                >
                  <VariantLabel variant={v} compact className="max-w-full" />
                </Link>
              </CardDescription>
              <CardTitle
                className={cn('text-2xl font-semibold tabular-nums @[480px]/card:text-3xl', !result.finished && 'text-muted-foreground')}
                title={result.exact}
              >
                {result.text}
              </CardTitle>
              {target != null && (
                <dl className="flex items-baseline gap-2 text-sm">
                  <dt className="text-muted-foreground">Finished</dt>
                  <dd className="tabular-nums">
                    {formatInt(r.finished)}
                    <span className="text-muted-foreground"> of {formatInt(r.runs.length)}</span>
                  </dd>
                </dl>
              )}
            </CardHeader>
            <CardContent>
              <RunsChart e={e} curves={byVariant.get(v.key) ?? []} spec={variantSeries(v)} axes={axes} />
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
