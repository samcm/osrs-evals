import { createFileRoute } from '@tanstack/react-router';
import { RunsPage } from '@/pages/RunsPage';
import { pageParam, stringParam, type RunsSearch } from '@/lib/search';

export const Route = createFileRoute('/runs/')({
  validateSearch: (search: Record<string, unknown>): RunsSearch => ({
    eval: stringParam(search.eval),
    model: stringParam(search.model),
    agent: stringParam(search.agent),
    outcome: stringParam(search.outcome),
    sort: stringParam(search.sort),
    page: pageParam(search.page),
  }),
  component: RunsPage,
});
