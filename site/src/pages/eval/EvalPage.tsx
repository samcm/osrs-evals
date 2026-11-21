import { useMemo } from 'react';
import { getRouteApi } from '@tanstack/react-router';
import { useQueries, useQuery, useSuspenseQuery } from '@tanstack/react-query';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Empty, ParamSegmented } from '@/components/bits';
import { EvalMark } from '@/components/marks';
import { PairingFilters } from '@/components/PairingFilters';
import { PageHeader, PageSection, PageTabs, PageToolbar, type MetaItem } from '@/components/page';
import { SeriesLegend } from '@/components/charts';
import { variantSeries } from '@/lib/chartSeries';
import { variantKey } from '@/lib/series';
import { bestLevelKeys } from '@/lib/score';
import { evalArt, evalBySlug } from '@/lib/evals';
import { evalRunsQuery, indexQuery, runQuery } from '@/data/queries';
import type { Eval, Run } from '@/data/types';
import { formatDate, formatDuration, formatInt } from '@/lib/format';
import { useLegend, type LegendState } from '@/lib/legend';
import { inScope, useDocumentTitle, useEffort, useScope, useScopeUpdate } from '@/lib/search';
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

/** A tooltip on a value, for the one line of how it is known. */
function Hint({ children, hint }: { children: React.ReactNode; hint: React.ReactNode }) {
  return (
    <Tooltip>
      <TooltipTrigger className="cursor-help underline decoration-dotted underline-offset-4">{children}</TooltipTrigger>
      <TooltipContent className="max-w-72">{hint}</TooltipContent>
    </Tooltip>
  );
}

/** "lumbridge.sav" → "Lumbridge": the start saves are named for where they put the character. */
const placeOf = (save: string | null | undefined): string | null =>
  save ? save.replace(/\.sav$/, '').replace(/[_-]+/g, ' ').replace(/^./, c => c.toUpperCase()) : null;

/**
 * What a visitor needs beside the goal: what wins, the budget as game time (its ticks, the charts'
 * unit, on hover), where the characters start, and what has run.
 */
function facts(e: Eval, runs: Run[]): MetaItem[] {
  const place = placeOf(e.start?.save);
  const pairings = new Set(runs.map(variantKey)).size;
  const last = runs.map(r => r.sample_started ?? r.started).sort().pop();
  const score = evalArt(e.id).score;
  const team = e.accounts.length > 1;
  return [
    ...(score ? [{ term: 'Score', value: score }] : []),
    {
      term: e.attempts > 1 ? 'Budget per attempt' : 'Budget',
      value: <Hint hint={`${formatInt(e.budget_ticks)} game ticks`}>{formatDuration((e.budget_ticks * e.tick_ms) / 1000)}</Hint>,
    },
    ...(e.attempts > 1 ? [{ term: 'Attempts', value: formatInt(e.attempts) }] : []),
    ...(place ? [{ term: 'Start', value: team ? `${formatInt(e.accounts.length)} new characters in ${place}` : `A new character in ${place}` }] : []),
    { term: 'Runs', value: <Hint hint={`${formatInt(pairings)} pairings`}>{formatInt(runs.length)}</Hint> },
    ...(last ? [{ term: 'Latest', value: formatDate(last).split(',')[0] }] : []),
  ];
}

// The first view is the race: "Overview" already names the site's home in the sidebar and breadcrumb
const TABS = [
  { value: 'overview', label: 'Race' },
  { value: 'cost', label: 'Cost' },
  { value: 'behaviour', label: 'Behaviour' },
  { value: 'runs', label: 'Runs' },
] as const;

/** One gap between the page's sections: the theme's gutter */
const SECTIONS = 'flex flex-col gap-gutter';

const AGG_OPTIONS = [
  { value: 'median' as const, label: 'Median run', title: "Each pairing's median run" },
  { value: 'best' as const, label: 'Best run', title: "Each pairing's best run" },
  { value: 'runs' as const, label: 'Every run', title: 'Every run' },
];
const PX_OPTIONS = [
  { value: 'cost' as const, label: 'Cost' },
  { value: 'seconds' as const, label: 'Time' },
  { value: 'ticks' as const, label: 'Ticks' },
];

