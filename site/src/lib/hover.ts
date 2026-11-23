/**
 * The page's hover: one series id (a pairing's variant key, a model id, a tool category …) that the
 * pointer or keyboard focus is on, shared by every table row, legend key and chart on the page.
 * The hovered thing stays as it is and everything else fades, so a pairing hovered in the
 * leaderboard lights up its line in every chart. Transient React state, never in the URL; the
 * layout clears it when the page changes.
 *
 *   const hover = useHover();
 *   <tr {...hoverProps(pairing.key)} style={{ opacity: hover.opacity(pairing.key) }} />
 *   <Line {...lineProps(s, { faded: hover.faded(s.id) })} />
 */

import { useSyncExternalStore } from 'react';

/** Opacity of everything that isn't hovered while something is. */
export const FADED_OPACITY = 0.25;

let current: string | undefined;
const listeners = new Set<() => void>();

export function setHovered(id: string | undefined): void {
  if (id === current) return;
  current = id;
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export interface HoverState {
  /** The hovered id, if any */
  id: string | undefined;
  /** Whether this id should fade: something else is hovered */
  faded: (id: string) => boolean;
  /** 1, or FADED_OPACITY when faded */
  opacity: (id: string) => number;
}

export function useHover(): HoverState {
  const id = useSyncExternalStore(subscribe, () => current);
  const faded = (other: string): boolean => id != null && id !== other;
  return { id, faded, opacity: other => (faded(other) ? FADED_OPACITY : 1) };
}

/** Handlers that make an element hover (and, focused, highlight) an id. */
export function hoverProps(id: string): {
  onPointerEnter: () => void;
  onPointerLeave: () => void;
  onFocus: () => void;
  onBlur: () => void;
} {
  return {
    onPointerEnter: () => setHovered(id),
    onPointerLeave: () => setHovered(undefined),
    onFocus: () => setHovered(id),
    onBlur: () => setHovered(undefined),
  };
}
