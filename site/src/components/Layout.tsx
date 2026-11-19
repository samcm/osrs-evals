/**
 * The app shell on shadcn's Sidebar: the wordmark, Overview, the evals with their sprites, Compare,
 * Runs; on small screens the sidebar is a sheet behind SidebarTrigger. The header holds
 * the trigger, the Breadcrumb (which never loses its last crumb) and the theme toggle.
 */

import { useEffect, type ReactNode } from 'react';
import { Link, useMatchRoute, useRouter, useRouterState } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';
import { cn } from '@/lib/utils';
import { indexQuery } from '@/data/queries';
import { useSearchUpdate } from '@/lib/search';
import { setTheme, useTheme, type Theme } from '@/lib/theme';
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
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarRail,
  SidebarTrigger,
  useSidebar,
} from '@/components/ui/sidebar';
import { Segmented } from './bits';
import { EvalMark } from './marks';

function NavItem({ to, params, mark, children }: { to: string; params?: Record<string, string>; mark?: ReactNode; children: string }) {
  const matchRoute = useMatchRoute();
  const active = Boolean(matchRoute({ to: to as '/', params: params as never, fuzzy: to !== '/' }));
  return (
    <SidebarMenuItem>
      <SidebarMenuButton asChild isActive={active} tooltip={children}>
        <Link to={to as '/'} params={params as never}>
          {mark}
          <span>{children}</span>
        </Link>
      </SidebarMenuButton>
    </SidebarMenuItem>
  );
}

function Wordmark() {
  return (
    <Link to="/" className="flex h-8 items-center gap-2 rounded-md px-2 outline-none focus-visible:ring-3 focus-visible:ring-ring/50">
      <img data-sprite src="/assets/items/995-10000.png" alt="" width={32} height={32} className="size-6" />
      <span className="font-game text-base/4 text-foreground">2004scape evals</span>
    </Link>
  );
}

function AppSidebar() {
  const { data } = useQuery(indexQuery);
  return (
    <Sidebar>
      <SidebarHeader>
        <Wordmark />
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              <NavItem to="/">Overview</NavItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
        <SidebarGroup>
          <SidebarGroupLabel>Evals</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {data?.evals.map(e => (
                <NavItem key={e.id} to="/evals/$evalId" params={{ evalId: e.id }} mark={<EvalMark evalId={e.id} size={16} title="" />}>
                  {e.title}
                </NavItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              <NavItem to="/compare">Compare</NavItem>
              <NavItem to="/runs">Runs</NavItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarRail />
    </Sidebar>
  );
}

/** Light or dark as the reader's preference; it also drops a shared link's ?theme=. */
function ThemeToggle() {
  const theme = useTheme();
  const update = useSearchUpdate<{ theme?: Theme }>();
  return (
    <Segmented
      label="Theme"
      value={theme}
      onChange={next => {
        setTheme(next);
        update({ theme: undefined });
      }}
      options={[
        { value: 'light', label: 'Light' },
        { value: 'dark', label: 'Dark' },
      ]}
    />
  );
}

interface Crumb {
  label: string;
  to?: string;
  params?: Record<string, string>;
  mono?: boolean;
  /** An eval crumb carries the eval's sprite */
  evalId?: string;
}

/** The breadcrumb for the current path, from the index for eval titles. */
function useCrumbs(): Crumb[] {
  const pathname = useRouterState({ select: s => s.location.pathname });
  const { data } = useQuery(indexQuery);
  const parts = pathname.split('/').filter(Boolean).map(decodeURIComponent);
  if (parts.length === 0) return [{ label: 'Overview' }];
  if (parts[0] === 'evals' && parts[1]) {
    const e = data?.evals.find(x => x.id === parts[1]);
    return [{ label: 'Overview', to: '/' }, { label: e?.title ?? parts[1], evalId: parts[1] }];
  }
  if (parts[0] === 'runs' && parts[1]) {
    const run = data?.runs.find(r => r.id === parts[1]);
    const e = run && data?.evals.find(x => x.id === run.eval);
    return [
      { label: 'Runs', to: '/runs' },
      ...(e ? [{ label: e.title, to: '/evals/$evalId', params: { evalId: e.id }, evalId: e.id }] : []),
      { label: parts[1], mono: true },
    ];
  }
  const names: Record<string, string> = { runs: 'Runs', compare: 'Compare' };
  return [{ label: names[parts[0]] ?? parts[0] }];
}

/**
 * shadcn's Breadcrumb on one line. On narrow screens only the parent and the current page show;
 * parents shrink first (down to a few letters), so the current page always keeps its place.
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
          const text = <span className={cn('truncate', crumb.mono && 'font-mono text-xs')}>{crumb.label}</span>;
          return [
            <BreadcrumbItem key={`c${i}`} className={cn('min-w-0', last ? 'shrink' : 'min-w-12 shrink-10', hidden)} title={crumb.label}>
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

/** Closes the mobile sheet when the page changes. */
function CloseOnNavigate() {
  const router = useRouter();
  const { setOpenMobile } = useSidebar();
  useEffect(
    () =>
      router.subscribe('onBeforeLoad', event => {
        if (event.pathChanged) setOpenMobile(false);
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
        <header className="sticky top-0 z-10 flex h-12 shrink-0 items-center gap-2 border-b bg-background px-4">
          <SidebarTrigger className="-ml-1" />
          <Separator orientation="vertical" className="mr-2 data-vertical:h-4 data-vertical:self-auto" />
          <AppBreadcrumb />
          <ThemeToggle />
        </header>
        <div className="mx-auto flex w-full max-w-screen-2xl min-w-0 flex-1 flex-col gap-4 p-4 md:gap-6 md:p-6">{children}</div>
      </SidebarInset>
    </SidebarProvider>
  );
}
