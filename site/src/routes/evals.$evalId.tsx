import { createFileRoute } from '@tanstack/react-router';
import { EvalPage } from '@/pages/eval/EvalPage';
import { defineSearch, int } from '@/lib/search';

export const evalSearch = defineSearch({ page: int(1, { min: 1 }) });

export const Route = createFileRoute('/evals/$evalId')({
  validateSearch: evalSearch.validate,
  search: { middlewares: evalSearch.middlewares },
  component: EvalPage,
});
