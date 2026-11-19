/**
 * Page structure: every page is a PageHeader, then (when it has more than one view) PageTabs, then
 * sections. The header fixes the type hierarchy so pages never reinvent it:
 *
 *   level 1  title        text-2xl semibold      one per page (the H1)
 *   level 2  description  text-base muted        what it is, one line
 *   level 3  meta         text-sm, terms muted   facts and the headline result, as a <dl>
 *   then     CardTitle    the library's size     each section
 *
 *   <PageHeader mark={<EvalMark …/>} title="Cook 500 shrimps" description={goal}
 *     meta={[{ term: 'Budget', value: '30,000 ticks' }]} actions={<Button …/>} />
 *   <PageTabs value={search.tab} tabs={[{ value: 'overview', label: 'Overview' }, …]} />
 */

import type { ReactNode } from 'react';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useSearchUpdate } from '@/lib/search';
import { cn } from '@/lib/utils';

export interface MetaItem {
  term: string;
  value: ReactNode;
}

export function PageHeader({
  mark,
  title,
  description,
  meta,
  actions,
  className,
}: {
  /** A sprite or logo beside the title, 40px */
  mark?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  /** Facts under the description, each its own term and value */
  meta?: MetaItem[];
  /** Buttons on the right, top-aligned with the title */
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <header className={cn('flex flex-col gap-4 md:flex-row md:items-start md:justify-between', className)}>
      <div className="flex min-w-0 items-start gap-4">
        {mark && <div className="flex size-10 shrink-0 items-center justify-center">{mark}</div>}
        <div className="flex min-w-0 flex-col gap-1">
          <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
          {description && <p className="text-base text-muted-foreground">{description}</p>}
          {meta && meta.length > 0 && (
            <dl className="mt-2 flex flex-wrap gap-x-6 gap-y-2 text-sm">
              {meta.map(m => (
                <div key={m.term} className="flex items-baseline gap-2">
                  <dt className="text-muted-foreground">{m.term}</dt>
                  <dd className="tabular-nums">{m.value}</dd>
                </div>
              ))}
            </dl>
          )}
        </div>
      </div>
      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </header>
  );
}

export interface PageTab<T extends string> {
  value: T;
  label: ReactNode;
}

/** The page's views, bound to `?tab=`; the first tab is the default and leaves the URL clean. */
export function PageTabs<T extends string>({ value, tabs }: { value: T; tabs: PageTab<T>[] }) {
  const update = useSearchUpdate();
  return (
    <Tabs value={value} onValueChange={v => update({ tab: v === tabs[0].value ? undefined : v })}>
      <TabsList variant="line">
        {tabs.map(t => (
          <TabsTrigger key={t.value} value={t.value}>
            {t.label}
          </TabsTrigger>
        ))}
      </TabsList>
    </Tabs>
  );
}
