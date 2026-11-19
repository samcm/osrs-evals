import { useMemo } from 'react';
import { getRouteApi } from '@tanstack/react-router';
import { useQueries, useQuery, useSuspenseQuery } from '@tanstack/react-query';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Empty } from '@/components/bits';
import { PageHeader, PageTabs, type MetaItem } from '@/components/page';
import { EvalMark } from '@/components/marks';
import { evalRunsQuery, indexQuery, runQuery } from '@/data/queries';
import type { Eval } from '@/data/types';
import { formatDecimal, formatInt } from '@/lib/format';
import { useLegend, type LegendState } from '@/lib/legend';
import { inScope, useDocumentTitle, useScope } from '@/lib/search';
import { AttemptsCard, ParetoCard, SuccessCdfCard } from './Cuts';
import { EffortCard } from './Effort';
import { buildCurves, callsByTick, rankVariants, totalBudgetTicks, xRange } from './model';
import { Centerpiece } from './Centerpiece';
import { Leaderboard } from './Leaderboard';
import { ProgressCard, ProgressChart } from './Progress';
import { QuestStrip } from './Quests';
import { RunsTable } from './RunsTable';
import { WhereCard } from './Where';

const route = getRouteApi('/evals/$evalId');

/** The facts a reader needs beside the goal: the budget (its minutes on hover), attempts, accounts. */
function facts(e: Eval): MetaItem[] {
  const minutes = (e.budget_ticks * e.tick_ms) / 60_000;
  return [
    {
      term: e.attempts > 1 ? 'Budget per attempt' : 'Budget',
      value: (
        <Tooltip>
          <TooltipTrigger className="cursor-help underline decoration-dotted underline-offset-4">{formatInt(e.budget_ticks)} ticks</TooltipTrigger>
          <TooltipContent>
            {formatDecimal(minutes).replace(/\.0$/, '')} min at {formatInt(e.tick_ms)} ms a tick
          </TooltipContent>
        </Tooltip>
      ),
    },
    ...(e.attempts > 1 ? [{ term: 'Attempts', value: formatInt(e.attempts) }] : []),
  ];
}

const TABS = [
  { value: 'overview', label: 'Overview' },
  { value: 'cost', label: 'Cost' },
  { value: 'behaviour', label: 'Behaviour' },
  { value: 'runs', label: 'Runs' },
] as const;

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
        <PageHeader title={evalId} />
        <Empty>No eval with this id has runs.</Empty>
      </div>
    );
  }
  const target = e.target != null;
  const quests = e.measure === 'Quest points';
  const pending = search.x === 'calls' && details.some(d => d.isPending);
  const visibleCurves = curves.filter(cv => legend.visible(cv.variant.key));
  const maxTick = totalBudgetTicks(e);

  return (
    <div className={SECTIONS}>
      <PageHeader mark={<EvalMark evalId={e.id} size={40} />} title={e.title} description={e.goal} meta={facts(e)} />
      <PageTabs value={search.tab} tabs={[...TABS]} />

      {runs.length === 0 ? (
        <Empty>No runs in this scope.</Empty>
      ) : search.tab === 'overview' ? (
        <>
          <Centerpiece curves={curves} grid={grid} legend={legend} view={search.map} t={search.t} maxTick={maxTick} />
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
          />
          <Leaderboard e={e} ranked={ranked} x={search.x} legend={legend} />
        </>
      ) : search.tab === 'cost' ? (
        <>
          <div className={ROW}>
            <ParetoCard e={e} ranked={ranked} px={search.px} legend={legend} />
            {target && <SuccessCdfCard e={e} ranked={ranked} cx={search.cx} legend={legend} />}
          </div>
          {e.attempts > 1 && <AttemptsCard e={e} ranked={ranked} legend={legend} />}
        </>
      ) : search.tab === 'behaviour' ? (
        <>
          <EffortCard runs={runs} by={search.by} />
          <WhereCard curves={curves} grid={grid} legend={legend} view={search.map} t={search.t} maxTick={maxTick} />
        </>
      ) : (
        <RunsTable e={e} runs={runs} sort={search.sort} page={search.page} />
      )}
    </div>
  );
}
