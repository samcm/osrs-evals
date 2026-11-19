/**
 * Line-end labels that never collide, drawn inside a Recharts chart: each series' key (its colour
 * and dash), vendor mark and short name at the right of the plot (the dash carries the harness, so
 * a label never truncates), level with where its line ends, nudged apart (layoutEndLabels) and
 * dropped by priority when there is no room. Give the chart `margin={chartMargin({ endLabels: true })}`.
 *
 *   <LineChart …>
 *     …lines…
 *     <EndLabels items={series.map(s => ({ series: s, value: lastValue(s) }))} />
 *   </LineChart>
 */

import { usePlotArea, useYAxisScale } from 'recharts';
import { layoutEndLabels } from '@/lib/endLabels';
import type { SeriesSpec } from '@/lib/chartSeries';
import { END_LABEL_WIDTH } from './axes';
import { Key } from './Legend';
import { SeriesLabel } from './SeriesLabel';

export interface EndLabelItem {
  series: SeriesSpec;
  /** The line's last y value, in data units; null for a line with no points */
  value: number | null;
  /** Higher keeps its label when there is no room for all */
  priority?: number;
}

const LINE_HEIGHT = 20;

export function EndLabels({ items, yAxisId }: { items: EndLabelItem[]; yAxisId?: string | number }) {
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
              <Key item={{ color: series.swatch, line: series.line }} />
              <SeriesLabel series={series} size={14} harness={false} className="min-w-0" />
            </div>
          </foreignObject>
        );
      })}
    </g>
  );
}
