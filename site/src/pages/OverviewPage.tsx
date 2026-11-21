/**
 * `/`: which model in which harness is best, across every eval and at each. The answer leads (with
 * the featured eval beside it from 2xl, under it below that, so every eval column fits): the one leaderboard of pairings by their blended score (lib/score.ts),
 * a cell per eval, ten to a page; beside it one featured eval, its best run in the game over every
 * pairing's median progress. Hovering a pairing anywhere lights it up in both. The scope narrows
 * which pairings show; their scores are always computed over every run.
 */

import { useMemo } from 'react';
import { getRouteApi } from '@tanstack/react-router';
import { useSuspenseQuery } from '@tanstack/react-query';
import { Empty } from '@/components/bits';
import { PageToolbar } from '@/components/page';
import { PairingFilters } from '@/components/PairingFilters';
import { indexQuery } from '@/data/queries';
import { useLegend } from '@/lib/legend';
import { bestLevelKeys, blendedScores } from '@/lib/score';
import { inScope, useDocumentTitle, useEffort, useScope, useScopeUpdate, useSearchUpdate } from '@/lib/search';
import { variantKey } from '@/lib/series';
import { evalBySlug, evalSlug } from '@/lib/evals';
import { defaultFeatured, overviewSearch } from './overview/search';
import { Featured } from './overview/Featured';
import { Leaderboard } from './overview/Leaderboard';

const route = getRouteApi('/');

export function OverviewPage() {
  useDocumentTitle(undefined);
  const { data } = useSuspenseQuery(indexQuery);
  const search = route.useSearch();
  const update = useSearchUpdate(overviewSearch);
  const scope = useScope();
  const setScope = useScopeUpdate();
  const effort = useEffort();
  const legend = useLegend();

  const all = useMemo(() => blendedScores(data.evals, data.runs), [data]);
  // EthIQ's cut: every thinking level, or each model in each harness at its best blended score
  const pairings = useMemo(() => {
    const scoped = all.filter(p => inScope(p.variant, scope));
    if (effort === 'all') return scoped;
    const keep = bestLevelKeys(scoped.map(p => p.variant));
    return scoped.filter(p => keep.has(p.variant.key));
  }, [all, scope, effort]);
  const runs = useMemo(() => {
    const keys = new Set(pairings.map(p => p.variant.key));
    return data.runs.filter(r => keys.has(variantKey(r)));
  }, [data, pairings]);
  const evals = data.evals.filter(e => runs.some(r => r.eval === e.id));
  const fallback = defaultFeatured(evals, pairings);
  const featured = (search.eval ? evalBySlug(evals, search.eval) : undefined) ?? fallback;

  return (
    <>
      <PageToolbar label="Filters">
        <PairingFilters runs={data.runs} thinking={scope.thinking} agent={scope.agent} onChange={setScope} />
      </PageToolbar>
      {pairings.length === 0 || !featured || !fallback ? (
        <Empty>No runs in this scope.</Empty>
      ) : (
        <>
          <div className="grid gap-gutter 2xl:grid-cols-12">
            <Leaderboard
              pairings={pairings}
              evals={evals}
              sort={search.sort}
              onSortChange={sort => update({ sort, page: undefined })}
              page={search.page}
              onPageChange={page => update({ page })}
            />
            <Featured
              evals={evals}
              featured={featured}
              fallback={fallback}
              runs={runs}
              pairings={pairings}
              legend={legend}
              onChange={id => update({ eval: id && evalSlug(id), hide: undefined, focus: undefined })}
            />
          </div>
        </>
      )}
    </>
  );
}
