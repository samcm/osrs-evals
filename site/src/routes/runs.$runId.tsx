import { createFileRoute } from '@tanstack/react-router';
import { RunPage } from '@/pages/run/RunPage';
import { runQuery } from '@/data/queries';

export const Route = createFileRoute('/runs/$runId')({
  loader: ({ context, params }) => context.queryClient.ensureQueryData(runQuery(params.runId)),
  component: RunPage,
});
