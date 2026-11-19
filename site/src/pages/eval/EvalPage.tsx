import { useMemo } from 'react';
import { getRouteApi } from '@tanstack/react-router';
import { useQueries, useQuery, useSuspenseQuery } from '@tanstack/react-query';
import { Card } from '@/components/Card';
import { Empty, PageTitle, ParamSegmented } from '@/components/bits';
import { EvalMark } from '@/components/marks';
import { evalRunsQuery, indexQuery, runQuery } from '@/data/queries';
import type { Eval } from '@/data/types';
import { formatDecimal, formatInt } from '@/lib/format';
import { useLegend, type LegendState } from '@/lib/legend';
import { inScope, useDocumentTitle, useScope } from '@/lib/search';
import { AttemptsCard, ParetoCard, SuccessCdfCard } from './Cuts';
import { EffortCard } from './Effort';
import { buildCurves, callsByTick, rankVariants, totalBudgetTicks, xRange, X_OPTIONS } from './model';
import { ProgressChart, RankedPanel } from './Progress';
import { QuestStrip } from './Quests';
import { RunsTable } from './RunsTable';
import { ScopeChips } from './ScopeChips';
import { WhereCard } from './Where';

const route = getRouteApi('/evals/$evalId');

/** The facts a reader needs beside the goal: the budget (minutes on hover), attempts, accounts. */
function Facts({ e }: { e: Eval }) {
  const minutes = (e.budget_ticks * e.tick_ms) / 60_000;
  const facts: [string, React.ReactNode][] = [
    [
      e.attempts > 1 ? 'Budget per attempt' : 'Budget',
      <span
        className="cursor-help underline decoration-muted-50 decoration-dotted underline-offset-4"
        title={`${formatDecimal(minutes).replace(/\.0$/, '')} min at ${formatInt(e.tick_ms)} ms a tick`}
      >
        {formatInt(e.budget_ticks)} ticks
      </span>,
    ],
    ...(e.attempts > 1 ? ([['Attempts', formatInt(e.attempts)]] as [string, React.ReactNode][]) : []),
    [
      e.accounts.length === 1 ? 'Account' : 'Accounts',
      <span className="flex flex-wrap gap-x-2 font-mono text-xs/6">
        {e.accounts.map(a => (
          <span key={a}>{a}</span>
        ))}
      </span>,
    ],
  ];
  return (
    <dl className="flex shrink-0 flex-wrap gap-x-8 gap-y-2">
      {facts.map(([term, value]) => (
        <div key={term}>
          <dt className="text-xs/5 text-muted">{term}</dt>
          <dd className="text-sm/6 text-foreground tabular-nums">{value}</dd>
        </div>
      ))}
    </dl>
  );
}

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
      <div className="flex flex-col gap-6">
        <PageTitle>{evalId}</PageTitle>
        <Empty>No eval with this id has runs.</Empty>
      </div>
    );
  }
  const target = e.target != null;
  const quests = e.measure === 'Quest points';
  const pending = search.x === 'calls' && details.some(d => d.isPending);
  const visibleCurves = curves.filter(cv => legend.visible(cv.variant.key));

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-x-10 gap-y-4 xl:flex-row xl:items-end xl:justify-between">
        <div className="flex min-w-0 items-start gap-4">
          <EvalMark evalId={e.id} size={40} className="mt-0.5" />
          <div className="flex min-w-0 flex-col gap-1">
            <PageTitle>{e.title}</PageTitle>
            <p className="text-base/6 text-foreground">{e.goal}</p>
            {why && <p className="max-w-4xl text-sm/6 text-muted">{why}</p>}
          </div>
        </div>
        <Facts e={e} />
      </header>

      <ScopeChips runs={all} />

      {runs.length === 0 ? (
        <Empty>No runs in this scope.</Empty>
      ) : (
        <>
          <Card
            title={e.measure}
            actions={
              <div className="flex max-w-xs flex-wrap items-center gap-2 sm:max-w-none">
                <ParamSegmented param="x" value={search.x} label="Along" options={X_OPTIONS} />
                <ParamSegmented
                  param="agg"
                  value={search.agg}
                  label="Lines"
                  options={[
                    { value: 'runs', label: 'Runs' },
                    { value: 'median', label: 'Median' },
                    { value: 'best', label: 'Best' },
                  ]}
                />
              </div>
            }
          >
            <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_26rem]">
              <ProgressChart
                e={e}
                curves={curves}
                ranked={ranked}
                x={search.x}
                agg={search.agg}
                range={range!}
                legend={legend}
                pending={pending}
                below={quests ? (g, hover) => <QuestStrip curves={visibleCurves} x={search.x} grid={g} hover={hover} /> : undefined}
              />
              <div className="min-w-0 border-border max-xl:border-t max-xl:pt-4 xl:border-l xl:pl-6">
                <RankedPanel e={e} ranked={ranked} x={search.x} legend={legend} />
              </div>
            </div>
          </Card>

          <div className="grid gap-6 xl:grid-cols-2">
            <ParetoCard e={e} ranked={ranked} px={search.px} legend={legend} />
            {target ? (
              <SuccessCdfCard e={e} ranked={ranked} cx={search.cx} legend={legend} />
            ) : (
              <WhereCard curves={curves} grid={grid} legend={legend} view={search.map} t={search.t} maxTick={totalBudgetTicks(e)} />
            )}
          </div>

          {target &&
            (e.attempts > 1 ? (
              <div className="grid gap-6 xl:grid-cols-2">
                <AttemptsCard e={e} ranked={ranked} legend={legend} />
                <WhereCard curves={curves} grid={grid} legend={legend} view={search.map} t={search.t} maxTick={totalBudgetTicks(e)} />
              </div>
            ) : (
              <WhereCard curves={curves} grid={grid} legend={legend} view={search.map} t={search.t} maxTick={totalBudgetTicks(e)} />
            ))}

          <EffortCard runs={runs} by={search.by} />
          <RunsTable e={e} runs={runs} sort={search.sort} page={search.page} />
        </>
      )}
    </div>
  );
}
