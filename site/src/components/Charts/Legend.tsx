/**
 * Legends in the shadcn chart look (centred row under the chart, small keys), bound to the URL:
 * given `legend` (useLegend), a click hides or shows a series (`hide=`, or clears an isolation) and
 * a double click isolates it (`focus=`). Hovering a key hovers its series across the page (lib/hover).
 *
 *   const legend = useLegend();
 *   <SeriesLegend series={series} legend={legend} />                 // keys from specs, with marks
 *   <KeyLegend items={[{ label: 'Not finished', hollow: true }]} />  // plain keys
 */

import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { Tip } from '@/components/bits';
import { Button } from '@/components/ui/button';
import { hoverProps, useHover } from '@/lib/hover';
import type { LegendState } from '@/lib/legend';
import type { SeriesSpec } from '@/lib/chartSeries';
import type { AgentLine, AgentSymbol, SeriesColor } from '@/lib/series';
import { SeriesLabel } from './SeriesLabel';

export interface LegendItem {
  /** Series id, for a legend bound to `useLegend`; items without one are plain keys */
  id?: string;
  /** Accessible name, when the label is marks rather than text */
  name?: string;
  label: ReactNode;
  /** Marks before the label (BrandMark at 14, a Sprite …) */
  mark?: ReactNode;
  color?: SeriesColor;
  /** A line key in the series' dash; otherwise a block */
  line?: AgentLine;
  /** A hollow ring instead of a filled mark */
  hollow?: boolean;
  /** A block in this colour class instead of a series colour */
  swatchClassName?: string;
  /** The chart's symbol for the series */
  symbol?: AgentSymbol;
  /** Several colour blocks, for one key that stands for every series' colour */
  colors?: SeriesColor[];
}

/** Point shapes as 10px paths. */
const SHAPES: Record<AgentSymbol, string> = {
  circle: 'M5 0a5 5 0 1 1 0 10A5 5 0 0 1 5 0z',
  rect: 'M0.5 0.5h9v9h-9z',
  roundRect: 'M2 0.5h6a1.5 1.5 0 0 1 1.5 1.5v6A1.5 1.5 0 0 1 8 9.5H2A1.5 1.5 0 0 1 0.5 8V2A1.5 1.5 0 0 1 2 0.5z',
  diamond: 'M5 0l5 5-5 5-5-5z',
  triangle: 'M5 0.5l4.5 9h-9z',
  pin: 'M5 0a4 4 0 0 1 4 4c0 3-4 6-4 6S1 7 1 4a4 4 0 0 1 4-4z',
};

const LINE: Record<AgentLine, string> = { solid: 'border-solid', dashed: 'border-dashed', dotted: 'border-dotted' };

function Key({ item }: { item: LegendItem }) {
  if (item.colors) {
    return (
      <span aria-hidden className="flex">
        {item.colors.map(color => (
          <span
            key={color.token}
            className={cn('h-2 w-1.5 first:rounded-l-[2px] last:rounded-r-[2px]', color.swatchClassName)}
          />
        ))}
      </span>
    );
  }
  if (item.symbol && item.color) {
    return (
      <svg aria-hidden viewBox="0 0 10 10" className={cn('size-2.5 shrink-0', item.color.fillClassName)}>
        <path d={SHAPES[item.symbol]} />
      </svg>
    );
  }
  if (item.line)
    return (
      <span
        aria-hidden
        className={cn(
          'w-4 shrink-0 border-t-2',
          LINE[item.line],
          item.color?.borderClassName ?? 'border-muted-foreground'
        )}
      />
    );
  if (item.hollow)
    return (
      <span
        aria-hidden
        className={cn(
          'size-2.5 shrink-0 rounded-full border-2',
          item.color?.borderClassName ?? 'border-muted-foreground'
        )}
      />
    );
  if (item.swatchClassName)
    return <span aria-hidden className={cn('h-2 w-3 shrink-0 rounded-[2px]', item.swatchClassName)} />;
  if (item.color)
    return <span aria-hidden className={cn('size-2 shrink-0 rounded-[2px]', item.color.swatchClassName)} />;
  return null;
}

/** A row of keys; items with an id toggle their series when `legend` is given. */
export function KeyLegend({
  items,
  legend,
  className,
}: {
  items: LegendItem[];
  legend?: LegendState;
  className?: string;
}) {
  const hover = useHover();
  return (
    <ul className={cn('flex flex-wrap items-center justify-center gap-x-4 gap-y-1.5 pt-3 text-xs', className)}>
      {items.map((item, i) => {
        const content = (
          <>
            <Key item={item} />
            {item.mark && (
              <span aria-hidden className="inline-flex items-center">
                {item.mark}
              </span>
            )}
            {item.label != null && item.label !== '' && <span>{item.label}</span>}
          </>
        );
        const key = item.id ?? (typeof item.label === 'string' ? item.label : i);
        if (!legend || item.id == null) {
          return (
            <li key={key} className="flex items-center gap-1.5">
              {content}
            </li>
          );
        }
        const id = item.id;
        const shown = legend.visible(id);
        return (
          <li key={key} className="transition-opacity" style={{ opacity: hover.opacity(id) }}>
            <Tip
              content={
                legend.focus === id ? 'Click to show every series' : 'Click to hide; double-click to show only this'
              }
            >
              <Button
                variant="ghost"
                {...hoverProps(id)}
                aria-pressed={shown}
                aria-label={item.name}
                onClick={event => (event.detail >= 2 ? legend.isolate(id) : legend.toggle(id))}
                className={cn(
                  'h-auto gap-1.5 rounded-sm border-0 p-0 text-xs font-normal hover:bg-transparent active:not-aria-[haspopup]:translate-y-0',
                  !shown && 'opacity-40'
                )}
              >
                {content}
              </Button>
            </Tip>
          </li>
        );
      })}
    </ul>
  );
}

/**
 * A legend from series specs: each key in the series' style (`line` for lines, `symbol` for points,
 * `swatch` for bars and areas) with its marks; toggles through `legend` by `series.id`.
 */
export function SeriesLegend({
  series,
  legend,
  kind = 'line',
  className,
}: {
  series: SeriesSpec[];
  legend?: LegendState;
  kind?: 'line' | 'symbol' | 'swatch';
  className?: string;
}) {
  return (
    <KeyLegend
      legend={legend}
      className={className}
      items={series.map(s => ({
        id: s.id,
        name: s.name,
        label: null,
        mark: <SeriesLabel series={s} size={14} />,
        color: s.swatch,
        ...(kind === 'line' ? { line: s.line } : kind === 'symbol' ? { symbol: s.symbol } : {}),
      }))}
    />
  );
}
