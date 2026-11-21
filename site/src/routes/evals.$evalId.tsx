import { createFileRoute, redirect } from '@tanstack/react-router';
import { EvalPage } from '@/pages/eval/EvalPage';
import { evalRunsQuery } from '@/data/queries';
import { evalIdOf, evalSlug } from '@/lib/evals';
import { mapViewParam } from '@/lib/map';
import { defineSearch, int, legendParams, oneOf, sortParam } from '@/lib/search';

export const evalSearch = defineSearch({
  /** The page's view */
  tab: oneOf(['overview', 'cost', 'behaviour', 'runs'], 'overview'),
  /** The overview's x measure, and which runs it shows: each pairing's median or best run, or every run */
  x: oneOf(['ticks', 'seconds', 'cost', 'calls'], 'ticks'),
  agg: oneOf(['median', 'best', 'runs'], 'median'),
  /** The cost tab's spend: what the Pareto and the finished-within chart count */
  px: oneOf(['cost', 'seconds', 'ticks'], 'cost'),
  /** Grouping of the time and effort cuts */
  by: oneOf(['variant', 'model', 'agent'], 'variant'),
  /** The map's view and the tick its dots mark */
  map: mapViewParam(),
  t: int(undefined, { min: 0 }),
  sort: sortParam(['-result', 'ticks']),
  page: int(1, { min: 1 }),
  /** Hidden and isolated variants, by variant key */
  ...legendParams,
});

export const Route = createFileRoute('/evals/$evalId')({
  validateSearch: evalSearch.validate,
  search: { middlewares: evalSearch.middlewares },
  // The eval's URL is its kebab-case slug: an old snake-case link moves there
  beforeLoad: ({ params, search }) => {
    if (params.evalId !== evalSlug(params.evalId)) throw redirect({ to: '/evals/$evalId', params: { evalId: evalSlug(params.evalId) }, search: search as never, replace: true });
  },
  // Start loading the overlays early; the page shows its header while they arrive
  loader: ({ context, params }) => void context.queryClient.prefetchQuery(evalRunsQuery(evalIdOf(params.evalId))),
  component: EvalPage,
});
