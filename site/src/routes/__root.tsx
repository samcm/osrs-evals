import { type JSX, type ReactNode, useEffect, useState } from 'react';
import {
  createRootRouteWithContext,
  Outlet,
  retainSearchParams,
  useRouter,
  useRouterState,
  useSearch,
} from '@tanstack/react-router';
import { useQuery, type QueryClient } from '@tanstack/react-query';
import { Bars2Icon, XMarkIcon } from '@heroicons/react/24/outline';
import { ThemeProvider } from '@/providers/ThemeProvider';
import { ThemeToggle } from '@/components/Layout/ThemeToggle';
import { Sidebar, Wordmark } from '@/components/Layout/Sidebar';
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
 * The mobile header: the menu button, the wordmark and the theme toggle, on the sidebar's colour
 * so the drawer opens from it as one panel.
 */
function MobileHeader({
  sidebarOpen,
  setSidebarOpen,
}: {
  sidebarOpen: boolean;
  setSidebarOpen: (open: boolean) => void;
}): JSX.Element {
  const Icon = sidebarOpen ? XMarkIcon : Bars2Icon;
  return (
    <div className="fixed inset-x-0 top-0 z-40 flex h-14 items-center justify-between gap-x-3 border-b border-border bg-sidebar px-2 sm:px-4 lg:hidden">
      <div className="flex min-w-0 items-center gap-x-2">
        <button
          type="button"
          onClick={() => setSidebarOpen(!sidebarOpen)}
          className="flex size-10 shrink-0 items-center justify-center rounded-sm text-muted transition-colors hover:text-foreground"
          aria-label="Toggle sidebar"
          aria-pressed={sidebarOpen}
        >
          <Icon className="size-6" />
        </button>
        <Wordmark />
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
 * The app's shell: the sidebar (a drawer under the mobile header below lg), the sticky header bar
 * (the breadcrumb naming the page, the theme toggle from lg), and the page in a Container, a column
 * of cards.
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
            className={`min-w-0 bg-background pt-14 transition-all duration-200 lg:min-h-dvh lg:pt-0 ${sidebarCollapsed ? 'lg:pl-14' : 'lg:pl-56'}`}
          >
            {/* The header bar: the breadcrumb, and from lg the theme toggle (the mobile header has it below) */}
            <div className="z-20 flex h-12 items-center justify-between gap-x-4 border-b border-border bg-background px-4 sm:px-6 lg:sticky lg:top-0 lg:px-8">
              <Breadcrumb items={crumbs} />
              <div className="max-lg:hidden">
                <ThemeToggle />
              </div>
            </div>
            <Container className="flex min-w-0 flex-col gap-6">{children}</Container>
          </main>
        </div>
      </TooltipGroup>
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
      <LoadingContainer className="h-96 rounded-md" />
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
