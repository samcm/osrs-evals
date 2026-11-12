/** Small shared pieces: sprites, outcome marks, swatches, badges, segmented control, disclosure. */

import type { ReactNode } from 'react';
import { Disclosure as HeadlessDisclosure, DisclosureButton, DisclosurePanel } from '@headlessui/react';
import clsx from 'clsx';
import type { Run } from '@/data/types';
import { evalArt, outcomeWord } from '@/lib/evals';
import { agentInfo, modelInfo, variantOf, type SeriesColor } from '@/lib/series';

const spriteSizeClassName = { sm: 'size-6', md: 'size-8', lg: 'size-8 sm:size-12' } as const;

/** The eval's item sprites, pixel-crisp. */
export function EvalSprites({ evalId, size = 'md' }: { evalId: string; size?: keyof typeof spriteSizeClassName }) {
  const { items } = evalArt(evalId);
  if (items.length === 0) return null;
  return (
    <span className="inline-flex shrink-0 items-center">
      {items.map(item => (
        <img
          key={item.id}
          data-sprite
          src={`/assets/items/${item.id}.png`}
          alt={item.name}
          title={item.name}
          width={32}
          height={32}
          className={clsx(spriteSizeClassName[size], 'object-contain')}
        />
      ))}
    </span>
  );
}

/** A run's outcome: a mark and a word. Finished is a filled dot, not finished a hollow ring. */
export function Outcome({ run }: { run: Pick<Run, 'success'> }) {
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

export function Swatch({ color, className }: { color: SeriesColor; className?: string }) {
  return <span aria-hidden className={clsx('inline-block size-2.5 shrink-0 rounded-2xs', color.swatchClassName, className)} />;
}

export function ModelLabel({ model }: { model: string }) {
  const info = modelInfo(model);
  return (
    <span className="inline-flex items-center gap-2 whitespace-nowrap">
      <Swatch color={info.color} />
      <span title={model}>{info.name}</span>
    </span>
  );
}

export function AgentLabel({ agent, fallback }: { agent: string; fallback?: string }) {
  const info = agentInfo(agent, fallback);
  return (
    <span className="inline-flex items-center gap-2 whitespace-nowrap">
      <Swatch color={info.color} />
      <span title={agent}>{info.name}</span>
    </span>
  );
}

export function VariantLabel({ run }: { run: Pick<Run, 'model' | 'agent' | 'agent_name'> }) {
  const variant = variantOf(run);
  return (
    <span className="inline-flex items-center gap-2 whitespace-nowrap">
      <Swatch color={variant.color} />
      <span>{variant.name}</span>
    </span>
  );
}

const badgeClassName = {
  gray: 'bg-tag-gray-wash text-tag-gray inset-ring inset-ring-tag-gray-ring',
  teal: 'bg-tag-teal-wash text-tag-teal inset-ring inset-ring-tag-teal-ring',
} as const;

export function Badge({ color = 'gray', children }: { color?: keyof typeof badgeClassName; children: ReactNode }) {
  return (
    <span
      className={clsx(
        'inline-flex items-center rounded-xs px-1.5 py-0.5 text-xs font-medium whitespace-nowrap',
        badgeClassName[color]
      )}
    >
      {children}
    </span>
  );
}

/** A segmented control; the selected option takes the accent. */
export function Segmented<T extends string>({
  options,
  value,
  onChange,
  label,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
  label: string;
}) {
  return (
    <div role="radiogroup" aria-label={label} className="isolate inline-flex rounded-sm">
      {options.map((option, i) => {
        const selected = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => onChange(option.value)}
            className={clsx(
              'relative h-7 px-2.5 text-xs font-medium whitespace-nowrap outline -outline-offset-1 transition-colors focus-visible:z-10 focus-visible:ring-2 focus-visible:ring-primary-50',
              i > 0 && '-ml-px',
              i === 0 && 'rounded-l-sm',
              i === options.length - 1 && 'rounded-r-sm',
              selected
                ? 'z-10 bg-primary-soft text-primary outline-primary-50'
                : 'bg-surface text-muted outline-border hover:bg-background hover:text-foreground'
            )}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

/** A collapsed block of content behind a one-line button. */
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
  return (
    <HeadlessDisclosure as="div" defaultOpen={defaultOpen} className="min-w-0">
      {({ open }) => (
        <>
          <DisclosureButton className="group flex w-full items-center gap-2 rounded-sm py-1 text-left text-xs font-medium text-muted transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-primary-50">
            <span aria-hidden className="w-2 shrink-0 font-mono">
              {open ? '−' : '+'}
            </span>
            <span>{title}</span>
            {meta && <span className="font-normal text-muted">{meta}</span>}
          </DisclosureButton>
          <DisclosurePanel className="mt-1">{children}</DisclosurePanel>
        </>
      )}
    </HeadlessDisclosure>
  );
}

/** Preformatted text in Geist Mono that wraps on narrow screens. */
export function CodeBlock({ children, tone = 'default' }: { children: ReactNode; tone?: 'default' | 'danger' }) {
  return (
    <pre
      className={clsx(
        'scrollbar-thin max-h-96 overflow-auto rounded-sm px-3 py-2 font-mono text-xs/5 wrap-break-word whitespace-pre-wrap outline -outline-offset-1',
        tone === 'danger' ? 'bg-danger-5 text-danger outline-danger-20' : 'bg-background text-foreground outline-border'
      )}
    >
      {children}
    </pre>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <p className="py-6 text-center text-sm text-muted">{children}</p>;
}

export function PageTitle({ children, aside }: { children: ReactNode; aside?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
      <h1 className="text-2xl/8 font-semibold tracking-tight text-foreground">{children}</h1>
      {aside}
    </div>
  );
}

/** Text that reads as a link, for in-table links and inline links. */
export const linkClassName = 'text-foreground underline decoration-border underline-offset-4 transition-colors hover:decoration-primary hover:text-primary';
