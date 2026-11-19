/** Which series a chart shows, from the URL: `hide` lists hidden series, `focus` isolates one. */

import { useCallback, useMemo } from 'react';
import { useSearch } from '@tanstack/react-router';
import { list, text, useSearchUpdate } from './search';

export interface LegendState {
  hidden: string[];
  focus: string | undefined;
  /** Whether a series is drawn: the focused one alone, or every series not hidden */
  visible: (id: string) => boolean;
  /** Hide or show a series; with a series focused, clears the focus instead */
  toggle: (id: string) => void;
  /** Isolate a series, or clear the isolation if it is the focused one */
  isolate: (id: string) => void;
}

/**
 * Legend state bound to the current route's search. The route must declare the params, as
 * `...legendParams` (keys `hide` and `focus`) or its own pair passed here as `keys`.
 */
export function useLegend(keys: { hide: string; focus: string } = { hide: 'hide', focus: 'focus' }): LegendState {
  const search = useSearch({ strict: false }) as Record<string, unknown>;
  const update = useSearchUpdate();
  const hidden = useMemo(() => list().parse(search[keys.hide]) ?? [], [search, keys.hide]);
  const focus = text().parse(search[keys.focus]);

  const toggle = useCallback(
    (id: string) => {
      if (focus) update({ [keys.focus]: undefined });
      else update({ [keys.hide]: hidden.includes(id) ? hidden.filter(h => h !== id) : [...hidden, id] });
    },
    [focus, hidden, keys, update]
  );
  const isolate = useCallback(
    (id: string) => update({ [keys.focus]: focus === id ? undefined : id, [keys.hide]: undefined }),
    [focus, keys, update]
  );
  const visible = useCallback((id: string) => (focus ? id === focus : !hidden.includes(id)), [focus, hidden]);

  return { hidden, focus, visible, toggle, isolate };
}
