/**
 * Small shared pieces on shadcn/ui: segmented controls (ToggleGroup, optionally bound to a URL
 * param), a disclosure (Collapsible), code, empty states, the page title. Identity marks are in
 * marks.tsx.
 */

import { useState, type ReactNode } from 'react';
import { cn } from '@/lib/utils';
import type { Run } from '@/data/types';
import { outcomeWord } from '@/lib/evals';
import { useSearchUpdate } from '@/lib/search';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';

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
  className,
}: {
  options: SegmentedOption<T>[];
  value: T;
  onChange: (value: T) => void;
  /** The group's accessible name */
  label: string;
  className?: string;
}) {
  return (
    <ToggleGroup
      type="single"
      variant="outline"
      size="sm"
      spacing={0}
      aria-label={label}
      value={value}
      // Radix lets a single group be emptied by clicking the selected item: keep the choice
      onValueChange={next => next && onChange(next as T)}
      className={className}
    >
      {options.map(option => (
        <ToggleGroupItem key={option.value} value={option.value} aria-label={option.title} title={option.title}>
          {option.label}
        </ToggleGroupItem>
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
        <span aria-hidden className="w-2 shrink-0 font-mono">
          {open ? '−' : '+'}
        </span>
        <span>{title}</span>
        {meta && <span className="font-normal">{meta}</span>}
      </CollapsibleTrigger>
      <CollapsibleContent className="mt-1">{children}</CollapsibleContent>
    </Collapsible>
  );
}

/** Preformatted text in Geist Mono that wraps on narrow screens. */
export function CodeBlock({ children, tone = 'default' }: { children: ReactNode; tone?: 'default' | 'danger' }) {
  return (
    <pre
      className={cn(
        'max-h-96 overflow-auto rounded-md border px-3 py-2 font-mono text-xs/5 wrap-break-word whitespace-pre-wrap',
        tone === 'danger' ? 'border-destructive/20 bg-destructive/5 text-destructive' : 'bg-muted/50 text-foreground'
      )}
    >
      {children}
    </pre>
  );
}

/** What is missing, in one short sentence. */
export function Empty({ children }: { children: ReactNode }) {
  return <p className="py-6 text-center text-sm text-muted-foreground">{children}</p>;
}

/** The page's one H1, with optional controls beside it. */
export function PageTitle({ children, aside }: { children: ReactNode; aside?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
      <h1 className="text-2xl font-semibold tracking-tight">{children}</h1>
      {aside}
    </div>
  );
}

/** Text that reads as a link, for in-table links and inline links. */
export const linkClassName = 'text-foreground underline decoration-border underline-offset-4 transition-colors hover:text-primary hover:decoration-primary';
