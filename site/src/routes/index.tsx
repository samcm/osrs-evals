import { createFileRoute } from '@tanstack/react-router';
import { OverviewPage } from '@/pages/OverviewPage';
import { defineSearch, legendParams, oneOf, sortParam } from '@/lib/search';

export const overviewSearch = defineSearch({
  /** Grid rows: "variant" (name) or an eval id, "-" for descending */
  sort: sortParam([]),
  /** Group grid rows under their model or agent */
  by: oneOf(['model', 'agent'], undefined),
  /** The progress charts' x measure */
  x: oneOf(['ticks', 'seconds', 'cost'], 'ticks'),
  ...legendParams,
});

export const Route = createFileRoute('/')({
  validateSearch: overviewSearch.validate,
  search: { middlewares: overviewSearch.middlewares },
  component: OverviewPage,
});
