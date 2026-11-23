import type { JSX, ReactNode } from 'react';
import { useState } from 'react';
import { Dialog, DialogBackdrop, DialogPanel, Popover, PopoverButton, PopoverPanel } from '@headlessui/react';
import { Link, useRouterState } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';
import clsx from 'clsx';
import {
  ArchiveBoxIcon,
  ArrowTrendingUpIcon,
  BanknotesIcon,
  BeakerIcon,
  ChartBarIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  DocumentTextIcon,
  FireIcon,
  HomeIcon,
  QueueListIcon,
  TrophyIcon,
} from '@heroicons/react/24/outline';
import { Tooltip } from '@/components/Overlays/Tooltip';
import { BrandMark } from '@/components/marks';
import { indexQuery } from '@/data/queries';
import { evalSlug, siteEvals } from '@/lib/evals';
import { modelInfo, modelSlug } from '@/lib/series';
import type { SidebarProps } from './Sidebar.types';

/** The product's name: the sidebar's header and the mobile header */
const PRODUCT_NAME = '2004scape evals';

/**
 * The product's name in Cinzel beside its mark, a small gold lozenge; collapsed, the mark alone. Only
 * the sidebar and the mobile header show it, and it always links home.
 */
export function Wordmark({ collapsed = false }: { collapsed?: boolean }): JSX.Element {
  return (
    <Link
      to="/"
      aria-label={collapsed ? PRODUCT_NAME : undefined}
      className={clsx(
        'flex min-w-0 items-center gap-2.5 text-foreground transition-colors hover:text-foreground-soft',
        collapsed && 'justify-center p-2'
      )}
    >
      <span aria-hidden="true" className="size-2 shrink-0 rotate-45 rounded-px bg-accent" />
      {!collapsed && (
        <span className="truncate font-wordmark text-base/none font-semibold tracking-wider">{PRODUCT_NAME}</span>
      )}
    </Link>
  );
}

/** A heroicon for each eval (the shell keeps game art out); a new eval gets the beaker. */
const EVAL_ICONS: Record<string, typeof HomeIcon> = {
  quest_points: DocumentTextIcon,
  dragon_slayer: FireIcon,
  heros_quest: TrophyIcon,
  collection: ArchiveBoxIcon,
  team_wealth: BanknotesIcon,
  total_level: ArrowTrendingUpIcon,
};

/** A page in the nav */
interface NavItem {
  name: string;
  /** The route and its params, as a router Link takes them */
  to: string;
  params?: Record<string, string>;
  /** The path the item stands for, to tell whether it is the page shown */
  path: string;
  /** Drawn at size-4 beside the name */
  icon: ReactNode;
}

/** A maker in the Models group: its mark, opening to its models */
interface Maker {
  name: string;
  slug: string;
  models: string[];
}

/** An item is muted text; the page shown is full-strength, marked by a 2px gold rule at its left edge, no fill. */
const navItemClassName =
  'group relative flex items-center gap-x-2.5 rounded-sm text-muted transition-colors hover:text-foreground';
const navItemActiveClassName =
  'font-medium text-foreground! before:absolute before:inset-y-1.5 before:left-0 before:w-0.5 before:rounded-full before:bg-accent';

/** The pathname the router shows */
function usePathname(): string {
  return useRouterState({ select: state => state.location.pathname });
}

/** Whether a nav item is the page being shown; a run counts as its eval's page. */
function useIsActive(path: string): boolean {
  const pathname = usePathname();
  const { data } = useQuery(indexQuery);
  if (path === '/' || path === '/runs') return pathname === path;
  if (pathname === path || pathname.startsWith(`${path}/`)) return true;
  const run = pathname.startsWith('/runs/')
    ? data?.runs.find(r => r.id === decodeURIComponent(pathname.slice(6)))
    : undefined;
  return run != null && path === `/evals/${evalSlug(run.eval)}`;
}

/** Navigation link for both the expanded and the collapsed rail; collapsed, its name is its tooltip. */
function NavLink({ page, collapsed }: { page: NavItem; collapsed: boolean }): JSX.Element {
  const active = useIsActive(page.path);
  const link = (
    <Link
      to={page.to as '/'}
      params={page.params as never}
      preload="viewport"
      preloadDelay={100}
      aria-label={collapsed ? page.name : undefined}
      aria-current={active ? 'page' : undefined}
      className={clsx(
        navItemClassName,
        collapsed ? 'justify-center p-2' : 'py-1.5 pr-2 pl-3 text-sm/5',
        active && navItemActiveClassName
      )}
    >
      {page.icon}
      {!collapsed && <span className="truncate">{page.name}</span>}
    </Link>
  );
  return collapsed ? (
    <Tooltip content={page.name} side="right">
      {link}
    </Tooltip>
  ) : (
    link
  );
}

