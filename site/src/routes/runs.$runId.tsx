import { createFileRoute } from '@tanstack/react-router';
import { RunPage } from '@/pages/run/RunPage';
import { runSearch } from '@/pages/run/search';
import { runQuery } from '@/data/queries';

export const Route = createFileRoute('/runs/$runId')({
  validateSearch: runSearch.validate,
  search: { middlewares: runSearch.middlewares },
  loader: ({ context, params }) => context.queryClient.ensureQueryData(runQuery(params.runId)),
  component: RunPage,
});
