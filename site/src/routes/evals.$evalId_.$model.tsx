import { createFileRoute, redirect } from '@tanstack/react-router';
import { EvalModelPage } from '@/pages/model/EvalModelPage';
import { evalRunsQuery } from '@/data/queries';
import { evalIdOf, evalSlug } from '@/lib/evals';
import { mapViewParam } from '@/lib/map';
import { defineSearch, int, legendParams, list, oneOf, sortParam } from '@/lib/search';

export const modelSearch = defineSearch({
  /** The thinking levels and harnesses shown (this page's own filters, not carried to other pages) */
  level: list(),
  harness: list(),
  /** The progress chart's x measure */
  x: oneOf(['ticks', 'seconds', 'cost'], 'ticks'),
  /** The race's map view and playhead */
  map: mapViewParam(),
  t: int(undefined, { min: 0 }),
  sort: sortParam(['-result']),
  page: int(1, { min: 1 }),
  ...legendParams,
});

export const Route = createFileRoute('/evals/$evalId_/$model')({
  validateSearch: modelSearch.validate,
  search: { middlewares: modelSearch.middlewares },
  beforeLoad: ({ params, search }) => {
    if (params.evalId !== evalSlug(params.evalId))
      throw redirect({ to: '/evals/$evalId/$model', params: { evalId: evalSlug(params.evalId), model: params.model }, search: search as never, replace: true });
  },
  loader: ({ context, params }) => void context.queryClient.prefetchQuery(evalRunsQuery(evalIdOf(params.evalId))),
  component: EvalModelPage,
});
