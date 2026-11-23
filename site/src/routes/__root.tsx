import { type JSX, type ReactNode, useEffect, useState } from 'react';
import {
  createRootRouteWithContext,
  Link,
  Outlet,
  retainSearchParams,
  useRouter,
  useRouterState,
  useSearch,
} from '@tanstack/react-router';
import { useQuery, type QueryClient } from '@tanstack/react-query';
import { ThemeProvider } from '@/providers/ThemeProvider';
import { SharedCrosshairsProvider } from '@/providers/SharedCrosshairsProvider';
import { ThemeToggle } from '@/components/Layout/ThemeToggle';
import { Sidebar, PRODUCT_NAME } from '@/components/Layout/Sidebar';
import { Container } from '@/components/Layout/Container';
import { LoadingContainer } from '@/components/Layout/LoadingContainer';
import { Breadcrumb } from '@/components/Navigation/Breadcrumb';
import type { BreadcrumbItem } from '@/components/Navigation/Breadcrumb/Breadcrumb.types';
import { NotFound } from '@/components/Overlays/NotFound';
import { TooltipGroup } from '@/components/Overlays/Tooltip';
import { Alert } from '@/components/Feedback/Alert';
import { VariantLabel } from '@/components/marks';
import { indexQuery } from '@/data/queries';
import { evalArt, evalBySlug, evalIdOf, evalSlug } from '@/lib/evals';
import { setHovered } from '@/lib/hover';
import { RETAINED_PARAMS, rootSearch } from '@/lib/search';
import { modelInfo, modelSlug } from '@/lib/series';

/**
 * Mobile header component with hamburger menu, the product's name, and theme toggle
 */
function MobileHeader({
  sidebarOpen,
  setSidebarOpen,
}: {
  sidebarOpen: boolean;
  setSidebarOpen: (open: boolean) => void;
}): JSX.Element {
  return (
    <div className="fixed inset-x-0 top-0 z-40 flex items-center justify-between border-b border-border bg-background p-4 sm:px-6 lg:hidden">
      <div className="flex min-w-0 items-center gap-x-6">
        <button
          type="button"
          onClick={() => setSidebarOpen(!sidebarOpen)}
          className="group -m-2.5 flex size-10 flex-col items-center justify-center gap-1.5 p-2.5 lg:hidden"
          aria-label="Toggle sidebar"
          aria-pressed={sidebarOpen}
        >
          <span className="sr-only">Toggle sidebar</span>
          <span className="h-0.5 w-6 origin-center rounded-full bg-muted transition-all duration-300 ease-out group-hover:bg-foreground group-aria-pressed:translate-y-2 group-aria-pressed:rotate-45" />
          <span className="h-0.5 w-6 origin-center rounded-full bg-muted transition-all duration-300 ease-out group-hover:bg-foreground group-aria-pressed:opacity-0" />
          <span className="h-0.5 w-6 origin-center rounded-full bg-muted transition-all duration-300 ease-out group-hover:bg-foreground group-aria-pressed:-translate-y-2 group-aria-pressed:-rotate-45" />
        </button>
        <Link to="/" className="truncate font-display text-xl font-bold text-foreground">
          {PRODUCT_NAME}
        </Link>
      </div>
      <ThemeToggle />
    </div>
  );
}

/**
 * The page's name: "Home", "Compare", "Runs", an eval's title, a model under its eval, or a run
 * under its eval as its pairing with its marks. A model or run under an eval keeps the eval on a
 * phone: the last crumb alone doesn't say which page this is.
 */
