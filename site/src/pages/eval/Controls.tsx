/**
 * The eval page's one key to its pairings, in the page toolbar beside the controls that drive every
 * chart of the tab. Hovering a key lights that pairing everywhere on the page; a click hides it, a
 * double click shows only it.
 */

import { SeriesLabel } from '@/components/charts';
import type { SeriesSpec } from '@/lib/chartSeries';
import { setHovered } from '@/lib/hover';
import { faded, useLit } from './lit';
import type { LegendState } from '@/lib/legend';
import { cn } from '@/lib/utils';

const LINE = { solid: 'border-solid', dashed: 'border-dashed', dotted: 'border-dotted' } as const;

export function PairingKey({ series, legend }: { series: SeriesSpec[]; legend: LegendState }) {
  const lit = useLit(legend.focus);
  return (
    <ul className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs" aria-label="Pairings">
      {series.map(s => {
        const shown = legend.visible(s.id);
        return (
          <li key={s.id}>
            <button
              type="button"
              aria-pressed={shown}
              title={legend.focus === s.id ? 'Show every pairing' : 'Hide; double-click to show only this'}
              onClick={event => (event.detail >= 2 ? legend.isolate(s.id) : legend.toggle(s.id))}
              onMouseEnter={() => shown && setHovered(s.id)}
              onMouseLeave={() => setHovered(undefined)}
              onFocus={() => shown && setHovered(s.id)}
              onBlur={() => setHovered(undefined)}
              className={cn(
                'flex items-center gap-1.5 rounded-sm outline-none transition-opacity duration-150 focus-visible:ring-3 focus-visible:ring-ring/50',
                (!shown || faded(lit, s.id)) && 'opacity-40'
              )}
            >
              <span aria-hidden className={cn('w-4 shrink-0 border-t-2', s.swatch.borderClassName, LINE[s.line])} />
              <SeriesLabel series={s} size={14} />
            </button>
          </li>
        );
      })}
    </ul>
  );
}
