import { createFileRoute } from '@tanstack/react-router';
import { ModelPage } from '@/pages/model/ModelPage';
import { defineSearch, int, list, sortParam } from '@/lib/search';

export const modelOverviewSearch = defineSearch({
  /** The thinking levels and harnesses shown (this page's own filters, not carried to other pages) */
  level: list(),
  harness: list(),
  /** The runs table's sort and page */
  sort: sortParam(['eval', '-result']),
  page: int(1, { min: 1 }),
});

export const Route = createFileRoute('/models/$model')({
  validateSearch: modelOverviewSearch.validate,
  search: { middlewares: modelOverviewSearch.middlewares },
  component: ModelPage,
});
