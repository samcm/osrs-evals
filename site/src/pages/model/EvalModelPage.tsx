/**
 * `/evals/$evalId/$model`: how one model did on one eval, across every thinking level and harness it
 * ran at. Its runs race in the game, then how the result and cost change with thinking level (each
 * harness a series), the runs' progress over time, and the runs table. Filtered by thinking level
 * and harness (`level`, `harness`), which a leaderboard row presets.
 */

import { useMemo, type JSX } from 'react';
import { getRouteApi, Link } from '@tanstack/react-router';
import { useQuery, useSuspenseQuery } from '@tanstack/react-query';
import { Empty, ParamSegmented } from '@/components/bits';
import { buttonClassName } from '@/components/Elements/Button';
import { BrandMark } from '@/components/marks';
import { PairingFilters } from '@/components/PairingFilters';
import { PageHeader, PageSection, PageToolbar, type MetaItem } from '@/components/page';
import { evalRunsQuery, indexQuery } from '@/data/queries';
import type { Run } from '@/data/types';
import { evalBySlug } from '@/lib/evals';
import { formatCost, formatInt } from '@/lib/format';
import { useLegend } from '@/lib/legend';
import { resultValue } from '@/lib/runResult';
import { inScope, useDocumentTitle, useScope, useSearchUpdate } from '@/lib/search';
import { compareThinking, modelFacts, modelInfo, modelSlug } from '@/lib/series';
import { median } from '@/lib/stats';
import { blendedScores, modelRank } from '@/lib/score';
import { Centerpiece } from '@/pages/eval/Centerpiece';
import { buildCurves, rankVariants, totalBudgetTicks, X_OPTIONS, xRange } from '@/pages/eval/model';
import { ProgressChart } from '@/pages/eval/Progress';
import { RunsTable } from '@/pages/eval/RunsTable';
import { evalMeasure, harnessSeries } from '@/pages/model/measures';
import { ThinkingChart } from '@/pages/model/ThinkingChart';

const route = getRouteApi('/evals/$evalId_/$model');

/** One gap between the page's sections: the theme's gutter */
const SECTIONS = 'flex flex-col gap-gutter';

/**
 * How it did here, once each: its place among the models on this eval (by each model's best
 * pairing), how many finished or its median result, the median cost and how many runs. The
 * standings below name each pairing with its level and harness.
 */
function facts(
  runs: Run[],
  target: number | null,
  measure: string,
  rank: { rank: number; of: number } | null
): MetaItem[] {
  const results = runs.map(resultValue).filter((v): v is number => v != null);
  return [
    ...(rank ? [{ term: 'Place', value: `#${formatInt(rank.rank)} of ${formatInt(rank.of)}` }] : []),
    target != null
      ? { term: 'Finished', value: `${formatInt(runs.filter(r => r.success).length)} of ${formatInt(runs.length)}` }
      : { term: `Median ${measure.toLowerCase()}`, value: formatInt(median(results)) },
    { term: 'Median cost', value: formatCost(median(runs.map(r => r.cost))) },
    { term: 'Runs', value: formatInt(runs.length) },
  ];
}

