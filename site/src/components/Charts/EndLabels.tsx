/**
 * Line-end labels that never collide, over an XYChart: each series' marks and short name right of
 * the plot, level with where its line ends, nudged apart (layoutEndLabels) and dropped by priority
 * when there is no room. XYChart draws them from its `endLabels` prop when the chart is wide enough
 * (`showEndLabels`); a narrower chart relies on its legend.
 */

import type { JSX } from 'react';
import { layoutEndLabels } from '@/lib/endLabels';
import { dashArray, type SeriesSpec } from '@/lib/chartSeries';
import { END_LABEL_WIDTH } from './axes';
import type { Plot } from './plot';
import { SeriesLabel } from './SeriesLabel';

export interface EndLabelItem {
  series: SeriesSpec;
  /** The line's last y value, in data units; null for a line with no points */
  value: number | null;
  /** Higher keeps its label when there is no room for all */
  priority?: number;
}

const LINE_HEIGHT = 20;

export function EndLabels({
  items,
  plot,
  color,
  opacity,
}: {
  items: EndLabelItem[];
  plot: Plot;
  /** The series' colour, resolved for the theme */
  color: (series: SeriesSpec) => string;
  /** The series' strength under the page's hover */
  opacity: (series: SeriesSpec) => number;
}): JSX.Element {
  const placed = items.filter(
    (i): i is EndLabelItem & { value: number } => i.value != null && Number.isFinite(plot.y(i.value))
  );
  // Pixels from the plot's top, given to layoutEndLabels as values on a 0…height axis (it flips them back)
  const want = new Map(placed.map(i => [i.series.key, plot.y(i.value) - plot.top]));
  const offsets = layoutEndLabels(
    placed.map(i => ({ id: i.series.key, value: plot.height - want.get(i.series.key)!, priority: i.priority })),
    { min: 0, max: plot.height, height: plot.height, lineHeight: LINE_HEIGHT }
  );
  return (
    <>
      {placed.map(({ series }) => {
        const dy = offsets.get(series.key);
        if (dy == null) return null;
        return (
          <div
            key={series.key}
            className="pointer-events-none absolute flex h-5 items-center gap-1.5 text-xs transition-opacity"
            style={{
              left: plot.left + plot.width + 6,
              top: plot.top + want.get(series.key)! + dy - LINE_HEIGHT / 2,
              width: END_LABEL_WIDTH - 8,
              opacity: opacity(series),
            }}
          >
            <svg aria-hidden width="14" height="4" className="shrink-0">
              <line
                x1="0"
                y1="2"
                x2="14"
                y2="2"
                stroke={color(series)}
                strokeWidth="2"
                strokeDasharray={dashArray(series.line)}
              />
            </svg>
            <SeriesLabel series={series} size={14} className="min-w-0" />
          </div>
        );
      })}
    </>
  );
}
