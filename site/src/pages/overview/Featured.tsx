/**
 * The overview's centrepiece: one eval, in the game. Its best run's last moment as the game drew it,
 * and every pairing's median progress over the eval's budget, keyed by a legend. The eval is picked
 * by its sprite (`?eval=`); the default is the eval the most pairings ran.
 */

import { useMemo } from 'react';
import { Link } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';
import { CartesianGrid, Line, LineChart, ReferenceLine, XAxis, YAxis } from 'recharts';
import { Segmented } from '@/components/bits';
import { ChartFrame, chartMargin, crosshairCursor, gridProps, lineProps, SeriesLegend, seriesConfig, SeriesTooltip, xAxisProps, yAxisProps } from '@/components/charts';
import { PageSection } from '@/components/page';
import { EvalMark, VariantLabel } from '@/components/marks';
import { ChartTooltip } from '@/components/ui/chart';
import { evalRunsQuery } from '@/data/queries';
import type { Eval, EvalRuns, Run } from '@/data/types';
import { variantSeries, type SeriesSpec } from '@/lib/chartSeries';
import { formatDecimal, formatInt } from '@/lib/format';
import { hoverProps, useHover } from '@/lib/hover';
import type { LegendState } from '@/lib/legend';
import { resultValue } from '@/lib/runResult';
import { runScore, type Pairing } from '@/lib/score';
import { variantOf } from '@/lib/series';
import { median } from '@/lib/stats';
import { formatTick, roundCeil, roundTicks } from '@/lib/ticks';

/**
 * A run's value at each grid tick, held after the run ends. The grid samples every few hundred ticks,
 * so a one-try run that reached its target between samples would never show it: from the tick it
 * finished, and after its end, it holds its result.
 */
function heldValues(e: Eval, run: Run, ticks: number[], values: (number | null)[]): (number | null)[] {
  const oneTry = e.attempts === 1;
  const result = resultValue(run);
  let last: number | null = null;
  return values.map((v, i) => {
    if (oneTry && run.success && run.ticks != null && e.target != null && ticks[i] >= run.ticks) return Math.max(v ?? last ?? 0, e.target);
    if (v != null) return (last = v);
    return oneTry && result != null && last != null ? Math.max(last, result) : last;
  });
}

interface PairLine {
  series: SeriesSpec;
  runs: Run[];
}

/** Each pairing's median value at each tick of the eval's budget. */
function medianRows(e: Eval, data: EvalRuns, lines: PairLine[]) {
  const end = e.budget_ticks * e.attempts;
  const held = new Map(
    lines.flatMap(l => l.runs.filter(r => data.runs[r.id]).map(r => [r.id, heldValues(e, r, data.ticks, data.runs[r.id].value)] as const))
  );
  return data.ticks.flatMap((tick, i) =>
    tick > end ? [] : [{ tick, ...Object.fromEntries(lines.map(l => [l.series.key, median(l.runs.map(r => held.get(r.id)?.[i]))])) }]
  );
}

