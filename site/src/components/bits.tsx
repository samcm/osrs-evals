/**
 * Small shared pieces on lab's components: a tooltip on any element (Tip), segmented controls
 * (SegmentedControl, optionally bound to a URL param), a disclosure, code, empty states and a run's
 * outcome. Identity marks are in marks.tsx.
 */

import type { JSX, ReactElement, ReactNode } from 'react';
import clsx from 'clsx';
import type { Run } from '@/data/types';
import { outcomeWord } from '@/lib/evals';
import { useSearchUpdate } from '@/lib/search';
import { Tooltip } from '@/components/Overlays/Tooltip';
import { SegmentedControl } from '@/components/Forms/SegmentedControl';
import { Disclosure as LabDisclosure } from '@/components/Layout/Disclosure';

/**
 * The Tooltip on an element, the element itself its trigger: the one way to say more on hover
 * (never the browser's own `title`). Without content it is just the element.
 */
export function Tip({
  content,
  children,
  side,
  className,
}: {
  content: ReactNode;
  children: ReactElement;
  side?: 'top' | 'right' | 'bottom' | 'left';
  /** Classes for the tooltip's panel, such as a wider `max-w-*` */
  className?: string;
}): JSX.Element {
  return (
    <Tooltip content={content} side={side} className={className}>
      {children}
    </Tooltip>
  );
}

/** A run's outcome: a mark and a word. Finished is a filled dot, not finished a hollow ring. */
export function Outcome({ run }: { run: Pick<Run, 'success'> }): JSX.Element {
  const word = outcomeWord(run);
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
      <span
        aria-hidden
        className={clsx(
          'size-2 shrink-0 rounded-full',
          word === 'Finished' && 'bg-success',
          word === 'Not finished' && 'border-2 border-danger',
          word === 'Scored' && 'bg-muted-50'
        )}
      />
      <span className={clsx(word === 'Finished' && 'text-success', word === 'Not finished' && 'text-danger')}>
        {word}
      </span>
    </span>
  );
}

export interface SegmentedOption<T extends string> {
  value: T;
  label: ReactNode;
  /** Said on hover and read as the option's name, when the label is a mark or a short word */
  title?: string;
}

/** One choice of a few, as lab's SegmentedControl; the selected option takes the primary tint. */
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
  /** Ignored: lab's controls share one height (a SelectMenu's and a Button's) */
  size?: 'sm' | 'default';
  className?: string;
}): JSX.Element {
  return (
    <SegmentedControl ariaLabel={label} value={value} options={options} onChange={onChange} className={className} />
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
}): JSX.Element {
  const update = useSearchUpdate();
  return (
    <Segmented
      label={label}
      value={value}
      options={options}
      className={className}
      onChange={v => update({ [param]: v }, { resetPage })}
    />
  );
}

/** A collapsed block of content behind a one-line trigger: lab's Disclosure, `meta` at its right. */
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
}): JSX.Element {
  return (
    <LabDisclosure
      title={title}
      rightContent={meta && <span className="text-xs text-muted">{meta}</span>}
      defaultOpen={defaultOpen}
      className="min-w-0"
    >
      {children}
    </LabDisclosure>
  );
}

/** Preformatted text in Geist Mono that wraps on narrow screens. */
export function CodeBlock({
  children,
  tone = 'default',
  className,
}: {
  children: ReactNode;
  tone?: 'default' | 'danger';
  className?: string;
}): JSX.Element {
  return (
    <pre
      className={clsx(
        'max-h-96 overflow-auto rounded-sm border px-3 py-2 font-mono text-xs/5 wrap-break-word whitespace-pre-wrap',
        tone === 'danger' ? 'border-danger-20 bg-danger-5 text-danger' : 'border-border bg-well text-foreground',
        className
      )}
    >
      {children}
    </pre>
  );
}

/** What is missing, in one short sentence, as lab's tables say it: a muted line. */
export function Empty({ children, className }: { children: ReactNode; className?: string }): JSX.Element {
  return <p className={clsx('py-12 text-center text-sm text-muted', className)}>{children}</p>;
}

/** Text that reads as a link, for in-table links and inline links. */
export const linkClassName =
  'text-foreground underline decoration-border underline-offset-4 transition-colors hover:text-primary hover:decoration-primary';
