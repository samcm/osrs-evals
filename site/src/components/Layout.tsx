/**
 * The app shell on shadcn's Sidebar: the wordmark, Overview, the evals with their sprites (variants
 * of one eval nested under it, and a filter once the list is long), Compare, Runs; on small screens
 * the sidebar is a sheet behind SidebarTrigger. The header holds the trigger, the Breadcrumb (which
 * names the page as its H1 does and never loses its last crumb) and the theme toggle.
 */

import { Fragment, useEffect, useState, type ReactNode } from 'react';
import { Link, useMatchRoute, useRouter, useRouterState } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';
import { cn } from '@/lib/utils';
import { indexQuery } from '@/data/queries';
import type { Eval } from '@/data/types';
import { evalBase } from '@/lib/evals';
import { setHovered } from '@/lib/hover';
import { useSearchUpdate } from '@/lib/search';
import { variantOf } from '@/lib/series';
import { groupBy } from '@/lib/stats';
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
  SidebarInput,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  SidebarProvider,
  SidebarRail,
  SidebarTrigger,
  useSidebar,
} from '@/components/ui/sidebar';
import { Segmented } from './bits';
import { EvalMark, Sprite, VariantLabel } from './marks';

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
      <Sprite item="995-10000" size={24} alt="" />
      <span className="font-game text-base/4 text-foreground">2004scape evals</span>
    </Link>
  );
}

/** Above this many evals the nav gets a filter. */
const FILTER_FROM = 8;

const familyOf = (e: Eval): string => e.base || evalBase(e.id);

/** What a variant's title adds to its family head's: "Cook's Assistant, 5 tries" → "5 tries". */
function variantTitle(e: Eval, head: Eval): string {
  const rest = e.title.startsWith(head.title) ? e.title.slice(head.title.length).replace(/^[\s,:–-]+/, '') : '';
  return rest ? rest.charAt(0).toUpperCase() + rest.slice(1) : e.title;
}

/**
 * The evals as nav items, each with its sprite. Variants of one eval (cooks_assistant_x5 of
 * cooks_assistant) nest under it by what tells them apart ("5 tries"), so the list grows by
 * families rather than near-duplicate titles.
 */
function EvalNav({ evals }: { evals: Eval[] }) {
  const matchRoute = useMatchRoute();
  const [filter, setFilter] = useState('');
  const query = filter.trim().toLowerCase();
  const shown = query ? evals.filter(e => e.title.toLowerCase().includes(query)) : evals;
  const families = [...groupBy(shown, familyOf).values()];
  return (
    <>
      {evals.length > FILTER_FROM && (
        <SidebarInput aria-label="Filter evals" placeholder="Filter" value={filter} onChange={event => setFilter(event.target.value)} className="mb-2" />
      )}
      <SidebarMenu>
        {families.map(family => {
          const head = family.find(e => e.id === familyOf(e)) ?? family[0];
          const rest = family.filter(e => e !== head);
          return (
            <Fragment key={head.id}>
              <NavItem to="/evals/$evalId" params={{ evalId: head.id }} mark={<EvalMark evalId={head.id} size={16} title="" />}>
                {head.title}
              </NavItem>
              {rest.length > 0 && (
                <SidebarMenuItem>
                  <SidebarMenuSub>
                    {rest.map(e => (
                      <SidebarMenuSubItem key={e.id}>
                        <SidebarMenuSubButton asChild isActive={Boolean(matchRoute({ to: '/evals/$evalId', params: { evalId: e.id } as never }))}>
                          <Link to="/evals/$evalId" params={{ evalId: e.id }} title={e.title}>
                            <span>{variantTitle(e, head)}</span>
                          </Link>
                        </SidebarMenuSubButton>
                      </SidebarMenuSubItem>
                    ))}
                  </SidebarMenuSub>
                </SidebarMenuItem>
              )}
            </Fragment>
          );
        })}
      </SidebarMenu>
      {shown.length === 0 && <p className="px-2 py-1 text-xs text-muted-foreground">No eval matches.</p>}
    </>
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
          <SidebarGroupContent>{data && <EvalNav evals={data.evals} />}</SidebarGroupContent>
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
  /** Drawn instead of the label, which stays the tooltip */
  node?: ReactNode;
  to?: string;
  params?: Record<string, string>;
  /** An eval crumb carries the eval's sprite */
  evalId?: string;
}

/**
 * The breadcrumb for the current path. Its last crumb names the page as the page's H1 does: the
 * eval's title, a run's model and harness, "Compare", "Runs", "Overview".
 */
function useCrumbs(): Crumb[] {
  const pathname = useRouterState({ select: s => s.location.pathname });
  const { data } = useQuery(indexQuery);
  const parts = pathname.split('/').filter(Boolean).map(decodeURIComponent);
  const home: Crumb = { label: 'Overview', to: '/' };
  if (parts.length === 0) return [{ label: 'Overview' }];
  if (parts[0] === 'evals' && parts[1]) {
    const e = data?.evals.find(x => x.id === parts[1]);
    return [home, { label: e?.title ?? parts[1], evalId: parts[1] }];
  }
  if (parts[0] === 'runs' && parts[1]) {
    const run = data?.runs.find(r => r.id === parts[1]);
    const e = run && data?.evals.find(x => x.id === run.eval);
    return [
      home,
      ...(e ? [{ label: e.title, to: '/evals/$evalId', params: { evalId: e.id }, evalId: e.id }] : []),
      run ? { label: `${variantOf(run).name}, epoch ${run.epoch}`, node: <VariantLabel run={run} compact /> } : { label: parts[1] },
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
          const text = crumb.node ?? <span className="truncate">{crumb.label}</span>;
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
        <header className="sticky top-0 z-10 flex h-header shrink-0 items-center gap-2 border-b bg-background px-gutter">
          <SidebarTrigger className="-ml-1" />
          <Separator orientation="vertical" className="mr-2 data-vertical:h-4 data-vertical:self-auto" />
          <AppBreadcrumb />
          <ThemeToggle />
        </header>
        <div className="mx-auto flex w-full max-w-screen-2xl min-w-0 flex-1 flex-col gap-gutter p-gutter">{children}</div>
      </SidebarInset>
    </SidebarProvider>
  );
}
