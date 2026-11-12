import type { ReactNode } from 'react';
import clsx from 'clsx';

export interface Stat {
  name: string;
  value: ReactNode;
  /** A unit or scope on its own line under the value */
  unit?: ReactNode;
  valueClassName?: string;
}

/**
 * Headline numbers as one KPI strip (lab's Stats): a single hairline panel split into cells by
 * internal rules. Each cell draws its rule on its right and bottom edges; the panel clips the rules
 * on its outer edge, so any column count gets clean dividers.
 */
export function Stats({ stats, className }: { stats: Stat[]; className?: string }) {
  return (
    <dl
      className={clsx(
        'grid overflow-hidden rounded-sm bg-surface outline -outline-offset-1 outline-border',
        className ?? 'grid-cols-2 sm:grid-cols-3 xl:grid-cols-6'
      )}
    >
      {stats.map(item => (
        <div key={item.name} className="relative flex min-w-0 flex-col px-4 py-3.5 shadow-divider sm:px-5">
          <dt className="min-w-0 text-xs/5 font-medium wrap-break-word text-muted">{item.name}</dt>
          <dd className="mt-1 min-w-0">
            <div
              className={clsx(
                'truncate text-2xl/8 font-semibold tracking-tight tabular-nums',
                item.valueClassName ?? 'text-foreground'
              )}
            >
              {item.value}
            </div>
            {item.unit && <div className="text-xs/5 text-muted">{item.unit}</div>}
          </dd>
        </div>
      ))}
    </dl>
  );
}
