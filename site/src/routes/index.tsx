import { createFileRoute } from '@tanstack/react-router';
import { OverviewPage } from '@/pages/OverviewPage';
import { overviewSearch } from '@/pages/overview/search';

export const Route = createFileRoute('/')({
  validateSearch: overviewSearch.validate,
  search: { middlewares: overviewSearch.middlewares },
  component: OverviewPage,
});
