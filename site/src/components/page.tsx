/**
 * Page structure, so a page reads as one thing rather than a stack of boxes:
 *
 *   PageHeader        the title, its description, meta, actions
 *   PageTabs          the page's views (`?tab=`), when it has more than one
 *   PageToolbar       the page's shared controls (x measure, scope, filters), sticky under the header
 *   PageSection lead  the centrepiece: a full-bleed band on the card colour
 *   PageSection …     the rest, separated by space and a hairline, each titled at CardTitle's level
 *
 * Sections are not cards. Use a Card only for a thing that is genuinely separate (a run's player, a
 * popover-like panel), never a card inside a section's band or a card per chart. Spacing is the
 * theme's rhythm: `gutter` between sections and around the page, `stack` inside a section.
 *
 * The header fixes the type hierarchy so pages never reinvent it:
 *
 *   level 1  title        text-2xl semibold      one per page (the H1), beside its 40px mark
 *   level 2  description  text-base muted        what it is, a sentence
 *   level 3  meta         text-sm, terms muted   facts and the result, as a <dl>; never emphasised
 *   then     CardTitle    text-base medium       each section's title (PageSection) and card title
 *
 * The mark and the title share one row and are centred on each other; the description, meta and
 * actions hang under the title (under the mark too on phones, so the text keeps its width).
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

/** The H1's look, for the rare page that can't use PageHeader. */
export const pageTitleClassName = 'min-w-0 text-2xl/8 font-semibold tracking-tight text-balance wrap-break-word';

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
  /** Buttons on the right, centred on the title's row (under the text on phones) */
  actions?: ReactNode;
  className?: string;
}) {
  // Under the title on wide screens; the full width on phones
  const under = mark ? 'col-span-2 md:col-span-1 md:col-start-2' : undefined;
  return (
    <header className={cn('flex flex-col gap-4 md:flex-row md:items-start md:justify-between', className)}>
      <div className={cn('grid min-w-0 flex-1 items-center gap-x-4 gap-y-1', mark ? 'grid-cols-[auto_minmax(0,1fr)]' : 'grid-cols-1')}>
        {mark && <div className="flex size-10 shrink-0 items-center justify-center">{mark}</div>}
        <h1 className={pageTitleClassName}>{title}</h1>
        {description && <p className={cn('max-w-prose text-base text-pretty text-muted-foreground', under)}>{description}</p>}
        {meta && meta.length > 0 && (
          <dl className={cn('flex flex-wrap gap-x-6 gap-y-1 pt-2 text-sm', under)}>
            {meta.map(m => (
              <div key={m.term} className="flex min-w-0 items-baseline gap-2">
                <dt className="whitespace-nowrap text-muted-foreground">{m.term}</dt>
                {/* Meta is never a second headline: whatever a page passes, it keeps the body weight */}
                <dd className="min-w-0 tabular-nums **:font-normal">{m.value}</dd>
              </div>
            ))}
          </dl>
        )}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap items-center gap-2 md:min-h-10">{actions}</div>}
    </header>
  );
}

/**
 * The page's shared controls (x measure, scope, filters) in one row that sticks under the app
 * header while the page scrolls, edge to edge of the page with a hairline under it. Controls are
 * library components at their own size, gap-2 apart; push secondary ones right with `ml-auto`.
 */
export function PageToolbar({ label, children, className }: { label: string; children: ReactNode; className?: string }) {
  return (
    <div
      role="toolbar"
      aria-label={label}
      className={cn('sticky top-header z-10 -mx-gutter flex flex-wrap items-center gap-2 border-b bg-background px-gutter py-2', className)}
    >
      {children}
    </div>
  );
}

/**
 * A section of a page: a title (at CardTitle's level) with an optional description and actions,
 * then its content. Sections are separated by the page's gutter and a hairline; the first one has
 * no hairline (nor does one right after the lead band). `lead` makes it the page's centrepiece: a full-bleed band on the card colour.
 * Tables inside run flush with the section's edges (DataTable reads --card-spacing).
 */
export function PageSection({
  title,
  description,
  actions,
  lead,
  className,
  children,
}: {
  title?: ReactNode;
  /** A unit, scope or window the content doesn't state; never a restatement */
  description?: ReactNode;
  /** Controls for this section only, right of the title */
  actions?: ReactNode;
  /** The page's centrepiece band */
  lead?: boolean;
  className?: string;
  children: ReactNode;
}) {
  return (
    <section
      data-lead={lead || undefined}
      className={cn(
        'flex min-w-0 flex-col gap-stack [--card-spacing:0px]',
        lead
          ? '-mx-gutter border-y bg-card p-gutter [[role=toolbar]+&]:-mt-gutter [[role=toolbar]+&]:border-t-0'
          : 'border-t pt-gutter first-of-type:border-t-0 first-of-type:pt-0 [[data-lead]+&]:border-t-0 [[data-lead]+&]:pt-0',
        className
      )}
    >
      {(title || actions) && (
        <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
          <div className="flex min-w-0 flex-col gap-1">
            {title && <h2 className="flex min-w-0 items-center gap-2 text-base leading-snug font-medium">{title}</h2>}
            {description && <p className="text-sm text-muted-foreground">{description}</p>}
          </div>
          {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
        </div>
      )}
      {children}
    </section>
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
