/**
 * Page structure, as shadcn's own dashboard: the app header names the page (breadcrumb), and the
 * content is a column of Cards. Nothing here invents its own look; these are thin compositions of
 * the library so every page is built the same way.
 *
 *   PageHeader   the page's one-line description, its facts and actions (never its name: the
 *                header bar has it)
 *   PageTabs     the page's views (`?tab=`)
 *   PageToolbar  a row of controls that drive the cards below
 *   PageSection  a Card: CardHeader (CardTitle, CardDescription, CardAction) and CardContent
 */

import type { ReactNode } from 'react';
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useSearchUpdate } from '@/lib/search';
import { cn } from '@/lib/utils';

export interface MetaItem {
  term: string;
  value: ReactNode;
}

/** Kept for pages that still import it; the page's name lives in the header bar. */
export const pageTitleClassName = 'min-w-0 text-base font-medium';

export function PageHeader({
  mark,
  description,
  meta,
  actions,
  className,
}: {
  /** The page's sprite or logo at 40, beside the description and facts */
  mark?: ReactNode;
  /** Ignored: the header bar names the page */
  title?: ReactNode;
  description?: ReactNode;
  meta?: MetaItem[];
  actions?: ReactNode;
  className?: string;
}) {
  if (!description && !(meta && meta.length) && !actions) return null;
  return (
    <header className={cn('flex flex-col gap-3 md:flex-row md:items-center md:justify-between', className)}>
      <div className="flex min-w-0 items-center gap-3">
      {mark}
      {/* One line where it fits: the description, then each fact */}
      <div className="flex min-w-0 flex-wrap items-baseline gap-x-6 gap-y-1 text-sm">
        {description && <p className="max-w-prose text-pretty text-muted-foreground">{description}</p>}
        {meta && meta.length > 0 && (
          <dl className="contents">
            {meta.map(m => (
              <div key={m.term} className="flex min-w-0 items-baseline gap-2">
                <dt className="whitespace-nowrap text-muted-foreground">{m.term}</dt>
                <dd className="min-w-0 tabular-nums **:font-normal">{m.value}</dd>
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

/** A row of controls that drive the cards below it. */
export function PageToolbar({ label, children, className }: { label: string; children: ReactNode; className?: string }) {
  return (
    <div role="toolbar" aria-label={label} className={cn('flex flex-wrap items-center gap-2', className)}>
      {children}
    </div>
  );
}

/** A section of a page: a shadcn Card. Tables inside run to the card's edges. */
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
}) {
  return (
    <Card className={cn('min-w-0', className)}>
      {(title || description || actions) && (
        <CardHeader>
          {title && <CardTitle className="flex min-w-0 items-center gap-2">{title}</CardTitle>}
          {description && <CardDescription>{description}</CardDescription>}
          {actions && <CardAction className="flex flex-wrap items-center gap-2">{actions}</CardAction>}
        </CardHeader>
      )}
      <CardContent className="flex min-w-0 flex-col gap-4 has-data-[slot=table-container]:px-0">{children}</CardContent>
    </Card>
  );
}

export interface PageTab<T extends string> {
  value: T;
  label: ReactNode;
}

/**
 * The page's views, bound to `?tab=`; the first tab is the default and leaves the URL clean. The
 * underline starts flush with the cards below, and a row of tabs too wide for a phone scrolls
 * sideways inside itself instead of widening the page.
 */
export function PageTabs<T extends string>({ value, tabs }: { value: T; tabs: PageTab<T>[] }) {
  const update = useSearchUpdate();
  return (
    <Tabs value={value} onValueChange={v => update({ tab: v === tabs[0].value ? undefined : v })} className="min-w-0">
      {/* Room under the list for the active underline, which overflow would otherwise clip */}
      <div className="overflow-x-auto pb-1.5">
        <TabsList variant="line" className="px-0">
          {tabs.map(t => (
            <TabsTrigger key={t.value} value={t.value}>
              {t.label}
            </TabsTrigger>
          ))}
        </TabsList>
      </div>
    </Tabs>
  );
}
