/**
 * Page structure, as lab's pages: the breadcrumb bar names the page, and the content is a column of
 * lab Cards. These are thin compositions of lab's components so every page is built the same way.
 *
 *   PageHeader   the page's one-line description, its facts and actions (never its name: the
 *                breadcrumb bar has it)
 *   PageHero     a detail page's opening card: its mark, lead, detail and facts
 *   PageTabs     the page's views (`?tab=`), lab's Tab in a ScrollableTabs strip
 *   PageToolbar  a row of controls that drive the cards below
 *   PageSection  a lab Card: title, subtitle and actions in its header, the content in its body
 */

import type { JSX, ReactNode } from 'react';
import { TabGroup } from '@headlessui/react';
import clsx from 'clsx';
import { Card } from '@/components/Layout/Card';
import { Tab } from '@/components/Navigation/Tab';
import { ScrollableTabs } from '@/components/Navigation/ScrollableTabs';
import { useSearchUpdate } from '@/lib/search';

export interface MetaItem {
  term: string;
  value: ReactNode;
}

export function PageHeader({
  mark,
  description,
  meta,
  actions,
  className,
}: {
  /** The page's sprite or logo at 40, beside the description and facts */
  mark?: ReactNode;
  /** Ignored: the breadcrumb bar names the page */
  title?: ReactNode;
  description?: ReactNode;
  meta?: MetaItem[];
  actions?: ReactNode;
  className?: string;
}): JSX.Element | null {
  if (!description && !(meta && meta.length) && !actions) return null;
  return (
    <header className={clsx('flex flex-col gap-3 md:flex-row md:items-center md:justify-between', className)}>
      <div className="flex min-w-0 items-center gap-3">
        {mark}
        {/* One line where it fits: the description, then each fact */}
        <div className="flex min-w-0 flex-wrap items-baseline gap-x-6 gap-y-1 text-sm">
          {description && <p className="max-w-2xl text-pretty text-muted">{description}</p>}
          {meta && meta.length > 0 && (
            <dl className="contents">
              {meta.map(m => (
                <div key={m.term} className="flex min-w-0 items-baseline gap-2">
                  <dt className="whitespace-nowrap text-muted">{m.term}</dt>
                  <dd className="min-w-0 text-foreground tabular-nums">{m.value}</dd>
                </div>
              ))}
            </dl>
          )}
        </div>
      </div>
      {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
    </header>
  );
}

/**
 * A page's opening card: its sprite on a tile, the lead (an eval's goal, or what a run did) at full
 * strength with any detail under it (what the eval counts and what makes it hard), then the facts
 * as terms over values, with actions on the right. `children` go under it inside the card, edge to
 * edge (the eval's note and Setup): give each section `border-t border-border px-card-inset py-3`.
 */
export function PageHero({
  mark,
  lead,
  detail,
  meta,
  actions,
  children,
}: {
  mark?: ReactNode;
  lead?: ReactNode;
  detail?: ReactNode;
  meta: MetaItem[];
  actions?: ReactNode;
  children?: ReactNode;
}): JSX.Element {
  return (
    <Card>
      <div className="flex flex-col gap-5 sm:flex-row sm:items-start">
        {mark && (
          <span className="flex size-16 shrink-0 items-center justify-center rounded-md bg-muted-10">{mark}</span>
        )}
        <div className="flex min-w-0 flex-1 flex-col gap-4">
          {(lead || detail) && (
            <div className="flex max-w-3xl flex-col gap-1.5">
              {lead && <p className="text-base font-medium text-pretty text-foreground">{lead}</p>}
              {detail && <p className="text-sm text-pretty text-muted">{detail}</p>}
            </div>
          )}
          <dl className="flex flex-wrap gap-x-8 gap-y-3">
            {meta.map(m => (
              <div key={m.term} className="flex min-w-0 flex-col gap-0.5">
                <dt className="text-xs text-muted">{m.term}</dt>
                <dd className="text-sm text-foreground tabular-nums">{m.value}</dd>
              </div>
            ))}
          </dl>
        </div>
        {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
      </div>
      {children && <div className="mx-card-bleed mt-4 mb-card-bleed sm:mt-5">{children}</div>}
    </Card>
  );
}

/** A row of controls that drive the cards below it. */
export function PageToolbar({
  label,
  children,
  className,
}: {
  label: string;
  children: ReactNode;
  className?: string;
}): JSX.Element {
  return (
    <div role="toolbar" aria-label={label} className={clsx('flex flex-wrap items-center gap-2', className)}>
      {children}
    </div>
  );
}

/** A section of a page: a lab Card. Tables inside run to the card's edges. */
export function PageSection({
  title,
  description,
  actions,
  className,
  children,
}: {
  title?: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  /** Kept for compatibility; every section is a card */
  lead?: boolean;
  className?: string;
  children: ReactNode;
}): JSX.Element {
  const header = title != null || description != null || actions != null;
  return (
    <Card
      title={header ? <span className="flex min-w-0 items-center gap-2">{title}</span> : undefined}
      subtitle={description}
      actions={actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      className={clsx('min-w-0', className)}
    >
      <div className="flex min-w-0 flex-col gap-4">{children}</div>
    </Card>
  );
}

export interface PageTab<T extends string> {
  value: T;
  label: ReactNode;
}

/**
 * The page's views, bound to `?tab=`; the first tab is the default and leaves the URL clean. A
 * strip of tabs too wide for a phone scrolls sideways inside itself instead of widening the page.
 * The tabs only choose the view: the page draws the open one under them.
 */
export function PageTabs<T extends string>({ value, tabs }: { value: T; tabs: PageTab<T>[] }): JSX.Element {
  const update = useSearchUpdate();
  const selected = Math.max(
    0,
    tabs.findIndex(t => t.value === value)
  );
  return (
    <TabGroup
      selectedIndex={selected}
      onChange={index => update({ tab: index === 0 ? undefined : tabs[index]?.value })}
      className="min-w-0"
    >
      <ScrollableTabs>
        {tabs.map(t => (
          <Tab key={t.value}>{t.label}</Tab>
        ))}
      </ScrollableTabs>
    </TabGroup>
  );
}
