import { createFileRoute } from '@tanstack/react-router';
import { RunsPage } from '@/pages/RunsPage';
import { defineSearch, int, list, sortParam, text } from '@/lib/search';

export const runsSearch = defineSearch({
  q: text(),
  eval: list(),
  outcome: list(['finished', 'not_finished', 'scored']),
  batch: list(),
  sort: sortParam(['-started']),
  page: int(1, { min: 1 }),
});

export const Route = createFileRoute('/runs/')({
  validateSearch: runsSearch.validate,
  search: { middlewares: runsSearch.middlewares },
  component: RunsPage,
});
