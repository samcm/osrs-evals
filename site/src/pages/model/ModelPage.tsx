/**
 * `/evals/$evalId/$model`: how one model did on one eval, across every thinking level and harness it
 * ran at. Its runs race in the game, then how the result and cost change with thinking level (each
 * harness a series), the runs' progress over time, and the runs table. Filtered by thinking level
 * and harness (`level`, `harness`), which a leaderboard row presets.
 */

import { useMemo } from 'react';
import { getRouteApi } from '@tanstack/react-router';
import { useQuery, useSuspenseQuery } from '@tanstack/react-query';
import { Empty, ParamSegmented } from '@/components/bits';
import { BrandMark, HarnessMark, ThinkingLevel } from '@/components/marks';
import { PairingFilters } from '@/components/PairingFilters';
import { PageHeader, PageSection, PageToolbar, type MetaItem } from '@/components/page';
import { evalRunsQuery, indexQuery } from '@/data/queries';
import type { Run } from '@/data/types';
import { evalBySlug } from '@/lib/evals';
import { formatCost, formatInt } from '@/lib/format';
import { useLegend } from '@/lib/legend';
import { resultValue } from '@/lib/runResult';
import { inScope, useDocumentTitle, useScope, useSearchUpdate } from '@/lib/search';
import { compareThinking, modelInfo, modelSlug, thinkingOf } from '@/lib/series';
import { median } from '@/lib/stats';
import { Centerpiece } from '../eval/Centerpiece';
import { buildCurves, rankVariants, totalBudgetTicks, X_OPTIONS, xRange } from '../eval/model';
import { ProgressChart } from '../eval/Progress';
import { RunsTable } from '../eval/RunsTable';
import { harnessSeries, ThinkingChart } from './ThinkingChart';

const route = getRouteApi('/evals/$evalId_/$model');

/** One gap between the page's sections: the theme's gutter */
const SECTIONS = 'flex flex-col gap-gutter';

/** What ran: the harnesses as their marks, the thinking levels, and the result and cost over every run. */
function facts(runs: Run[], target: number | null, measure: string): MetaItem[] {
  const harnesses = [...new Map(runs.map(r => [r.agent, r])).values()];
  const levels = [...new Set(runs.map(thinkingOf))].sort(compareThinking);
  const results = runs.map(resultValue).filter((v): v is number => v != null);
  return [
    { term: 'Runs', value: formatInt(runs.length) },
    {
      term: 'Harnesses',
      value: (
        <span className="inline-flex items-center gap-1.5 align-middle">
          {harnesses.map(r => (
            <HarnessMark key={r.agent} agent={r.agent} fallback={r.agent_name} size={16} className="bg-foreground" />
          ))}
        </span>
      ),
    },
    {
      term: 'Thinking',
      value: (
        <span className="inline-flex items-center gap-2 align-middle">
          {levels.map(l => (
            <ThinkingLevel key={l} level={l} />
          ))}
        </span>
      ),
    },
    target != null
      ? { term: 'Finished', value: `${formatInt(runs.filter(r => r.success).length)} of ${formatInt(runs.length)}` }
      : { term: `Median ${measure.toLowerCase()}`, value: formatInt(median(results)) },
    { term: 'Median cost', value: formatCost(median(runs.map(r => r.cost))) },
  ];
}

export function ModelPage() {
  const { evalId: slug, model } = route.useParams();
  const search = route.useSearch();
  const update = useSearchUpdate();
  const { data } = useSuspenseQuery(indexQuery);
  const e = evalBySlug(data.evals, slug);
  const { data: grid } = useQuery(evalRunsQuery(e?.id ?? slug));
  const scope = useScope();
  const legend = useLegend();

  // Every run of this model on this eval, then this page's filters
  const all = useMemo(() => data.runs.filter(r => r.eval === e?.id && modelSlug(r.model) === model && inScope(r, scope)), [data, e, model, scope]);
  const runs = useMemo(
    () => all.filter(r => (search.level.length === 0 || search.level.includes(thinkingOf(r))) && (search.harness.length === 0 || search.harness.includes(r.agent))),
    [all, search.level, search.harness]
  );
  const info = modelInfo(all[0]?.model ?? model);
  useDocumentTitle(e ? `${info.name}, ${e.title}` : undefined);

  const curves = useMemo(() => (e ? buildCurves(e, grid, runs, new Map()) : []), [e, grid, runs]);
  const ranked = useMemo(() => (e ? rankVariants(e, runs, search.x) : []), [e, runs, search.x]);
  const range = useMemo(() => (e ? xRange(e, curves, search.x) : null), [e, curves, search.x]);
  const levels = useMemo(() => [...new Set(runs.map(thinkingOf))].sort(compareThinking), [runs]);
  const series = useMemo(() => harnessSeries(runs), [runs]);

  if (!e || all.length === 0) {
    return (
      <div className={SECTIONS}>
        <Empty>{e ? `${info.name} has no runs on ${e.title}.` : 'No eval with this id has runs.'}</Empty>
      </div>
    );
  }
  const target = e.target != null;

  return (
    <div className={SECTIONS}>
      <PageHeader mark={<BrandMark slug={info.vendor.slug} size={40} title={info.vendor.name} />} meta={facts(runs, e.target, e.measure)} />
      <PageToolbar label="Filters">
        <PairingFilters
          runs={all}
          effort={false}
          thinking={search.level}
          agent={search.harness}
          onChange={patch => update({ ...(patch.thinking && { level: patch.thinking }), ...(patch.agent && { harness: patch.agent }) }, { resetPage: true })}
        />
      </PageToolbar>
      {runs.length === 0 ? (
        <Empty>No runs match these filters.</Empty>
      ) : (
        <>
          <Centerpiece curves={curves} grid={grid} legend={legend} view={search.map} t={search.t} maxTick={totalBudgetTicks(e)} agg="runs" />
          <div className={`grid gap-gutter ${target ? 'xl:grid-cols-3' : 'xl:grid-cols-2'}`}>
            <PageSection title={`${e.measure} by thinking level`}>
              <ThinkingChart e={e} runs={runs} y="result" levels={levels} series={series} />
            </PageSection>
            {target && (
              <PageSection title="Ticks to finish by thinking level">
                <ThinkingChart e={e} runs={runs} y="ticks" levels={levels} series={series} />
              </PageSection>
            )}
            <PageSection title="Cost by thinking level">
              <ThinkingChart e={e} runs={runs} y="cost" levels={levels} series={series} />
            </PageSection>
          </div>
          <PageSection title={e.measure} actions={<ParamSegmented param="x" value={search.x} label="Along" options={X_OPTIONS.filter(o => o.value !== 'calls')} />}>
            <ProgressChart e={e} curves={curves} ranked={ranked} x={search.x} agg="runs" range={range!} legend={legend} pending={false} t={search.t} />
          </PageSection>
          <PageSection title="Runs">
            <RunsTable e={e} runs={runs} curves={curves} sort={search.sort} page={search.page} />
          </PageSection>
        </>
      )}
    </div>
  );
}
