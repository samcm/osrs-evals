import { useEffect, useState, type ReactNode } from 'react';
import { Dialog, DialogBackdrop, DialogPanel } from '@headlessui/react';
import { Link, useRouter, useRouterState } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';
import clsx from 'clsx';
import { indexQuery } from '@/data/queries';
import { useSearchUpdate } from '@/lib/search';
import { setTheme, useTheme, type Theme } from '@/lib/theme';
import { Segmented } from './bits';
import { EvalMark } from './marks';

const navItemClassName =
  'flex items-center rounded-sm px-2 py-1 text-sm/5 font-medium text-muted transition-colors hover:bg-foreground-5 hover:text-foreground focus-visible:ring-2 focus-visible:ring-primary-50';
const navItemActiveClassName = 'bg-foreground-7 text-foreground!';

function NavLink({ to, params, mark, children }: { to: string; params?: Record<string, string>; mark?: ReactNode; children: ReactNode }) {
  return (
    <Link
      to={to as '/'}
      params={params as never}
      className={clsx(navItemClassName, mark && 'gap-2')}
      activeProps={{ className: navItemActiveClassName }}
      activeOptions={{ exact: to === '/', includeSearch: false }}
    >
      {mark}
      <span className="truncate" title={typeof children === 'string' ? children : undefined}>
        {children}
      </span>
    </Link>
  );
}

function Nav() {
  const { data } = useQuery(indexQuery);
  return (
    <nav className="flex flex-col gap-y-4">
      <div className="space-y-0.5">
        <NavLink to="/">Overview</NavLink>
      </div>
      <div>
        <div className="mb-1 px-2 text-xs/5 font-medium text-muted">Evals</div>
        <div className="space-y-0.5">
          {data?.evals.map(e => (
            <NavLink key={e.id} to="/evals/$evalId" params={{ evalId: e.id }} mark={<EvalMark evalId={e.id} size={16} title="" />}>
              {e.title}
            </NavLink>
          ))}
        </div>
      </div>
      <div className="space-y-0.5">
        <NavLink to="/compare">Compare</NavLink>
        <NavLink to="/runs">Runs</NavLink>
        <NavLink to="/ideas">Ideas</NavLink>
      </div>
    </nav>
  );
}

function Wordmark() {
  return (
    <Link to="/" className="flex items-center gap-2 rounded-sm focus-visible:ring-2 focus-visible:ring-primary-50">
      <img data-sprite src="/assets/items/995-10000.png" alt="" width={32} height={32} className="size-7" />
      <span className="font-game text-base/4 font-normal text-foreground">2004scape evals</span>
    </Link>
  );
}

/** Light or dark as the reader's preference; it also drops a shared link's ?theme= */
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

export interface Crumb {
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
  const names: Record<string, string> = { runs: 'Runs', compare: 'Compare', models: 'Models', ideas: 'Ideas' };
  return [{ label: names[parts[0]] ?? parts[0] }];
}

/**
 * The breadcrumb: on narrow screens only the parent and the current page show. Parents give way
 * first (they shrink ten times faster, down to a few letters); the current page keeps its place.
 */
function Breadcrumb() {
  const crumbs = useCrumbs();
  return (
    <nav aria-label="Breadcrumb" className="min-w-0 flex-1">
      <ol className="flex min-w-0 items-center gap-2 text-sm/6 whitespace-nowrap">
        {crumbs.map((crumb, i) => {
          const last = i === crumbs.length - 1;
          const mark = crumb.evalId ? <EvalMark evalId={crumb.evalId} size={20} title="" /> : null;
          return (
            <li
              key={`${crumb.label}-${i}`}
              className={clsx(
                'flex min-w-0 items-center gap-2',
                last ? 'shrink' : 'min-w-12 shrink-10',
                !last && i < crumbs.length - 2 && 'max-sm:hidden'
              )}
            >
              {last || !crumb.to ? (
                <span
                  aria-current={last ? 'page' : undefined}
                  className={clsx('flex min-w-0 items-center gap-1.5 font-medium text-foreground', crumb.mono && 'font-mono text-xs')}
                  title={crumb.label}
                >
                  {mark}
                  <span className="truncate">{crumb.label}</span>
                </span>
              ) : (
                <>
                  <Link
                    to={crumb.to as '/'}
                    params={crumb.params as never}
                    className="flex min-w-0 items-center gap-1.5 text-muted transition-colors hover:text-foreground"
                    title={crumb.label}
                  >
                    {mark}
                    <span className="truncate">{crumb.label}</span>
                  </Link>
                  <span aria-hidden className="shrink-0 text-muted-50">
                    /
                  </span>
                </>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

/** The app shell: a fixed sidebar on large screens, a dialog under a menu button below lg, a sticky top bar. */
export function Layout({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const router = useRouter();

  useEffect(
    () =>
      router.subscribe('onBeforeLoad', event => {
        if (event.pathChanged) setOpen(false);
      }),
    [router]
  );

  return (
    <div className="min-h-dvh bg-background">
      <Dialog open={open} onClose={setOpen} aria-label="Navigation" className="relative z-30 lg:hidden">
        <DialogBackdrop
          transition
          className="fixed inset-0 bg-background transition-opacity duration-200 ease-linear data-closed:opacity-0"
        />
        <div className="fixed inset-0 flex pt-12">
          <DialogPanel
            transition
            className="relative flex w-full flex-1 flex-col overflow-y-auto bg-background px-4 py-4 transition duration-200 ease-in-out data-closed:-translate-x-full"
          >
            <Nav />
          </DialogPanel>
        </div>
      </Dialog>

      <aside className="hidden border-r border-border bg-background lg:fixed lg:inset-y-0 lg:z-40 lg:flex lg:w-60 lg:flex-col">
        <div className="flex h-12 shrink-0 items-center border-b border-border px-3">
          <Wordmark />
        </div>
        <div className="flex grow flex-col overflow-y-auto p-3">
          <Nav />
        </div>
      </aside>

      <div className="lg:pl-60">
        <header className="sticky top-0 z-40 flex h-12 items-center gap-3 border-b border-border bg-background px-4 sm:px-6 lg:px-8">
          <button
            type="button"
            onClick={() => setOpen(!open)}
            aria-expanded={open}
            className="-ml-1 h-7 shrink-0 rounded-sm px-2 text-xs font-medium text-foreground outline -outline-offset-1 outline-border transition-colors hover:bg-surface focus-visible:ring-2 focus-visible:ring-primary-50 lg:hidden"
          >
            {open ? 'Close' : 'Menu'}
          </button>
          <Breadcrumb />
          <ThemeToggle />
        </header>
        <main className="mx-auto w-full max-w-page p-4 sm:p-6 lg:p-8">{children}</main>
      </div>
    </div>
  );
}
