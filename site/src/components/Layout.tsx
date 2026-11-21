/**
 * The app shell, as shadcn's dashboard-01 block: an inset Sidebar (the product, the main pages, the
 * evals) and a header with the SidebarTrigger, the page's name (Breadcrumb) and the theme toggle.
 * The content is one column with the block's spacing. Nothing here is restyled.
 */

import { useEffect, type CSSProperties, type ReactNode } from 'react';
import { ChartBarIcon, FlaskConicalIcon, LayoutDashboardIcon, ListIcon, MoonIcon, SunIcon, SwordsIcon } from 'lucide-react';
import { Link, useRouter, useRouterState } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';
import { indexQuery } from '@/data/queries';
import { setHovered } from '@/lib/hover';
import { useSearchUpdate } from '@/lib/search';
import { evalBySlug, evalSlug } from '@/lib/evals';
import { modelInfo, modelSlug, variantOf } from '@/lib/series';
import { BrandMark } from '@/components/marks';
import { setTheme, useTheme, type Theme } from '@/lib/theme';
import { Button } from '@/components/ui/button';
import { Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator } from '@/components/ui/breadcrumb';
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
  SidebarTrigger,
  useSidebar,
} from '@/components/ui/sidebar';

/** Whether a nav item is the page being shown; a run counts as its eval's page. */
function useIsActive(path: string): boolean {
  const pathname = useRouterState({ select: st => st.location.pathname });
  const { data } = useQuery(indexQuery);
  if (path === '/') return pathname === '/';
  if (path === '/runs') return pathname === '/runs';
  if (pathname === path || pathname.startsWith(`${path}/`)) return true;
  const run = pathname.startsWith('/runs/') ? data?.runs.find(r => r.id === decodeURIComponent(pathname.slice(6))) : undefined;
  return run != null && path === `/evals/${evalSlug(run.eval)}`;
}