export function EvalModelPage(): JSX.Element {
  const { evalId: slug, model } = route.useParams();
  const search = route.useSearch();
  const update = useSearchUpdate();
  const { data } = useSuspenseQuery(indexQuery);
  const e = evalBySlug(data.evals, slug);
  const { data: grid } = useQuery(evalRunsQuery(e?.id ?? slug));
  const scope = useScope();
  const legend = useLegend();

  // Every run of this model on this eval, then this page's filters
  const all = useMemo(
    () => data.runs.filter(r => r.eval === e?.id && modelSlug(r.model) === modelSlug(model) && inScope(r, scope)),
    [data, e, model, scope]
  );
  const runs = useMemo(
    () =>
      all.filter(
        r =>
          (search.level.length === 0 || search.level.includes(r.thinking)) &&
          (search.harness.length === 0 || search.harness.includes(r.agent))
      ),
    [all, search.level, search.harness]
  );
  const info = modelInfo(all[0]?.model ?? model);
  useDocumentTitle(e ? `${info.name}, ${e.title}` : undefined);

  const curves = useMemo(() => (e ? buildCurves(e, grid, runs, new Map()) : []), [e, grid, runs]);
  // Every model's runs on the eval, for the field's median under this model's lines
  const field = useMemo(
    () =>
      e
        ? buildCurves(
            e,
            grid,
            data.runs.filter(r => r.eval === e.id && inScope(r, scope)),
            new Map()
          )
        : [],
    [e, grid, data, scope]
  );
  const ranked = useMemo(() => (e ? rankVariants(e, runs, search.x) : []), [e, runs, search.x]);
  const range = useMemo(() => (e ? xRange(e, curves, search.x) : null), [e, curves, search.x]);
  const levels = useMemo(() => [...new Set(runs.map(r => r.thinking))].sort(compareThinking), [runs]);
  const series = useMemo(() => harnessSeries(runs), [runs]);
  const pairingsAll = useMemo(() => blendedScores(data.evals, data.runs), [data]);

  if (!e || all.length === 0) {
    return (
      <div className={SECTIONS}>
        <Empty>{e ? `${info.name} has no runs on ${e.title}.` : 'No eval with this id has runs.'}</Empty>
      </div>
    );
  }
  const target = e.target != null;
  const rank = modelRank(pairingsAll, blendedScores(data.evals, runs), e, all[0].model);

  return (
    <div className={SECTIONS}>
      <PageHeader
        mark={<BrandMark slug={info.vendor.slug} size={40} title={info.vendor.name} />}
        meta={facts(runs, e.target, e.measure, rank)}
        actions={
          <Link
            to="/models/$model"
            params={{ model: modelSlug(all[0].model) }}
            className={buttonClassName({ variant: 'secondary', size: 'sm' })}
          >
            Every eval
          </Link>
        }
      />
      <PageToolbar label="Filters">
        <PairingFilters
          runs={all}
          levels={modelFacts(all[0].model)?.levels}
          effort={false}
          thinking={search.level}
          agent={search.harness}
          onChange={patch =>
            update(
              { ...(patch.thinking && { level: patch.thinking }), ...(patch.agent && { harness: patch.agent }) },
              { resetPage: true }
            )
          }
        />
      </PageToolbar>
      {runs.length === 0 ? (
        <Empty>No runs match these filters.</Empty>
      ) : (
        <>
          <Centerpiece
            e={e}
            runs={runs}
            curves={curves}
            grid={grid}
            legend={legend}
            view={search.map}
            t={search.t}
            maxTick={totalBudgetTicks(e)}
            agg="runs"
          />
          {/* Thinking levels side by side only when it ran at more than one */}
          {levels.length > 1 && (
            <div className={`grid gap-gutter ${target ? 'xl:grid-cols-3' : 'xl:grid-cols-2'}`}>
              <PageSection title={`${e.measure} by thinking level`}>
                <ThinkingChart runs={runs} measure={evalMeasure(e, 'result')} levels={levels} series={series} />
              </PageSection>
              {target && (
                <PageSection title="Ticks to finish by thinking level">
                  <ThinkingChart runs={runs} measure={evalMeasure(e, 'ticks')} levels={levels} series={series} />
                </PageSection>
              )}
              <PageSection title="Cost by thinking level">
                <ThinkingChart runs={runs} measure={evalMeasure(e, 'cost')} levels={levels} series={series} />
              </PageSection>
            </div>
          )}
          <PageSection
            title={e.measure}
            description="In grey, every model's median"
            actions={
              <ParamSegmented
                param="x"
                value={search.x}
                label="Along"
                options={X_OPTIONS.filter(o => o.value !== 'calls')}
              />
            }
          >
            <ProgressChart
              e={e}
              curves={curves}
              ranked={ranked}
              x={search.x}
              agg="runs"
              range={range!}
              legend={legend}
              pending={false}
              t={search.t}
              field={field}
            />
          </PageSection>
          <PageSection title="Runs">
            <RunsTable e={e} runs={runs} curves={curves} sort={search.sort} page={search.page} />
          </PageSection>
        </>
      )}
    </div>
  );
}
