import { Fragment, type JSX } from 'react';
import { Link } from '@tanstack/react-router';
import { clsx } from 'clsx';
import { ChevronRightIcon } from '@heroicons/react/16/solid';
import type { BreadcrumbProps } from './Breadcrumb.types';

/**
 * Breadcrumb navigation: the trail to the page shown, its last item the page's name.
 *
 * lab builds its trail from the routes' `getBreadcrumb` context; here the caller passes it, since an
 * item can be a label with marks (a run's pairing) read from the data. One line: parents keep their
 * width and the page's name truncates, so it is never lost. On a phone only the last item shows,
 * and any item marked `keep`.
 *
 * @example
 * ```tsx
 * <Breadcrumb
 *   items={[
 *     { label: 'Dragon Slayer', to: '/evals/$evalId', params: { evalId: 'dragon-slayer' }, keep: true },
 *     { label: 'Opus 5.5' },
 *   ]}
 * />
 * ```
 */
export function Breadcrumb({
  items,
  className,
  separator = <ChevronRightIcon className="size-4" />,
}: BreadcrumbProps): JSX.Element | null {
  if (items.length === 0) return null;

  return (
    <nav aria-label="Breadcrumb" className={clsx('flex min-w-0 items-center gap-2 text-sm/6', className)}>
      <ol className="flex min-w-0 items-center gap-2 whitespace-nowrap">
        {items.map((crumb, index) => {
          const isActive = index === items.length - 1;
          const phone = isActive || crumb.keep ? undefined : 'max-sm:hidden';
          // A parent is known by where it leads; the page by being the page
          const key = isActive ? 'page' : [crumb.to, ...Object.values(crumb.params ?? {})].join('/');
          return (
            <Fragment key={key}>
              <li className={clsx('flex items-center', isActive ? 'min-w-0' : 'shrink-0', phone)}>
                {isActive ? (
                  // Active breadcrumb (current page)
                  <span className="flex min-w-0 truncate font-medium text-foreground" aria-current="page">
                    {crumb.label}
                  </span>
                ) : crumb.to ? (
                  // Clickable parent breadcrumbs
                  <Link
                    to={crumb.to as '/'}
                    params={crumb.params as never}
                    className="text-muted transition-colors hover:text-foreground"
                  >
                    {crumb.label}
                  </Link>
                ) : (
                  // Non-clickable parent breadcrumbs (sections without pages)
                  <span className="text-muted">{crumb.label}</span>
                )}
              </li>
              {!isActive && (
                <li aria-hidden="true" className={clsx('flex text-muted-50', phone)}>
                  {separator}
                </li>
              )}
            </Fragment>
          );
        })}
      </ol>
    </nav>
  );
}
