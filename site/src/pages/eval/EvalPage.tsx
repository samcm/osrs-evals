import { useMemo } from 'react';
import { getRouteApi } from '@tanstack/react-router';
import { useQueries, useQuery, useSuspenseQuery } from '@tanstack/react-query';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Empty, ParamSegmented } from '@/components/bits';
import { PageHeader, PageSection, PageTabs, PageToolbar, type MetaItem } from '@/components/page';
import { SeriesLegend } from '@/components/charts';
import { variantSeries } from '@/lib/chartSeries';
import { variantKey } from '@/lib/series';
import { EvalMark } from '@/components/marks';
import { evalRunsQuery, indexQuery, runQuery } from '@/data/queries';
import type { Eval } from '@/data/types';
import { formatDecimal, formatInt } from '@/lib/format';
import { useLegend, type LegendState } from '@/lib/legend';
import { inScope, useDocumentTitle, useScope } from '@/lib/search';
import { AttemptsTable, CdfChart, ParetoChart } from './Cuts';
import { EffortStrips, GROUP_OPTIONS, ToolMix } from './Effort';
import { buildCurves, callsByTick, rankVariants, totalBudgetTicks, X_OPTIONS, xRange } from './model';
import { Centerpiece } from './Centerpiece';
import { pickRunners } from './centerpiece/race';
import { Leaderboard } from './Leaderboard';
import { ProgressChart } from './Progress';
import { QuestStrip } from './Quests';
import { RunsTable } from './RunsTable';
import { WhereMap } from './Where';

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

/** One gap between the page's sections: the theme's gutter */
const SECTIONS = 'flex flex-col gap-gutter';

const AGG_OPTIONS = [
  { value: 'median' as const, label: 'Median', title: "Each pairing's median run" },
  { value: 'best' as const, label: 'Best', title: "Each pairing's best run" },
  { value: 'runs' as const, label: 'All runs', title: 'Every run' },
];
const PX_OPTIONS = [
  { value: 'cost' as const, label: 'Cost' },
  { value: 'seconds' as const, label: 'Time' },
  { value: 'ticks' as const, label: 'Ticks' },
];

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
  // The runs the overview shows, the same in every part of it: every run, or each pairing's median
  // or best run. A focus keeps the other pairings, faded, so the focused one reads against them
  const shownCurves = useMemo(
    () => pickRunners(curves.filter(cv => !legend.hidden.includes(cv.variant.key) || legend.focus === cv.variant.key), search.agg),
    [curves, legend, search.agg]
  );

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
  const maxTick = totalBudgetTicks(e);

  const visibleRuns = runs.filter(r => legend.visible(variantKey(r)));
  const keys = ranked.map(r => variantSeries(r.variant));

  const controls =
    search.tab === 'overview' ? (
      <>
        <ParamSegmented param="x" value={search.x} label="Along" options={X_OPTIONS} />
        <ParamSegmented param="agg" value={search.agg} label="Runs shown" options={AGG_OPTIONS} />
      </>
    ) : search.tab === 'cost' ? (
      <ParamSegmented param="px" value={search.px} label="Spend" options={PX_OPTIONS} />
    ) : search.tab === 'behaviour' ? (
      <ParamSegmented param="by" value={search.by} label="Group by" options={GROUP_OPTIONS} />
    ) : undefined;

  return (
    <div className={SECTIONS}>
      <PageHeader mark={<EvalMark evalId={e.id} size={40} />} title={e.title} description={e.goal} meta={facts(e)} />
      <PageTabs value={search.tab} tabs={[...TABS]} />
      {runs.length > 0 && search.tab !== 'runs' && (
        <PageToolbar label="Chart controls">
          {controls}
          {/* The page's one key to its pairings: hover lights one everywhere, a click hides it */}
          <SeriesLegend series={keys} legend={legend} className="ml-auto pt-0" />
        </PageToolbar>
      )}

      {runs.length === 0 ? (
        <Empty>No runs in this scope.</Empty>
      ) : search.tab === 'overview' ? (
        <>
          <PageSection lead>
            <Centerpiece curves={shownCurves} grid={grid} legend={legend} view={search.map} t={search.t} maxTick={maxTick} agg={search.agg} />
          </PageSection>
          <PageSection title={e.measure}>
            <ProgressChart
              e={e}
              curves={shownCurves}
              ranked={ranked}
              x={search.x}
              agg={search.agg}
              range={range!}
              legend={legend}
              pending={pending}
              t={search.t}
              below={quests ? frame => <QuestStrip curves={shownCurves} x={search.x} frame={frame} focus={legend.focus} /> : undefined}
            />
          </PageSection>
          <PageSection title="Leaderboard">
            <Leaderboard e={e} ranked={ranked} x={search.x} legend={legend} />
          </PageSection>
        </>
      ) : search.tab === 'cost' ? (
        <>
          <div className={target ? 'grid gap-gutter xl:grid-cols-2' : undefined}>
            <PageSection title="What it cost">
              <ParetoChart e={e} ranked={ranked} px={search.px} legend={legend} />
            </PageSection>
            {target && (
              <PageSection title="Finished within" className="xl:border-t-0 xl:pt-0">
                <CdfChart e={e} ranked={ranked} cx={search.px} legend={legend} />
              </PageSection>
            )}
          </div>
          {e.attempts > 1 && (
            <PageSection title="Attempts" className="border-t pt-gutter">
              <AttemptsTable e={e} ranked={ranked} legend={legend} />
            </PageSection>
          )}
        </>
      ) : search.tab === 'behaviour' ? (
        <>
          <PageSection title="Effort per run">
            <EffortStrips runs={visibleRuns} by={search.by} focus={legend.focus} />
          </PageSection>
          <PageSection title="Tool calls">
            <ToolMix runs={visibleRuns} by={search.by} />
          </PageSection>
          <PageSection title="Where they spent their time">
            <WhereMap curves={curves} grid={grid} legend={legend} view={search.map} />
          </PageSection>
        </>
      ) : (
        <PageSection>
          <RunsTable e={e} runs={runs} curves={curves} sort={search.sort} page={search.page} />
        </PageSection>
      )}
    </div>
  );
}
