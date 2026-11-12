import type { ReactNode } from 'react';
import clsx from 'clsx';

interface CardProps {
  title?: ReactNode;
  /** Only for a unit, scope or window */
  subtitle?: ReactNode;
  actions?: ReactNode;
  children?: ReactNode;
  className?: string;
  /** Body without padding, for tables and lists that run to the edges */
  flush?: boolean;
  id?: string;
}

/**
 * Core content container, after lab's Card: a compact header row (title, optional subtitle,
 * right-aligned actions) separated by a single rule from a body whose inset matches the header.
 */
export function Card({ title, subtitle, actions, children, className, flush = false, id }: CardProps) {
  return (
    <section
      id={id}
      className={clsx(
        'relative min-w-0 divide-y divide-border overflow-hidden rounded-sm bg-surface outline -outline-offset-1 outline-border',
        className
      )}
    >
      {title !== undefined && (
        <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2 px-4 py-3 sm:px-5">
          <div className="min-w-0 flex-1 basis-56">
            <h2 className="text-sm/6 font-semibold wrap-break-word text-foreground">{title}</h2>
            {subtitle && <p className="text-xs/5 text-muted">{subtitle}</p>}
          </div>
          {actions && <div className="-my-1 flex shrink-0 items-center gap-2">{actions}</div>}
        </div>
      )}
      <div data-slot="card-body" className={clsx('relative card-inset empty:hidden', !flush && 'p-4 sm:p-5')}>
        {children}
      </div>
    </section>
  );
}