/** A model under its maker, in the expanded list or the collapsed rail's flyout */
function ModelLink({ model, onClick }: { model: string; onClick?: () => void }): JSX.Element {
  const pathname = usePathname();
  const active = pathname === `/models/${modelSlug(model)}`;
  return (
    <Link
      to="/models/$model"
      params={{ model: modelSlug(model) }}
      onClick={onClick}
      aria-current={active ? 'page' : undefined}
      className={clsx(
        navItemClassName,
        'py-1 pr-2 text-sm/5',
        // Under its maker, the name lines up with the maker's; in the rail's flyout, with the heading
        onClick ? 'pl-3' : 'pl-9.5',
        active && navItemActiveClassName
      )}
    >
      <span className="truncate">{modelInfo(model).short}</span>
    </Link>
  );
}

/**
 * A maker in the expanded sidebar: its mark and name, opening to its models. It opens by itself
 * when one of its models becomes the page; otherwise it stays as the reader left it.
 */
function MakerItem({ maker }: { maker: Maker }): JSX.Element {
  const pathname = usePathname();
  const here = maker.models.some(m => pathname === `/models/${modelSlug(m)}` || pathname.endsWith(`/${modelSlug(m)}`));
  const [open, setOpen] = useState(here);
  const [wasHere, setWasHere] = useState(here);
  if (here !== wasHere) {
    setWasHere(here);
    if (here) setOpen(true);
  }
  return (
    <div>
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
        className={clsx(navItemClassName, 'w-full py-1.5 pr-2 pl-3 text-left text-sm/5')}
      >
        <BrandMark slug={maker.slug} size={16} />
        <span className="min-w-0 flex-1 truncate">{maker.name}</span>
        <ChevronRightIcon className={clsx('size-3.5 shrink-0 transition-transform', open && 'rotate-90')} />
      </button>
      {open && (
        <div>
          {maker.models.map(m => (
            <ModelLink key={m} model={m} />
          ))}
        </div>
      )}
    </div>
  );
}

/** A maker in the collapsed rail: its mark, opening a flyout of its models beside the rail. */
function MakerFlyout({ maker }: { maker: Maker }): JSX.Element {
  const pathname = usePathname();
  const here = maker.models.some(m => pathname === `/models/${modelSlug(m)}`);
  return (
    <Popover className="flex items-center">
      <PopoverButton
        aria-label={maker.name}
        className={clsx(
          navItemClassName,
          'w-full justify-center p-2 data-open:text-foreground',
          here && navItemActiveClassName
        )}
      >
        <BrandMark slug={maker.slug} size={16} />
      </PopoverButton>
      <PopoverPanel
        transition
        anchor={{ to: 'right start', gap: 18, padding: 8 }}
        className="z-60 flex max-w-vw-less-4 min-w-40 flex-col rounded-md border border-border bg-surface py-2 pr-2 shadow-lg transition duration-100 ease-out data-closed:-translate-x-1 data-closed:opacity-0"
      >
        {({ close }) => (
          <>
            <div className="pt-0.5 pb-1 pl-3 text-xs text-muted">{maker.name}</div>
            {maker.models.map(m => (
              <ModelLink key={m} model={m} onClick={() => close()} />
            ))}
          </>
        )}
      </PopoverPanel>
    </Popover>
  );
}

/** Group heading (Evals, Models), in sentence case; the collapsed rail draws a short rule instead */
function SubsectionHeader({ title, collapsed }: { title: string; collapsed: boolean }): JSX.Element {
  if (collapsed) return <div aria-hidden="true" className="mx-3 mb-2 border-t border-border" />;
  return <div className="mb-1 pl-3 text-xs text-muted">{title}</div>;
}