export function EvalPage() {
  const { evalId: slug } = route.useParams();
  const search = route.useSearch();
  const { data } = useSuspenseQuery(indexQuery);
  const e = evalBySlug(data.evals, slug);
  const evalId = e?.id ?? slug;
  const { data: grid } = useQuery(evalRunsQuery(evalId));
  const scope = useScope();
  const effort = useEffort();
  const setScope = useScopeUpdate();
  const urlLegend = useLegend();
  useDocumentTitle(e?.title ?? evalId);

  const all = useMemo(() => data.runs.filter(r => r.eval === evalId), [data, evalId]);
  const scoped = useMemo(() => all.filter(r => inScope(r, scope)), [all, scope]);
  // EthIQ's cut: each model in each harness at every thinking level, or only at its best one here
  const runs = useMemo(() => {
    if (effort === 'all' || !e) return scoped;
    const keep = bestLevelKeys(rankVariants(e, scoped, search.x).map(r => r.variant));
    return scoped.filter(r => keep.has(variantKey(r)));
  }, [scoped, effort, e, search.x]);

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
        <Empty>No eval with this id has runs.</Empty>
      </div>
    );
  }
  const target = e.target != null;
  // The quests strip shows wherever the runs finished quests, whatever the eval measures
  const quests = runs.some(r => r.metrics.quests.length > 0);
  const pending = search.x === 'calls' && details.some(d => d.isPending);
  const maxTick = totalBudgetTicks(e);

  const visibleRuns = runs.filter(r => legend.visible(variantKey(r)));
  const keys = ranked.map(r => variantSeries(r.variant));

  // The race's x measure is its progress chart's own control; the toolbar keeps what drives the whole view
  const controls =
    search.tab === 'overview' ? (
      <ParamSegmented param="agg" value={search.agg} label="Runs shown" options={AGG_OPTIONS} />
    ) : search.tab === 'cost' ? (
      <ParamSegmented param="px" value={search.px} label="Spend" options={PX_OPTIONS} />
    ) : search.tab === 'behaviour' ? (
      <ParamSegmented param="by" value={search.by} label="Group by" options={GROUP_OPTIONS} />
    ) : undefined;

  return (
    <div className={SECTIONS}>
      <PageHeader mark={<EvalMark evalId={e.id} size={40} />} description={e.goal} meta={facts(e, all)} />
      {/* The views and the controls that drive the open one share a row, as shadcn's dashboards do */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <PageTabs value={search.tab} tabs={[...TABS]} />
        <PageToolbar label="View controls">
          {runs.length > 0 && controls}
          <PairingFilters runs={all} thinking={scope.thinking} agent={scope.agent} onChange={setScope} />
        </PageToolbar>
      </div>

      {runs.length === 0 ? (
        <Empty>No runs in this scope.</Empty>
      ) : search.tab === 'overview' ? (
        <>
          <Centerpiece curves={shownCurves} grid={grid} legend={legend} view={search.map} t={search.t} maxTick={maxTick} agg={search.agg} />
          <PageSection title={e.measure} actions={<ParamSegmented param="x" value={search.x} label="Along" options={X_OPTIONS} />}>
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
              below={quests ? frame => <QuestStrip curves={shownCurves} ranked={ranked} x={search.x} frame={frame} focus={legend.focus} t={search.t} /> : undefined}
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
              {/* The key to the points; the race and behaviour views label their own rows */}
              <SeriesLegend series={keys} legend={legend} />
            </PageSection>
            {target && (
              <PageSection title="Finished within">
                <CdfChart e={e} ranked={ranked} cx={search.px} legend={legend} />
              </PageSection>
            )}
          </div>
          {e.attempts > 1 && (
            <PageSection title="Attempts">
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
