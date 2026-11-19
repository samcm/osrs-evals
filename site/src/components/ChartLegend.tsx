import type { ReactNode } from 'react';
import clsx from 'clsx';
import type { LegendState } from '@/lib/legend';
import type { AgentLine, AgentSymbol, SeriesColor } from '@/lib/series';

export interface LegendItem {
  /** Series id, for a legend bound to `useLegend`; items without one are plain keys */
  id?: string;
  label: string;
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

/** The ECharts symbols as 10px shapes. */
const SHAPES: Record<AgentSymbol, string> = {
  circle: 'M5 0a5 5 0 1 1 0 10A5 5 0 0 1 5 0z',
  rect: 'M0.5 0.5h9v9h-9z',
  roundRect: 'M2 0.5h6a1.5 1.5 0 0 1 1.5 1.5v6A1.5 1.5 0 0 1 8 9.5H2A1.5 1.5 0 0 1 0.5 8V2A1.5 1.5 0 0 1 2 0.5z',
  diamond: 'M5 0l5 5-5 5-5-5z',
  triangle: 'M5 0.5l4.5 9h-9z',
  pin: 'M5 0a4 4 0 0 1 4 4c0 3-4 6-4 6S1 7 1 4a4 4 0 0 1 4-4z',
};

const lineClassName: Record<AgentLine, string> = {
  solid: 'border-solid',
  dashed: 'border-dashed',
  dotted: 'border-dotted',
};

function Key({ item }: { item: LegendItem }) {
  if (item.colors) {
    return (
      <span aria-hidden className="flex">
        {item.colors.map(color => (
          <span key={color.token} className={clsx('h-2.5 w-2 first:rounded-l-2xs last:rounded-r-2xs', color.swatchClassName)} />
        ))}
      </span>
    );
  }
  if (item.symbol && item.color) {
    return (
      <svg aria-hidden viewBox="0 0 10 10" className={clsx('size-2.5 shrink-0', item.color.fillClassName)}>
        <path d={SHAPES[item.symbol]} />
      </svg>
    );
  }
  if (item.line) return <span aria-hidden className={clsx('w-4 border-t-2', lineClassName[item.line], item.color?.borderClassName ?? 'border-muted')} />;
  if (item.hollow) return <span aria-hidden className={clsx('size-2.5 rounded-full border-2', item.color?.borderClassName ?? 'border-muted')} />;
  if (item.swatchClassName) return <span aria-hidden className={clsx('h-2.5 w-4 rounded-2xs', item.swatchClassName)} />;
  if (item.color) return <span aria-hidden className={clsx('size-2.5 rounded-full', item.color.swatchClassName)} />;
  return null;
}

/**
 * One wrapping row of keys whose swatches match the marks (line, dashed line, block, ring or
 * symbol), with the series' marks. Given `legend` (from `useLegend`), items with an id are buttons:
 * a click hides or shows the series (or clears an isolation), a double click isolates it.
 */
export function ChartLegend({ items, legend, className }: { items: LegendItem[]; legend?: LegendState; className?: string }) {
  return (
    <ul className={clsx('flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted', className)}>
      {items.map(item => {
        const content = (
          <>
            <Key item={item} />
            {item.mark && (
              <span aria-hidden className="inline-flex items-center">
                {item.mark}
              </span>
            )}
            <span className="text-foreground">{item.label}</span>
          </>
        );
        if (!legend || item.id == null) {
          return (
            <li key={item.id ?? item.label} className="flex items-center gap-1.5">
              {content}
            </li>
          );
        }
        const id = item.id;
        const shown = legend.visible(id);
        return (
          <li key={id}>
            <button
              type="button"
              aria-pressed={shown}
              title={legend.focus === id ? 'Click to show every series' : 'Click to hide; double-click to show only this'}
              onClick={event => (event.detail >= 2 ? legend.isolate(id) : legend.toggle(id))}
              className={clsx(
                'flex items-center gap-1.5 rounded-xs transition-opacity focus-visible:ring-2 focus-visible:ring-primary-50',
                !shown && 'opacity-40'
              )}
            >
              {content}
            </button>
          </li>
        );
      })}
    </ul>
  );
}