/** The nav: the main pages, then the evals (most runs first), then the models by maker */
function useNav(): { pages: NavItem[]; evals: NavItem[]; makers: Maker[] } {
  const { data } = useQuery(indexQuery);
  const runs = data?.runs ?? [];
  const runsOf = (id: string): number => runs.filter(r => r.eval === id).length;
  const icon = 'size-4 shrink-0';
  const pages: NavItem[] = [
    { name: 'Home', to: '/', path: '/', icon: <HomeIcon className={icon} /> },
    { name: 'Runs', to: '/runs', path: '/runs', icon: <QueueListIcon className={icon} /> },
    { name: 'Compare', to: '/compare', path: '/compare', icon: <ChartBarIcon className={icon} /> },
  ];
  // One eval without runs yet goes last (its page says so)
  const evals = siteEvals(data?.evals ?? [])
    .sort((a, b) => runsOf(b.id) - runsOf(a.id))
    .map(e => {
      const Icon = EVAL_ICONS[e.id] ?? BeakerIcon;
      return {
        name: e.title,
        to: '/evals/$evalId',
        params: { evalId: evalSlug(e.id) },
        path: `/evals/${evalSlug(e.id)}`,
        icon: <Icon className={icon} />,
      };
    });
  // The makers by name, each maker's models by name
  const byMaker = new Map<string, Maker>();
  for (const m of new Set(runs.map(r => r.model))) {
    const vendor = modelInfo(m).vendor;
    const maker = byMaker.get(vendor.slug) ?? { name: vendor.name, slug: vendor.slug, models: [] };
    maker.models.push(m);
    byMaker.set(vendor.slug, maker);
  }
  const makers = [...byMaker.values()].sort((a, b) => a.name.localeCompare(b.name));
  for (const maker of makers) maker.models.sort((a, b) => modelInfo(a).name.localeCompare(modelInfo(b).name));
  return { pages, evals, makers };
}

/** The groups of links, for the rail (collapsed or not) and the mobile drawer */
function Nav({ collapsed }: { collapsed: boolean }): JSX.Element {
  const { pages, evals, makers } = useNav();
  const list = collapsed ? 'space-y-1' : 'space-y-px';
  return (
    <nav className="flex flex-1 flex-col gap-y-5">
      <div className={list}>
        {pages.map(page => (
          <NavLink key={page.path} page={page} collapsed={collapsed} />
        ))}
      </div>
      <div>
        <SubsectionHeader title="Evals" collapsed={collapsed} />
        <div className={list}>
          {evals.map(page => (
            <NavLink key={page.path} page={page} collapsed={collapsed} />
          ))}
        </div>
      </div>
      <div>
        <SubsectionHeader title="Models" collapsed={collapsed} />
        <div className={list}>
          {makers.map(maker =>
            collapsed ? <MakerFlyout key={maker.slug} maker={maker} /> : <MakerItem key={maker.slug} maker={maker} />
          )}
        </div>
      </div>
    </nav>
  );
}

/**
 * The app's sidebar: a stone panel a step off the page, fixed on the left from lg, collapsible to an
 * icon rail (the caller keeps that state), and a drawer under the mobile header below lg.
 */
export function Sidebar({ sidebarOpen, setSidebarOpen, collapsed, setCollapsed }: SidebarProps): JSX.Element {
  return (
    <>
      {/* Mobile sidebar */}
      <Dialog open={sidebarOpen} onClose={setSidebarOpen} aria-label="Sidebar" className="relative z-30 lg:hidden">
        <DialogBackdrop
          transition
          className="fixed inset-0 bg-sidebar transition-opacity duration-300 ease-linear data-closed:opacity-0"
        />

        <div className="fixed inset-0 flex pt-14">
          <DialogPanel
            transition
            className="relative flex w-full flex-1 transform transition duration-300 ease-in-out data-closed:-translate-x-full"
          >
            <div className="relative flex grow flex-col overflow-y-auto bg-sidebar px-2 py-4 sm:px-4">
              <Nav collapsed={false} />
            </div>
          </DialogPanel>
        </div>
      </Dialog>

      {/* Static sidebar for desktop */}
      <div
        className={clsx(
          'hidden border-r border-border bg-sidebar transition-all duration-200 lg:fixed lg:inset-y-0 lg:z-50 lg:flex lg:flex-col',
          collapsed ? 'lg:w-14' : 'lg:w-56'
        )}
      >
        {/* The wordmark, level with the header bar beside it */}
        <div className={clsx('flex h-12 shrink-0 items-center', collapsed ? 'justify-center' : 'px-5')}>
          <Wordmark collapsed={collapsed} />
        </div>

        {/* Scrollable content */}
        <div className="flex grow flex-col overflow-y-auto px-2 py-3">
          <Nav collapsed={collapsed} />
        </div>

        {/* Footer */}
        <div className={clsx('flex shrink-0 py-2', collapsed ? 'justify-center' : 'justify-end px-2')}>
          <button
            type="button"
            onClick={() => setCollapsed(!collapsed)}
            className="rounded-sm p-1.5 text-muted transition-colors hover:bg-foreground-5 hover:text-foreground"
            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            {collapsed ? <ChevronRightIcon className="size-4" /> : <ChevronLeftIcon className="size-4" />}
          </button>
        </div>
      </div>
    </>
  );
}
