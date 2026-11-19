import { useEffect } from 'react';
import { createRootRouteWithContext, Link, Outlet, retainSearchParams } from '@tanstack/react-router';
import type { QueryClient } from '@tanstack/react-query';
import { Layout } from '@/components/Layout';
import { Empty, linkClassName } from '@/components/bits';
import { indexQuery } from '@/data/queries';
import { RETAINED_PARAMS, rootSearch } from '@/lib/search';
import { setThemeOverride } from '@/lib/theme';

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  // Scope (model, agent, vendor) and the theme override live on the root and ride along on every link
  validateSearch: rootSearch.validate,
  search: { middlewares: [retainSearchParams([...RETAINED_PARAMS]), ...rootSearch.middlewares] },
  loader: ({ context }) => context.queryClient.ensureQueryData(indexQuery),
  component: Root,
  pendingComponent: () => (
    <Layout>
      <Empty>Loading.</Empty>
    </Layout>
  ),
  errorComponent: ({ error }) => (
    <Layout>
      <Empty>This page could not be shown: {error instanceof Error ? error.message : String(error)}</Empty>
    </Layout>
  ),
  notFoundComponent: () => (
    <Empty>
      No page here.{' '}
      <Link to="/" className={linkClassName}>
        Overview
      </Link>
    </Empty>
  ),
});

function Root() {
  const { theme } = Route.useSearch();
  useEffect(() => setThemeOverride(theme), [theme]);
  return (
    <Layout>
      <Outlet />
    </Layout>
  );
}
