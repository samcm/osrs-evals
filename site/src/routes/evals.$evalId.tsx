import { createFileRoute } from '@tanstack/react-router';
import { EvalPage } from '@/pages/eval/EvalPage';
import { pageParam } from '@/lib/search';

export const Route = createFileRoute('/evals/$evalId')({
  validateSearch: (search: Record<string, unknown>): { page?: number } => ({ page: pageParam(search.page) }),
  component: EvalPage,
});
