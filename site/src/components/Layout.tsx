/**
 * The app shell as shadcn's dashboard (dashboard-01): an inset Sidebar with the wordmark, then Home,
 * Compare and Runs, then the evals with their sprites (and a filter once the list is long); on small
 * screens the sidebar is a sheet behind SidebarTrigger. The header bar holds the trigger, the
 * Breadcrumb (the only place a page is named; it never loses its last crumb) and the theme toggle.
 */

import { useEffect, useState, type ReactNode } from 'react';
import { ChartScatter, House, ListVideo, Moon, Sun } from 'lucide-react';
import { Link, useRouter, useRouterState } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';
import { cn } from '@/lib/utils';
import { indexQuery } from '@/data/queries';
import type { Eval } from '@/data/types';
import { setHovered } from '@/lib/hover';
import { useSearchUpdate } from '@/lib/search';
import { variantOf } from '@/lib/series';
import { setTheme, useTheme, type Theme } from '@/lib/theme';
import { Button } from '@/components/ui/button';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb';
import { Separator } from '@/components/ui/separator';
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInput,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarRail,
  SidebarTrigger,
  useSidebar,
} from '@/components/ui/sidebar';
import { EvalMark, Sprite, VariantLabel } from './marks';

/**
 * The nav item the current page belongs to, as its path: a run belongs to its eval (as its
 * breadcrumb says), everything else to its first path segment.
 */
function useActivePath(): string {
  const pathname = useRouterState({ select: st => st.location.pathname });
  const { data } = useQuery(indexQuery);
  const [section, id] = pathname.split('/').filter(Boolean).map(decodeURIComponent);
  if (!section) return '/';
  if (section === 'runs' && id) {
    const run = data?.runs.find(r => r.id === id);
    return run ? `/evals/${run.eval}` : '';
  }
  return id ? `/${section}/${id}` : `/${section}`;
}

function NavItem({ to, path, params, icon, children }: { to: string; path: string; params?: Record<string, string>; icon: ReactNode; children: string }) {
  const active = useActivePath() === path;
  return (
    <SidebarMenuItem>
      <SidebarMenuButton asChild isActive={active} tooltip={children}>
        <Link to={to as '/'} params={params as never}>
          {icon}
          <span>{children}</span>
        </Link>
      </SidebarMenuButton>
    </SidebarMenuItem>
  );
}

/** The coins at their native size beside the name in the game's font, at its native 16px. */
function Wordmark() {
  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <SidebarMenuButton size="lg" asChild>
          <Link to="/">
            <Sprite item="995-10000" size={32} alt="" />
            <span className="font-game text-base/4">2004scape evals</span>
          </Link>
        </SidebarMenuButton>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}

/** Above this many evals the nav gets a filter. */
const FILTER_FROM = 8;

/** The evals as nav items, each with its sprite, in a flat list. */
function EvalNav({ evals }: { evals: Eval[] }) {
  const [filter, setFilter] = useState('');
  const query = filter.trim().toLowerCase();
  const shown = query ? evals.filter(e => e.title.toLowerCase().includes(query)) : evals;
  return (
    <>
      {evals.length > FILTER_FROM && <SidebarInput aria-label="Filter evals" placeholder="Filter" value={filter} onChange={event => setFilter(event.target.value)} />}
      <SidebarMenu>
        {shown.map(e => (
          <NavItem key={e.id} to="/evals/$evalId" path={`/evals/${e.id}`} params={{ evalId: e.id }} icon={<EvalMark evalId={e.id} size={16} title="" />}>
            {e.title}
          </NavItem>
        ))}
      </SidebarMenu>
      {shown.length === 0 && <p className="px-2 py-1 text-xs text-muted-foreground">No eval matches.</p>}
    </>
  );
}

function AppSidebar() {
  const { data } = useQuery(indexQuery);
  return (
    <Sidebar variant="inset">
      <SidebarHeader>
        <Wordmark />
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              <NavItem to="/" path="/" icon={<House />}>
                Home
              </NavItem>
              <NavItem to="/compare" path="/compare" icon={<ChartScatter />}>
                Compare
              </NavItem>
              <NavItem to="/runs" path="/runs" icon={<ListVideo />}>
                Runs
              </NavItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
        <SidebarGroup>
          <SidebarGroupLabel>Evals</SidebarGroupLabel>
          <SidebarGroupContent>{data && <EvalNav evals={[...data.evals].sort((a, b) => a.title.localeCompare(b.title))} />}</SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarRail />
    </Sidebar>
  );
}

/** Switches between light and dark as the reader's preference; it also drops a shared link's ?theme=. */
function ThemeToggle() {
  const theme = useTheme();
  const update = useSearchUpdate<{ theme?: Theme }>();
  const next: Theme = theme === 'dark' ? 'light' : 'dark';
  const label = `Switch to ${next} theme`;
  return (
    <Button
      variant="ghost"
      size="icon-sm"
      aria-label={label}
      title={label}
      onClick={() => {
        setTheme(next);
        update({ theme: undefined });
      }}
    >
      {theme === 'dark' ? <Sun /> : <Moon />}
    </Button>
  );
}

