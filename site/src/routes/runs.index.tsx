import { createFileRoute } from '@tanstack/react-router';
import { RunsPage } from '@/pages/RunsPage';
import { defineSearch, int, oneOf, sortParam, text } from '@/lib/search';

export const runsSearch = defineSearch({
  eval: text(),
  outcome: oneOf(['finished', 'not_finished', 'scored'], undefined),
  sort: sortParam(['-started']),
  page: int(1, { min: 1 }),
});

export const Route = createFileRoute('/runs/')({
  validateSearch: runsSearch.validate,
  search: { middlewares: runsSearch.middlewares },
  component: RunsPage,
});
