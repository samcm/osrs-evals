import { createRootRouteWithContext, Link, Outlet } from '@tanstack/react-router';
import type { QueryClient } from '@tanstack/react-query';
import { Layout } from '@/components/Layout';
import { Empty, linkClassName } from '@/components/bits';
import { indexQuery } from '@/data/queries';

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  loader: ({ context }) => context.queryClient.ensureQueryData(indexQuery),
  component: () => (
    <Layout>
      <Outlet />
    </Layout>
  ),
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
