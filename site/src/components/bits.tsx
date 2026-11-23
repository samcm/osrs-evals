/**
 * Small shared pieces on shadcn/ui: a tooltip on any element (Tip), segmented controls (ToggleGroup, optionally bound to a URL
 * param), a disclosure (Collapsible), code, empty states (Empty), the page title. Identity marks are in
 * marks.tsx.
 */

import { useState, type ReactElement, type ReactNode } from 'react';
import { ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { Run } from '@/data/types';
import { outcomeWord } from '@/lib/evals';
import { useSearchUpdate } from '@/lib/search';
import { PageHeader } from './page';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Empty as EmptyRoot, EmptyDescription } from '@/components/ui/empty';

/**
 * A shadcn Tooltip on an element, the element itself its trigger: the one way to say more on hover
 * (never the browser's own `title`). Without content it is just the element.
 */
export function Tip({ content, children, side }: { content: ReactNode; children: ReactElement; side?: 'top' | 'right' | 'bottom' | 'left' }) {
  if (content == null || content === '' || content === false) return children;
  return (
    <Tooltip>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      <TooltipContent side={side}>{content}</TooltipContent>
    </Tooltip>
  );
}

/** A run's outcome: a mark and a word. Finished is a filled dot, not finished a hollow ring. */
export function Outcome({ run }: { run: Pick<Run, 'success'> }) {
  const word = outcomeWord(run);
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
      <span
        aria-hidden
        className={cn(
          'size-2 shrink-0 rounded-full',
          word === 'Finished' && 'bg-success',
          word === 'Not finished' && 'border-2 border-destructive',
          word === 'Scored' && 'bg-muted-foreground/50'
        )}
      />
      <span className={cn(word === 'Finished' && 'text-success', word === 'Not finished' && 'text-destructive')}>{word}</span>
    </span>
  );
}

export interface SegmentedOption<T extends string> {
  value: T;
  label: ReactNode;
  /** Accessible name when the label is not plain text */
  title?: string;
}

/** One choice of a few, as a shadcn ToggleGroup (single, outline, small); the selected option takes the accent. */
export function Segmented<T extends string>({
  options,
  value,
  onChange,
  label,
  size = 'sm',
  className,
}: {
  options: SegmentedOption<T>[];
  value: T;
  onChange: (value: T) => void;
  /** The group's accessible name */
  label: string;
  /** `default` matches a Select's height, for a toolbar that mixes them */
  size?: 'sm' | 'default';
  className?: string;
}) {
  return (
    <ToggleGroup
      type="single"
      variant="outline"
      size={size}
      spacing={0}
      aria-label={label}
      value={value}
      // Radix lets a single group be emptied by clicking the selected item: keep the choice
      onValueChange={next => next && onChange(next as T)}
      className={className}
    >
      {options.map(option => (
        <Tip key={option.value} content={option.title}>
          <ToggleGroupItem value={option.value} aria-label={option.title}>
            {option.label}
          </ToggleGroupItem>
        </Tip>
      ))}
    </ToggleGroup>
  );
}

/**
 * A Segmented bound to a search param of the current route: selecting writes `param` (the route's
 * defineSearch drops it from the URL when it is the default).
 */
export function ParamSegmented<T extends string>({
  param,
  value,
  options,
  label,
  resetPage,
  className,
}: {
  param: string;
  /** The route's parsed value (with its default applied) */
  value: T;
  options: SegmentedOption<T>[];
  label: string;
  /** Changing this param also returns the page to the first */
  resetPage?: boolean;
  className?: string;
}) {
  const update = useSearchUpdate();
  return <Segmented label={label} value={value} options={options} className={className} onChange={v => update({ [param]: v }, { resetPage })} />;
}

/** A collapsed block of content behind a one-line trigger (shadcn Collapsible). */
export function Disclosure({
  title,
  meta,
  children,
  defaultOpen = false,
}: {
  title: ReactNode;
  meta?: ReactNode;
  children: ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <Collapsible open={open} onOpenChange={setOpen} className="min-w-0">
      <CollapsibleTrigger className="flex w-full items-center gap-2 rounded-md py-1 text-left text-xs font-medium text-muted-foreground transition-colors outline-none hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50">
        <ChevronRight aria-hidden className={cn('size-3.5 shrink-0 transition-transform', open && 'rotate-90')} />
        <span>{title}</span>
        {meta && <span className="font-normal">{meta}</span>}
      </CollapsibleTrigger>
      <CollapsibleContent className="mt-1">{children}</CollapsibleContent>
    </Collapsible>
  );
}

/** Preformatted text in Geist Mono that wraps on narrow screens. */
export function CodeBlock({ children, tone = 'default', className }: { children: ReactNode; tone?: 'default' | 'danger'; className?: string }) {
  return (
    <pre
      className={cn(
        'max-h-96 overflow-auto rounded-md border px-3 py-2 font-mono text-xs/5 wrap-break-word whitespace-pre-wrap',
        tone === 'danger' ? 'border-destructive/20 bg-destructive/5 text-destructive' : 'bg-muted/50 text-foreground',
        className
      )}
    >
      {children}
    </pre>
  );
}

/** What is missing, in one short sentence: shadcn's Empty, its description alone. */
export function Empty({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <EmptyRoot className={cn('p-6', className)}>
      <EmptyDescription>{children}</EmptyDescription>
    </EmptyRoot>
  );
}

/**
 * The page's one H1, with optional controls beside it.
 * @deprecated Use PageHeader, which this now draws, so the title has one look everywhere.
 */
export function PageTitle({ children, aside }: { children: ReactNode; aside?: ReactNode }) {
  return <PageHeader title={children} actions={aside} />;
}

/** Text that reads as a link, for in-table links and inline links. */
export const linkClassName = 'text-foreground underline decoration-border underline-offset-4 transition-colors hover:text-primary hover:decoration-primary';