interface Crumb {
  label: string;
  /** Drawn instead of the label, which stays the tooltip */
  node?: ReactNode;
  to?: string;
  params?: Record<string, string>;
  /** An eval crumb carries the eval's sprite */
  evalId?: string;
}

/**
 * The breadcrumb for the current path, named as the sidebar names it: "Home", "Compare", "Runs",
 * an eval's title, and a run's model and harness under its eval.
 */
function useCrumbs(): Crumb[] {
  const pathname = useRouterState({ select: s => s.location.pathname });
  const { data } = useQuery(indexQuery);
  const parts = pathname.split('/').filter(Boolean).map(decodeURIComponent);
  if (parts.length === 0) return [{ label: 'Home' }];
  if (parts[0] === 'evals' && parts[1]) {
    const e = data?.evals.find(x => x.id === parts[1]);
    return [{ label: e?.title ?? parts[1], evalId: parts[1] }];
  }
  if (parts[0] === 'runs' && parts[1]) {
    const run = data?.runs.find(r => r.id === parts[1]);
    const e = run && data?.evals.find(x => x.id === run.eval);
    return [
      ...(e ? [{ label: e.title, to: '/evals/$evalId', params: { evalId: e.id }, evalId: e.id }] : []),
      run ? { label: `${variantOf(run).name}, epoch ${run.epoch}`, node: <VariantLabel run={run} compact /> } : { label: parts[1] },
    ];
  }
  const names: Record<string, string> = { runs: 'Runs', compare: 'Compare' };
  return [{ label: names[parts[0]] ?? parts[0] }];
}

/**
 * shadcn's Breadcrumb on one line. On narrow screens only the parent and the current page show, and
 * a parent with a mark shows just its mark, so the current page keeps its full name.
 */
function AppBreadcrumb() {
  const crumbs = useCrumbs();
  return (
    <Breadcrumb className="min-w-0 flex-1">
      <BreadcrumbList className="flex-nowrap">
        {crumbs.map((crumb, i) => {
          const last = i === crumbs.length - 1;
          const hidden = !last && i < crumbs.length - 2 && 'max-sm:hidden';
          const mark = crumb.evalId ? <EvalMark evalId={crumb.evalId} size={16} title="" /> : null;
          const text = crumb.node ?? <span className={cn('truncate', mark && !last && 'max-sm:hidden')}>{crumb.label}</span>;
          return [
            <BreadcrumbItem key={`c${i}`} className={cn('min-w-0', last ? 'shrink' : 'min-w-12 shrink-10', mark && !last && 'max-sm:min-w-0 max-sm:shrink-0', hidden)} title={crumb.label}>
              {last || !crumb.to ? (
                <BreadcrumbPage className="flex min-w-0 items-center gap-1.5">
                  {mark}
                  {text}
                </BreadcrumbPage>
              ) : (
                <BreadcrumbLink asChild className="flex min-w-0 items-center gap-1.5">
                  <Link to={crumb.to as '/'} params={crumb.params as never}>
                    {mark}
                    {text}
                  </Link>
                </BreadcrumbLink>
              )}
            </BreadcrumbItem>,
            !last && <BreadcrumbSeparator key={`s${i}`} className={cn('shrink-0', hidden)} />,
          ];
        })}
      </BreadcrumbList>
    </Breadcrumb>
  );
}

/** Closes the mobile sheet and clears the page's hover when the page changes. */
function CloseOnNavigate() {
  const router = useRouter();
  const { setOpenMobile } = useSidebar();
  useEffect(
    () =>
      router.subscribe('onBeforeLoad', event => {
        if (event.pathChanged) {
          setOpenMobile(false);
          setHovered(undefined);
        }
      }),
    [router, setOpenMobile]
  );
  return null;
}

export function Layout({ children }: { children: ReactNode }) {
  return (
    <SidebarProvider>
      <CloseOnNavigate />
      <AppSidebar />
      <SidebarInset className="min-w-0">
        <header className="sticky top-0 z-10 flex h-header shrink-0 items-center gap-2 border-b bg-background px-gutter md:rounded-t-xl">
          <SidebarTrigger className="-ml-1" />
          <Separator orientation="vertical" className="mr-2 data-vertical:h-4 data-vertical:self-auto" />
          <AppBreadcrumb />
          <ThemeToggle />
        </header>
        <div className="@container/main mx-auto flex w-full max-w-screen-2xl min-w-0 flex-1 flex-col gap-gutter p-gutter">{children}</div>
      </SidebarInset>
    </SidebarProvider>
  );
}
