/**
 * The series under the pointer, shared by everything on a page: hover a pairing in a list, a line,
 * a point or a map marker, and every part of the page lights it and fades the rest. Transient (not
 * in the URL); a legend's `focus=` is the lasting version and wins over a hover.
 *
 *   const lit = useLit(legend.focus)            // the focused id, else the hovered one, else null
 *   onMouseEnter={() => setHot(spec.id)} onMouseLeave={() => setHot(null)}
 *   className={cn('transition-opacity duration-150', faded(lit, spec.id) && 'opacity-30')}
 */

import { useEffect, useSyncExternalStore } from 'react';

let hot: string | null = null;
const listeners = new Set<() => void>();

/** Set (or clear, with null) the hovered series id. */
export function setHot(id: string | null): void {
  if (id === hot) return;
  hot = id;
  for (const l of listeners) l();
}

/** The hovered series id. */
export function useHot(): string | null {
  return useSyncExternalStore(
    l => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => hot
  );
}

/** The series to light: the focused one, else the hovered one; null lights everything. */
export function useLit(focus?: string | null): string | null {
  const h = useHot();
  // A page that unmounts mid-hover leaves nothing lit on the next
  useEffect(() => () => setHot(null), []);
  return focus ?? h;
}

/** Whether a series is faded: something else is lit. */
export const faded = (lit: string | null, id: string): boolean => lit != null && lit !== id;