function MedianProgress({ e, lines, legend }: { e: Eval; lines: PairLine[]; legend: LegendState }) {
  const { data } = useQuery(evalRunsQuery(e.id));
  const hover = useHover();
  const rows = useMemo(() => (data ? medianRows(e, data, lines) : []), [e, data, lines]);
  const series = lines.map(l => l.series);
  const end = e.budget_ticks * e.attempts;
  const top = Math.max(e.target ?? 0, ...rows.flatMap(r => series.map(s => Number(r[s.key as keyof typeof r] ?? 0))), 1);
  const yMax = roundCeil(top, 4);

  return (
    <ChartFrame config={seriesConfig(series)} loading={!data} legend={<SeriesLegend series={series} legend={legend} />}>
      <LineChart data={rows} margin={chartMargin()}>
        <CartesianGrid {...gridProps} />
        <XAxis {...xAxisProps({ dataKey: 'tick', domain: [0, end], ticks: roundTicks(end, 4), format: formatTick })} />
        <YAxis {...yAxisProps({ domain: [0, yMax], ticks: roundTicks(yMax, 4), format: formatTick })} />
        <ChartTooltip
          cursor={crosshairCursor}
          content={
            <SeriesTooltip
              series={series.filter(s => legend.visible(s.id))}
              format={v => (Number.isInteger(v) ? formatInt(v) : formatDecimal(v))}
              labelFormat={t => `Tick ${formatInt(Number(t))}`}
            />
          }
        />
        {e.target != null && <ReferenceLine y={e.target} stroke="var(--muted-foreground)" strokeDasharray="4 4" />}
        {/* Where each new try starts */}
        {Array.from({ length: e.attempts - 1 }, (_, k) => (
          <ReferenceLine key={k} x={e.budget_ticks * (k + 1)} stroke="var(--border)" />
        ))}
        {series.map(s => (
          <Line key={s.key} {...lineProps(s, { hidden: !legend.visible(s.id), faded: hover.faded(s.id) })} />
        ))}
      </LineChart>
    </ChartFrame>
  );
}

export function Featured({
  evals,
  featured,
  fallback,
  runs,
  pairings,
  legend,
  onChange,
}: {
  /** The evals to pick from */
  evals: Eval[];
  featured: Eval;
  /** The default, which the URL leaves out */
  fallback: Eval;
  /** Runs in scope */
  runs: Run[];
  /** Pairings in scope, best first */
  pairings: Pairing[];
  legend: LegendState;
  onChange: (evalId: string | undefined) => void;
}) {
  const own = useMemo(() => runs.filter(r => r.eval === featured.id), [runs, featured.id]);
  // Pairings in the leaderboard's order, so the legend reads the same way down
  const lines = useMemo<PairLine[]>(
    () =>
      pairings
        .filter(p => p.evals.has(featured.id))
        .sort((a, b) => b.evals.get(featured.id)!.score - a.evals.get(featured.id)!.score)
        .map(p => ({ series: variantSeries(p.variant), runs: own.filter(r => r.model === p.variant.model && r.agent === p.variant.agent) })),
    [pairings, featured.id, own]
  );
  const best = useMemo(() => {
    const top = Math.max(0, ...own.map(r => resultValue(r) ?? 0));
    return [...own].filter(r => r.screenshot).sort((a, b) => (runScore(featured, b, top) ?? -1) - (runScore(featured, a, top) ?? -1))[0];
  }, [own, featured]);

  return (
    <PageSection
      lead
      title={
        <>
          <EvalMark evalId={featured.id} size={20} title="" />
          <Link to="/evals/$evalId" params={{ evalId: featured.id }} className="truncate hover:underline hover:underline-offset-4">
            {featured.title}
          </Link>
        </>
      }
      description={`Median ${featured.measure.toLowerCase()} by game tick`}
      actions={
        evals.length > 1 && (
          <Segmented
            label="Featured eval"
            value={featured.id}
            options={evals.map(e => ({ value: e.id, label: <EvalMark evalId={e.id} size={16} title="" />, title: e.title }))}
            onChange={id => onChange(id === fallback.id ? undefined : id)}
          />
        )
      }
    >
      <div className="grid items-start gap-gutter lg:grid-cols-5">
        {best && (
          <figure className="flex min-w-0 flex-col gap-2 lg:col-span-2">
            <Link
              to="/runs/$runId"
              params={{ runId: best.id }}
              {...hoverProps(variantOf(best).key)}
              className="block overflow-hidden rounded-md bg-muted outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
            >
              <img src={`/data/${best.screenshot}`} alt="The best run's last moment in the game" className="aspect-video w-full animate-fade-in object-cover" />
            </Link>
            <figcaption className="flex min-w-0 text-sm">
              <VariantLabel run={best} compact />
            </figcaption>
          </figure>
        )}
        <div className="min-w-0 lg:col-span-3">
          <MedianProgress e={featured} lines={lines} legend={legend} />
        </div>
      </div>
    </PageSection>
  );
}
