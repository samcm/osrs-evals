import { createFileRoute } from '@tanstack/react-router';
import { ComparePage } from '@/pages/compare/ComparePage';
import { compareSearch } from '@/pages/compare/search';

export { compareSearch };

export const Route = createFileRoute('/compare')({
  validateSearch: compareSearch.validate,
  search: { middlewares: compareSearch.middlewares },
  component: ComparePage,
});
