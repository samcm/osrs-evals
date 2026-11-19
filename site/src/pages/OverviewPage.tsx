/**
 * `/`: which model in which harness is best, across every eval and at each. The centrepiece, one
 * featured eval in the game, as the page's lead band; then the one leaderboard of pairings by their
 * blended score (lib/score.ts). Hovering a pairing anywhere lights it up in both. The scope narrows which pairings show; their scores are always computed over every run.
 */

import { useMemo } from 'react';
import { getRouteApi } from '@tanstack/react-router';
import { useSuspenseQuery } from '@tanstack/react-query';
import { Empty } from '@/components/bits';
import { PageHeader } from '@/components/page';
import { indexQuery } from '@/data/queries';
import { useLegend } from '@/lib/legend';
import { blendedScores } from '@/lib/score';
import { inScope, useDocumentTitle, useScope, useSearchUpdate } from '@/lib/search';
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
  const legend = useLegend();

  const all = useMemo(() => blendedScores(data.evals, data.runs), [data]);
  const pairings = useMemo(() => all.filter(p => inScope(p.variant, scope)), [all, scope]);
  const runs = useMemo(() => data.runs.filter(r => inScope(r, scope)), [data, scope]);
  const evals = data.evals.filter(e => runs.some(r => r.eval === e.id));
  const fallback = defaultFeatured(evals, pairings);
  const featured = evals.find(e => e.id === search.eval) ?? fallback;

  return (
    <>
      <PageHeader title="Overview" description="Language models playing 2004scape in agent harnesses, ranked across every eval." />
      {pairings.length === 0 || !featured || !fallback ? (
        <Empty>No runs in this scope.</Empty>
      ) : (
        <>
          <Featured
            evals={evals}
            featured={featured}
            fallback={fallback}
            runs={runs}
            pairings={pairings}
            legend={legend}
            onChange={id => update({ eval: id, hide: undefined, focus: undefined })}
          />
          <Leaderboard pairings={pairings} evals={evals} sort={search.sort} onSortChange={sort => update({ sort })} />
        </>
      )}
    </>
  );
}