function useCrumbs(): BreadcrumbItem[] {
  const pathname = useRouterState({ select: s => s.location.pathname });
  const { data } = useQuery(indexQuery);
  const [section, id, sub] = pathname.split('/').filter(Boolean).map(decodeURIComponent);
  if (!section) return [{ label: 'Home' }];
  if (section === 'evals' && id) {
    const e = data && evalBySlug(data.evals, id);
    const title = e?.title ?? evalArt(evalIdOf(id)).title ?? id;
    if (!sub) return [{ label: title }];
    const run = data?.runs.find(r => modelSlug(r.model) === modelSlug(sub));
    return [
      { label: title, to: '/evals/$evalId', params: { evalId: evalSlug(id) }, keep: true },
      { label: run ? modelInfo(run.model).short : sub },
    ];
  }
  if (section === 'runs' && id) {
    const run = data?.runs.find(r => r.id === id);
    const e = run && data?.evals.find(x => x.id === run.eval);
    return [
      ...(e ? [{ label: e.title, to: '/evals/$evalId', params: { evalId: evalSlug(e.id) }, keep: true }] : []),
      { label: run ? <VariantLabel run={run} /> : id },
    ];
  }
  if (section === 'models' && id) {
    const run = data?.runs.find(r => modelSlug(r.model) === modelSlug(id));
    return [{ label: run ? modelInfo(run.model).name : id }];
  }
  const names: Record<string, string> = { runs: 'Runs', compare: 'Compare' };
  return [{ label: names[section] ?? section }];
}

const SIDEBAR_COLLAPSED_KEY = 'sidebar-collapsed';

/**
 * The app's shell, as lab's root layout: the sidebar (a drawer under the mobile header below lg),
 * the sticky breadcrumb bar naming the page, and the page in a Container, a column of cards.
 */
function Shell({ children }: { children: ReactNode }): JSX.Element {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(
    () => localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === 'true'
  );
  const router = useRouter();
  const { theme: themeOverride } = useSearch({ from: '__root__' });
  const crumbs = useCrumbs();

  // Persist sidebar collapsed state
  useEffect(() => {
    localStorage.setItem(SIDEBAR_COLLAPSED_KEY, String(sidebarCollapsed));
  }, [sidebarCollapsed]);

  // A new page closes the drawer and clears the page's hover
  useEffect(
    () =>
      router.subscribe('onBeforeLoad', event => {
        if (event.pathChanged) {
          setSidebarOpen(false);
          setHovered(undefined);
        }
      }),
    [router]
  );

  return (
    <ThemeProvider themeOverride={themeOverride}>
      <SharedCrosshairsProvider>
        <TooltipGroup>
          <div className="bg-background">
            {/* Sidebar (mobile + desktop) */}
            <Sidebar
              sidebarOpen={sidebarOpen}
              setSidebarOpen={setSidebarOpen}
              collapsed={sidebarCollapsed}
              setCollapsed={setSidebarCollapsed}
            />

            {/* Mobile header */}
            <MobileHeader sidebarOpen={sidebarOpen} setSidebarOpen={setSidebarOpen} />

            {/* Main content */}
            <main
              className={`min-w-0 bg-background pt-16.25 transition-all duration-200 lg:min-h-dvh lg:pt-0 ${sidebarCollapsed ? 'lg:pl-14' : 'lg:pl-56'}`}
            >
              <div className="z-20 flex h-12 items-center border-b border-border bg-background px-4 sm:px-6 lg:sticky lg:top-0 lg:px-8">
                <Breadcrumb items={crumbs} />
              </div>
              <Container className="flex min-w-0 flex-col gap-6">{children}</Container>
            </main>
          </div>
        </TooltipGroup>
      </SharedCrosshairsProvider>
    </ThemeProvider>
  );
}

function RootComponent(): JSX.Element {
  return (
    <Shell>
      <Outlet />
    </Shell>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  // Scope (model, agent, vendor, thinking) and the theme override live on the root and ride along on every link
  validateSearch: rootSearch.validate,
  search: { middlewares: [retainSearchParams([...RETAINED_PARAMS]), ...rootSearch.middlewares] },
  loader: ({ context }) => context.queryClient.ensureQueryData(indexQuery),
  component: RootComponent,
  pendingComponent: () => (
    <Shell>
      <LoadingContainer className="h-96 rounded-sm" />
    </Shell>
  ),
  errorComponent: ({ error }) => (
    <Shell>
      <Alert
        variant="error"
        title="This page could not be shown"
        description={error instanceof Error ? error.message : String(error)}
      />
    </Shell>
  ),
  notFoundComponent: NotFound,
});
