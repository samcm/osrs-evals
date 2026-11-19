import { useMemo } from 'react';
import { Link, useNavigate } from '@tanstack/react-router';
import { useQuery, useSuspenseQuery } from '@tanstack/react-query';
import { createColumnHelper, type ColumnDef } from '@tanstack/react-table';
import { CartesianGrid, Line, LineChart, ReferenceLine, XAxis, YAxis } from 'recharts';
import { DataTable } from '@/components/DataTable';
import { Empty, PageTitle } from '@/components/bits';
import { chartMargin, crosshairCursor, gridProps, lineProps, seriesConfig, SeriesTooltip, xAxisProps, yAxisProps } from '@/components/charts';
import { EvalMark, VariantLabel } from '@/components/marks';
import { Button } from '@/components/ui/button';
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ChartContainer, ChartTooltip } from '@/components/ui/chart';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { evalRunsQuery, indexQuery } from '@/data/queries';
import type { Eval, EvalRuns, Run } from '@/data/types';
import { dashArray, variantSeries, type SeriesSpec } from '@/lib/chartSeries';
import { hasTarget } from '@/lib/evals';
import { formatDecimal, formatInt, formatPercent } from '@/lib/format';
import { resultValue } from '@/lib/runResult';
import { inScope, useDocumentTitle, useScope } from '@/lib/search';
import { compareVariants, variantOf, type Variant } from '@/lib/series';
import { median } from '@/lib/stats';
import { formatTick, roundCeil, roundTicks } from '@/lib/ticks';

/** One variant on one eval: its runs and its headline result. */
interface Standing {
  variant: Variant;
  series: SeriesSpec;
  runs: Run[];
  /** Finish rate for evals with a target, else the median result */
  value: number | null;
  finished: number;
  /** Median ticks to finish, to break ties between equal finish rates */
  ticks: number | null;
}

function standings(e: Eval, runs: Run[]): Standing[] {
  const groups = new Map<string, Run[]>();
  for (const r of runs) groups.set(variantOf(r).key, [...(groups.get(variantOf(r).key) ?? []), r]);
  return [...groups.values()]
    .map(list => {
      const variant = variantOf(list[0]);
      const finished = list.filter(r => r.success).length;
      const scored = list.filter(r => r.success != null).length;
      return {
        variant,
        series: variantSeries(list[0]),
        runs: list,
        value: hasTarget(e) ? (scored ? finished / scored : null) : median(list.map(resultValue)),
        finished,
        ticks: median(list.filter(r => r.success).map(r => r.ticks)),
      };
    })
    .sort(
      (a, b) =>
        (b.value ?? -1) - (a.value ?? -1) || (a.ticks ?? Infinity) - (b.ticks ?? Infinity) || compareVariants(a.variant, b.variant)
    );
}

export function OverviewPage() {
  useDocumentTitle(undefined);
  const { data } = useSuspenseQuery(indexQuery);
  const scope = useScope();
  const runs = useMemo(() => data.runs.filter(r => inScope(r, scope)), [data, scope]);
  const evals = data.evals.filter(e => runs.some(r => r.eval === e.id));

  return (
    <>
      <div className="flex flex-col gap-1">
        <PageTitle>Language models playing 2004scape</PageTitle>
        <p className="text-sm text-muted-foreground">For each goal in the game, which model in which harness does best.</p>
      </div>
      {evals.length === 0 ? (
        <Empty>No runs in this scope.</Empty>
      ) : (
        <div className="grid gap-4 md:gap-6 xl:grid-cols-2">
          {evals.map(e => (
            <EvalCard key={e.id} e={e} runs={runs.filter(r => r.eval === e.id)} />
          ))}
        </div>
      )}
    </>
  );
}

function EvalCard({ e, runs }: { e: Eval; runs: Run[] }) {
  const ranked = useMemo(() => standings(e, runs), [e, runs]);
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <EvalMark evalId={e.id} size={20} title="" />
          {e.title}
        </CardTitle>
        <Tooltip>
          <TooltipTrigger asChild>
            <CardDescription className="truncate">{e.goal}</CardDescription>
          </TooltipTrigger>
          <TooltipContent className="max-w-sm">{e.goal}</TooltipContent>
        </Tooltip>
        <CardAction>
          <Button asChild variant="outline" size="sm">
            <Link to="/evals/$evalId" params={{ evalId: e.id }}>
              {runs.length === 1 ? '1 run' : `${runs.length} runs`}
            </Link>
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent>
        <MedianProgress e={e} standings={ranked} />
      </CardContent>
      <CardContent className="px-0">
        <Leaderboard e={e} standings={ranked} />
      </CardContent>
    </Card>
  );
}

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

/** Each variant's median value at each tick of the eval's budget. */
function medianRows(e: Eval, data: EvalRuns, ranked: Standing[]) {
  const end = e.budget_ticks * e.attempts;
  const held = new Map(
    ranked.flatMap(s => s.runs.filter(r => data.runs[r.id]).map(r => [r.id, heldValues(e, r, data.ticks, data.runs[r.id].value)] as const))
  );
  return data.ticks.flatMap((tick, i) =>
    tick > end
      ? []
      : [
          {
            tick,
            ...Object.fromEntries(ranked.map(s => [s.series.key, median(s.runs.map(r => held.get(r.id)?.[i]))])),
          },
        ]
  );
}