function NavItem({ to, path, params, icon, children }: { to: string; path: string; params?: Record<string, string>; icon: ReactNode; children: string }) {
  const active = useIsActive(path);
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

function AppSidebar() {
  const { data } = useQuery(indexQuery);
  const evals = [...(data?.evals ?? [])].sort((a, b) => a.title.localeCompare(b.title));
  const models = [...new Set((data?.runs ?? []).map(r => r.model))].sort((a, b) => modelInfo(a).name.localeCompare(modelInfo(b).name));
  return (
    <Sidebar collapsible="offcanvas" variant="inset">
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton asChild className="data-[slot=sidebar-menu-button]:p-1.5!">
              <Link to="/">
                <SwordsIcon className="size-5!" />
                <span className="text-base font-semibold">2004scape evals</span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              <NavItem to="/" path="/" icon={<LayoutDashboardIcon />}>
                Home
              </NavItem>
              <NavItem to="/compare" path="/compare" icon={<ChartBarIcon />}>
                Compare
              </NavItem>
              <NavItem to="/runs" path="/runs" icon={<ListIcon />}>
                Runs
              </NavItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
        <SidebarGroup>
          <SidebarGroupLabel>Models</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {models.map(m => (
                <NavItem key={m} to="/models/$model" path={`/models/${modelSlug(m)}`} params={{ model: modelSlug(m) }} icon={<BrandMark slug={modelInfo(m).vendor.slug} size={16} />}>
                  {modelInfo(m).name}
                </NavItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
        <SidebarGroup>
          <SidebarGroupLabel>Evals</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {evals.map(e => (
                <NavItem key={e.id} to="/evals/$evalId" path={`/evals/${evalSlug(e.id)}`} params={{ evalId: evalSlug(e.id) }} icon={<FlaskConicalIcon />}>
                  {e.title}
                </NavItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
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
      size="icon"
      className="ml-auto size-8"
      aria-label={label}
      title={label}
      onClick={() => {
        setTheme(next);
        update({ theme: undefined });
      }}
    >
      {theme === 'dark' ? <SunIcon /> : <MoonIcon />}
    </Button>
  );
}

interface Crumb {
  label: string;
  to?: string;
  params?: Record<string, string>;
}

/** The page's name: "Home", "Compare", "Runs", an eval's title, a model under its eval, or a run under its eval. */
function useCrumbs(): Crumb[] {
  const pathname = useRouterState({ select: s => s.location.pathname });
  const { data } = useQuery(indexQuery);
  const parts = pathname.split('/').filter(Boolean).map(decodeURIComponent);
  if (parts.length === 0) return [{ label: 'Home' }];
  if (parts[0] === 'evals' && parts[1]) {
    const e = data && evalBySlug(data.evals, parts[1]);
    const title = { label: e?.title ?? parts[1] };
    if (!parts[2]) return [title];
    const run = data?.runs.find(r => modelSlug(r.model) === modelSlug(parts[2]));
    return [{ ...title, to: '/evals/$evalId', params: { evalId: evalSlug(parts[1]) } }, { label: run ? modelInfo(run.model).name : parts[2] }];
  }
  if (parts[0] === 'runs' && parts[1]) {
    const run = data?.runs.find(r => r.id === parts[1]);
    const e = run && data?.evals.find(x => x.id === run.eval);
    return [
      ...(e ? [{ label: e.title, to: '/evals/$evalId', params: { evalId: evalSlug(e.id) } }] : []),
      { label: run ? `${variantOf(run).name}, epoch ${run.epoch}` : parts[1] },
    ];
  }
  if (parts[0] === 'models' && parts[1]) {
    const run = data?.runs.find(r => modelSlug(r.model) === modelSlug(parts[1]));
    return [{ label: run ? modelInfo(run.model).name : parts[1] }];
  }
  const names: Record<string, string> = { runs: 'Runs', compare: 'Compare' };
  return [{ label: names[parts[0]] ?? parts[0] }];
}

function AppBreadcrumb() {
  const crumbs = useCrumbs();
  return (
    <Breadcrumb className="min-w-0">
      <BreadcrumbList className="flex-nowrap text-base">
        {crumbs.map((crumb, i) => {
          const last = i === crumbs.length - 1;
          return [
            <BreadcrumbItem key={`c${i}`} className={last ? 'min-w-0' : 'min-w-0 max-sm:hidden'}>
              {last || !crumb.to ? (
                <BreadcrumbPage className="truncate font-medium">{crumb.label}</BreadcrumbPage>
              ) : (
                <BreadcrumbLink asChild className="truncate">
                  <Link to={crumb.to as '/'} params={crumb.params as never}>
                    {crumb.label}
                  </Link>
                </BreadcrumbLink>
              )}
            </BreadcrumbItem>,
            !last && <BreadcrumbSeparator key={`s${i}`} className="max-sm:hidden" />,
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
    <SidebarProvider style={{ '--sidebar-width': 'calc(var(--spacing) * 72)', '--header-height': 'calc(var(--spacing) * 12)' } as CSSProperties}>
      <CloseOnNavigate />
      <AppSidebar />
      <SidebarInset className="min-w-0">
        <header className="flex h-(--header-height) shrink-0 items-center gap-2 border-b transition-[width,height] ease-linear group-has-data-[collapsible=icon]/sidebar-wrapper:h-(--header-height)">
          <div className="flex w-full min-w-0 items-center gap-1 px-4 lg:gap-2 lg:px-6">
            <SidebarTrigger className="-ml-1" />
            <Separator orientation="vertical" className="mx-2 data-vertical:h-4 data-vertical:self-center" />
            <AppBreadcrumb />
            <ThemeToggle />
          </div>
        </header>
        <div className="@container/main flex min-w-0 flex-1 flex-col">
          <div className="flex min-w-0 flex-col gap-4 px-4 py-4 md:gap-6 md:py-6 lg:px-6">{children}</div>
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}
