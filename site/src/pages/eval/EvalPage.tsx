import { useMemo, type ReactNode } from 'react';
import { getRouteApi } from '@tanstack/react-router';
import { useQueries, useQuery, useSuspenseQuery } from '@tanstack/react-query';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Empty, PageTitle } from '@/components/bits';
import { EvalMark } from '@/components/marks';
import { evalRunsQuery, indexQuery, runQuery } from '@/data/queries';
import type { Eval } from '@/data/types';
import { formatDecimal, formatInt } from '@/lib/format';
import { useLegend, type LegendState } from '@/lib/legend';
import { inScope, useDocumentTitle, useScope } from '@/lib/search';
import { AttemptsCard, ParetoCard, SuccessCdfCard } from './Cuts';
import { EffortCard } from './Effort';
import { buildCurves, callsByTick, rankVariants, totalBudgetTicks, xRange } from './model';
import { ProgressCard, ProgressChart, RankedPanel } from './Progress';
import { QuestStrip } from './Quests';
import { RunsTable } from './RunsTable';
import { ScopeChips } from './ScopeChips';
import { WhereCard } from './Where';

const route = getRouteApi('/evals/$evalId');
/** The most the map takes beside another card (which stretches to match). */
const MAP_BESIDE = 480;

/** The facts a reader needs beside the goal: the budget (its minutes on hover), attempts, accounts. */
function Facts({ e }: { e: Eval }) {
  const minutes = (e.budget_ticks * e.tick_ms) / 60_000;
  const facts: [string, ReactNode][] = [
    [
      e.attempts > 1 ? 'Budget per attempt' : 'Budget',
      <Tooltip>
        <TooltipTrigger className="cursor-help underline decoration-dotted underline-offset-4">
          {formatInt(e.budget_ticks)} ticks
        </TooltipTrigger>
        <TooltipContent>
          {formatDecimal(minutes).replace(/\.0$/, '')} min at {formatInt(e.tick_ms)} ms a tick
        </TooltipContent>
      </Tooltip>,
    ],
    ...(e.attempts > 1 ? ([['Attempts', formatInt(e.attempts)]] as [string, ReactNode][]) : []),
    [e.accounts.length === 1 ? 'Account' : 'Accounts', <span className="font-mono">{e.accounts.join(', ')}</span>],
  ];
  return (
    <dl className="flex flex-wrap gap-x-8 gap-y-2 text-sm">
      {facts.map(([term, value]) => (
        <div key={term} className="flex flex-col gap-1">
          <dt className="text-muted-foreground">{term}</dt>
          <dd className="tabular-nums">{value}</dd>
        </div>
      ))}
    </dl>
  );
}

const SECTIONS = 'flex flex-col gap-4 md:gap-6';
const ROW = 'grid gap-4 md:gap-6 xl:grid-cols-2';

export function EvalPage() {
  const { evalId } = route.useParams();
  const search = route.useSearch();
  const { data } = useSuspenseQuery(indexQuery);
  const { data: grid } = useQuery(evalRunsQuery(evalId));
  const scope = useScope();
  const urlLegend = useLegend();
  const e = data.evals.find(x => x.id === evalId);
  useDocumentTitle(e?.title ?? evalId);

  const all = useMemo(() => data.runs.filter(r => r.eval === evalId), [data, evalId]);
  const runs = useMemo(() => all.filter(r => inScope(r, scope)), [all, scope]);
  const why = data.ideas?.find(i => i.eval === evalId)?.why;

  // Model calls as x need each run's calls, from its detail: loaded only when asked for
  const details = useQueries({
    queries: (search.x === 'calls' ? runs.filter(r => r.model_calls > 0) : []).map(r => runQuery(r.id)),
  });
  const callsKey = details.map(d => (d.data ? '1' : '0')).join('');
  const calls = useMemo(() => {
    const map = new Map<string, (tick: number) => number>();
    for (const d of details) if (d.data) map.set(d.data.id, callsByTick(d.data));
    return map;
    // details is a new array every render; its loaded state is what matters
  }, [callsKey]);

  const curves = useMemo(() => (e ? buildCurves(e, grid, runs, calls) : []), [e, grid, runs, calls]);
  const ranked = useMemo(() => (e ? rankVariants(e, runs, search.x) : []), [e, runs, search.x]);
  // A focus on a variant the scope leaves out would hide everything: ignore it
  const legend = useMemo<LegendState>(() => {
    if (!urlLegend.focus || ranked.some(r => r.variant.key === urlLegend.focus)) return urlLegend;
    return { ...urlLegend, focus: undefined, visible: id => !urlLegend.hidden.includes(id) };
  }, [ranked, urlLegend]);
  const range = useMemo(() => (e ? xRange(e, curves, search.x) : null), [e, curves, search.x]);

  if (!e) {
    return (
      <div className={SECTIONS}>
        <PageTitle>{evalId}</PageTitle>
        <Empty>No eval with this id has runs.</Empty>
      </div>
    );
  }
  const target = e.target != null;
  const quests = e.measure === 'Quest points';
  const pending = search.x === 'calls' && details.some(d => d.isPending);
  const visibleCurves = curves.filter(cv => legend.visible(cv.variant.key));
  const map = (height?: number) => (
    <WhereCard curves={curves} grid={grid} legend={legend} view={search.map} t={search.t} maxTick={totalBudgetTicks(e)} height={height} />
  );

  return (
    <div className={SECTIONS}>
      <header className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
        <div className="flex min-w-0 items-start gap-4">
          <EvalMark evalId={e.id} size={40} />
          <div className="flex min-w-0 flex-col gap-1">
            <PageTitle>{e.title}</PageTitle>
            <p>{e.goal}</p>
            {why && <p className="text-sm text-muted-foreground">{why}</p>}
          </div>
        </div>
        <Facts e={e} />
      </header>

      <ScopeChips runs={all} />

      {runs.length === 0 ? (
        <Empty>No runs in this scope.</Empty>
      ) : (
        <>
          <ProgressCard
            e={e}
            x={search.x}
            agg={search.agg}
            chart={
              <ProgressChart
                e={e}
                curves={curves}
                ranked={ranked}
                x={search.x}
                agg={search.agg}
                range={range!}
                legend={legend}
                pending={pending}
                below={quests ? frame => <QuestStrip curves={visibleCurves} x={search.x} frame={frame} /> : undefined}
              />
            }
            panel={<RankedPanel e={e} ranked={ranked} x={search.x} legend={legend} />}
          />

          <div className={ROW}>
            <ParetoCard e={e} ranked={ranked} px={search.px} legend={legend} />
            {target ? <SuccessCdfCard e={e} ranked={ranked} cx={search.cx} legend={legend} /> : map(MAP_BESIDE)}
          </div>

          {target &&
            (e.attempts > 1 ? (
              <div className={ROW}>
                <AttemptsCard e={e} ranked={ranked} legend={legend} />
                {map(MAP_BESIDE)}
              </div>
            ) : (
              map()
            ))}

          <EffortCard runs={runs} by={search.by} />
          <RunsTable e={e} runs={runs} sort={search.sort} page={search.page} />
        </>
      )}
    </div>
  );
}