function MedianProgress({ e, standings: ranked }: { e: Eval; standings: Standing[] }) {
  const { data } = useQuery(evalRunsQuery(e.id));
  const rows = useMemo(() => (data ? medianRows(e, data, ranked) : []), [e, data, ranked]);
  const series = ranked.map(s => s.series);
  const end = e.budget_ticks * e.attempts;
  const top = Math.max(e.target ?? 0, ...rows.flatMap(r => series.map(s => Number(r[s.key as keyof typeof r] ?? 0))), 1);
  const yMax = roundCeil(top, 4);
  const yTicks = roundTicks(yMax, 4);

  if (!data) return <Skeleton className="h-48 w-full" />;
  return (
    <ChartContainer config={seriesConfig(series)} className="aspect-auto h-48 w-full">
      <LineChart data={rows} margin={chartMargin()}>
        <CartesianGrid {...gridProps} />
        <XAxis {...xAxisProps({ dataKey: 'tick', domain: [0, end], ticks: roundTicks(end, 4), format: formatTick })} />
        <YAxis {...yAxisProps({ domain: [0, yMax], ticks: yTicks, format: formatTick })} />
        <ChartTooltip
          cursor={crosshairCursor}
          content={
            <SeriesTooltip
              series={series}
              format={v => (Number.isInteger(v) ? formatInt(v) : formatDecimal(v))}
              labelFormat={t => `Tick ${formatInt(Number(t))}`}
            />
          }
        />
        {e.target != null && (
          <ReferenceLine
            y={e.target}
            stroke="var(--muted-foreground)"
            strokeDasharray="4 4"
            label={{ value: 'Target', position: 'insideTopLeft', className: 'fill-muted-foreground text-xs' }}
          />
        )}
        {/* Where each new try starts */}
        {Array.from({ length: e.attempts - 1 }, (_, k) => (
          <ReferenceLine key={k} x={e.budget_ticks * (k + 1)} stroke="var(--border)" />
        ))}
        {series.map(s => (
          <Line key={s.key} {...lineProps(s)} />
        ))}
      </LineChart>
    </ChartContainer>
  );
}

/** The line's colour and dash, keying the leaderboard row to the chart above. */
function LineKey({ series }: { series: SeriesSpec }) {
  return (
    <svg aria-hidden viewBox="0 0 16 4" className="h-1 w-4 shrink-0 max-sm:hidden">
      <line x1="0" y1="2" x2="16" y2="2" stroke={series.color} strokeWidth="2" strokeDasharray={dashArray(series.line)} />
    </svg>
  );
}

const col = createColumnHelper<Standing & { rank: number; share: number }>();

function Leaderboard({ e, standings: ranked }: { e: Eval; standings: Standing[] }) {
  const navigate = useNavigate();
  const target = hasTarget(e);
  const best = Math.max(0, ...ranked.map(s => s.value ?? 0));
  const rows = ranked.map((s, i) => ({ ...s, rank: i + 1, share: best > 0 ? ((s.value ?? 0) / best) * 100 : 0 }));
  const scoped = (v: Variant) => ({ model: [v.model], agent: [v.agent] });

  const columns = useMemo(
    () =>
      [
        col.accessor('rank', {
          header: '#',
          enableSorting: false,
          cell: ({ getValue }) => <span className="text-muted-foreground">{getValue()}</span>,
        }),
        col.display({
          id: 'variant',
          header: 'Variant',
          cell: ({ row }) => (
            <span className="flex items-center gap-2">
              <LineKey series={row.original.series} />
              <Link
                to="/evals/$evalId"
                params={{ evalId: e.id }}
                search={scoped(row.original.variant) as never}
                onClick={event => event.stopPropagation()}
              >
                <VariantLabel variant={row.original.variant} compact />
              </Link>
            </span>
          ),
        }),
        col.display({
          id: 'bar',
          header: () => <span className="sr-only">Relative to the best</span>,
          cell: ({ row }) => <Progress value={row.original.share} className="w-32 max-sm:hidden" aria-label={`${Math.round(row.original.share)}% of the best`} />,
        }),
        col.display({
          id: 'value',
          header: () =>
            target ? (
              'Finish rate'
            ) : (
              <>
                Median<span className="max-sm:hidden"> {e.measure.toLowerCase()}</span>
              </>
            ),
          meta: { numeric: true },
          cell: ({ row }) => {
            const s = row.original;
            return (
              <span className="inline-flex flex-col-reverse items-end sm:flex-row sm:items-baseline sm:gap-2">
                {target && (
                  <span className="text-xs text-muted-foreground">
                    {s.finished} of {s.runs.length}
                  </span>
                )}
                <span className="font-medium">{target ? formatPercent(s.value) : Number.isInteger(s.value) ? formatInt(s.value) : formatDecimal(s.value)}</span>
              </span>
            );
          },
        }),
      ] as ColumnDef<Standing & { rank: number; share: number }, unknown>[],
    [e, target]
  );

  return (
    <DataTable
      data={rows}
      columns={columns}
      getRowId={r => r.variant.key}
      onRowClick={r => navigate({ to: '/evals/$evalId', params: { evalId: e.id }, search: scoped(r.variant) as never })}
    />
  );
}
