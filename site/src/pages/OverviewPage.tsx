/**
 * `/`: which model in which harness is best, across every eval and at each: the one leaderboard of
 * pairings by their blended score (lib/score.ts), the page's full width, a cell per eval. The scope
 * narrows which pairings show; their scores are always computed over every run.
 */

import { useMemo, type JSX } from 'react';
import { getRouteApi } from '@tanstack/react-router';
import { useSuspenseQuery } from '@tanstack/react-query';
import { Empty } from '@/components/bits';
import { PageToolbar } from '@/components/page';
import { PairingFilters } from '@/components/PairingFilters';
import { indexQuery } from '@/data/queries';
import { bestLevelKeys, blendedScores } from '@/lib/score';
import { inScope, useDocumentTitle, useEffort, useScope, useScopeUpdate, useSearchUpdate } from '@/lib/search';
import { overviewSearch } from './overview/search';
import { Leaderboard } from './overview/Leaderboard';
import { Intro } from './overview/Intro';

const route = getRouteApi('/');

export function OverviewPage(): JSX.Element {
  useDocumentTitle(undefined);
  const { data } = useSuspenseQuery(indexQuery);
  const search = route.useSearch();
  const update = useSearchUpdate(overviewSearch);
  const scope = useScope();
  const setScope = useScopeUpdate();
  const effort = useEffort();

  const all = useMemo(() => blendedScores(data.evals, data.runs), [data]);
  // EthIQ's cut: every thinking level, or each model in each harness at its best blended score
  const pairings = useMemo(() => {
    const scoped = all.filter(p => inScope(p.variant, scope));
    if (effort === 'all') return scoped;
    const keep = bestLevelKeys(scoped.map(p => p.variant));
    return scoped.filter(p => keep.has(p.variant.key));
  }, [all, scope, effort]);
  const evals = data.evals.filter(e => pairings.some(p => p.evals.has(e.id)));

  return (
    <>
      <Intro />
      <PageToolbar label="Filters">
        <PairingFilters runs={data.runs} thinking={scope.thinking} agent={scope.agent} onChange={setScope} />
      </PageToolbar>
      {pairings.length === 0 ? (
        <Empty>No runs in this scope.</Empty>
      ) : (
        <Leaderboard
          pairings={pairings}
          evals={evals}
          sort={search.sort}
          onSortChange={sort => update({ sort, page: undefined })}
          page={search.page}
          onPageChange={page => update({ page })}
        />
      )}
    </>
  );
}
