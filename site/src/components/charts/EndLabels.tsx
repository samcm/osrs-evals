/**
 * Line-end labels that never collide, drawn inside a Recharts chart: each series' marks and short
 * name at the right of the plot, level with where its line ends, nudged apart (layoutEndLabels) and
 * dropped by priority when there is no room. Give the chart `margin={chartMargin({ endLabels: true })}`.
 *
 *   <LineChart …>
 *     …lines…
 *     <EndLabels items={series.map(s => ({ series: s, value: lastValue(s) }))} />
 *   </LineChart>
 */

import { usePlotArea, useYAxisScale } from 'recharts';
import { layoutEndLabels } from '@/lib/endLabels';
import { dashArray, type SeriesSpec } from '@/lib/chartSeries';
import { END_LABEL_WIDTH } from './axes';
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
  yAxisId,
  line = false,
}: {
  items: EndLabelItem[];
  yAxisId?: string | number;
  /** Key each label with a short stroke in the series' colour and dash (for line charts whose labels leave the harness to the dash) */
  line?: boolean;
}) {
  const plot = usePlotArea();
  const y = useYAxisScale(yAxisId);
  if (!plot || !y) return null;
  const placed = items.filter((i): i is EndLabelItem & { value: number } => i.value != null && Number.isFinite(Number(y(i.value))));
  // Pixels from the plot's top, given to layoutEndLabels as values on a 0…height axis (it flips them back)
  const want = new Map(placed.map(i => [i.series.key, Number(y(i.value)) - plot.y]));
  const offsets = layoutEndLabels(
    placed.map(i => ({ id: i.series.key, value: plot.height - want.get(i.series.key)!, priority: i.priority })),
    { min: 0, max: plot.height, height: plot.height, lineHeight: LINE_HEIGHT }
  );
  return (
    <g className="recharts-end-labels">
      {placed.map(({ series }) => {
        const dy = offsets.get(series.key);
        if (dy == null) return null;
        const top = plot.y + want.get(series.key)! + dy - LINE_HEIGHT / 2;
        return (
          <foreignObject key={series.key} x={plot.x + plot.width + 6} y={top} width={END_LABEL_WIDTH - 8} height={LINE_HEIGHT}>
            <div className="flex h-full items-center gap-1.5 text-xs text-foreground">
              {line ? (
                <svg aria-hidden width="14" height="4" className="shrink-0">
                  <line x1="0" y1="2" x2="14" y2="2" stroke={series.color} strokeWidth="2" strokeDasharray={dashArray(series.line)} />
                </svg>
              ) : (
                <span aria-hidden className="size-2 shrink-0 rounded-[2px]" style={{ backgroundColor: series.color }} />
              )}
              <SeriesLabel series={series} size={14} className="min-w-0" />
            </div>
          </foreignObject>
        );
      })}
    </g>
  );
}
