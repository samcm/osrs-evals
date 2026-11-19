/**
 * The eval page's one control bar, under the header and sticky on wide screens: the tabs, the
 * controls that drive every chart of the tab, and the one key to the pairings. Hovering a key lights
 * that pairing everywhere on the page; a click hides it, a double click shows only it.
 */

import type { ReactNode } from 'react';
import { SeriesLabel } from '@/components/charts';
import type { SeriesSpec } from '@/lib/chartSeries';
import { faded, setHot, useLit } from '@/lib/hover';
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
              onMouseEnter={() => shown && setHot(s.id)}
              onMouseLeave={() => setHot(null)}
              onFocus={() => shown && setHot(s.id)}
              onBlur={() => setHot(null)}
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

/** Tabs and the tab's controls on one row, the key under them. */
export function ControlBar({ tabs, controls, keys }: { tabs: ReactNode; controls?: ReactNode; keys?: ReactNode }) {
  return (
    <div className="z-10 flex flex-col gap-3 border-b bg-background pb-3 md:sticky md:top-12 md:pt-3">
      <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3">
        {tabs}
        {controls && <div className="flex flex-wrap items-center gap-2">{controls}</div>}
      </div>
      {keys}
    </div>
  );
}
