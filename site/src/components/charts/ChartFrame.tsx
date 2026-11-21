/**
 * The frame every chart sits in, so charts on a page read as one instrument: two heights only
 * (`lead` for a page's or section's main chart, `compact` for the rest), a skeleton of the same
 * height while data loads (nothing jumps), the chart fading in, an empty state in the same space
 * (without the legend: it keys nothing), and the legend in one place, centred under the plot. Inside, use the presets from axes.ts:
 * `chartMargin()`, `yAxisProps()` (one y axis width, so stacked charts share their left edge),
 * `xAxisProps()`, `gridProps`, `crosshairCursor` and `SeriesTooltip` in a ChartTooltip.
 *
 *   <ChartFrame config={seriesConfig(series)} height="compact" loading={!data}
 *     legend={<SeriesLegend series={series} legend={legend} />}>
 *     <LineChart data={rows} margin={chartMargin()}>…</LineChart>
 *   </ChartFrame>
 *
 * A chart with one row per group (a strip or bar chart ranking groups) sizes to its rows instead:
 * pass `rows`, and it takes ROW_HEIGHT per row plus room for the x axis.
 */

import type { ReactElement, ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { Empty } from '@/components/bits';
import { ChartContainer, type ChartConfig } from '@/components/ui/chart';
import { Skeleton } from '@/components/ui/skeleton';

export const CHART_HEIGHTS = { lead: 'h-80', compact: 'h-48' } as const;
export type ChartHeight = keyof typeof CHART_HEIGHTS;

/** A row-per-group chart's height per row, and its x axis. */
export const ROW_HEIGHT = 44;
const AXIS_HEIGHT = 40;

export function ChartFrame({
  config,
  height = 'lead',
  rows,
  loading,
  empty,
  legend,
  className,
  children,
}: {
  config: ChartConfig;
  height?: ChartHeight;
  /** For a chart with one row per group: its row count, which sets its height instead of `height` */
  rows?: number;
  loading?: boolean;
  /** What is missing, when there is nothing to draw */
  empty?: ReactNode;
  /** A KeyLegend or SeriesLegend */
  legend?: ReactNode;
  className?: string;
  /** One Recharts chart */
  children: ReactElement;
}) {
  const style = rows != null ? { height: rows * ROW_HEIGHT + AXIS_HEIGHT } : undefined;
  const size = rows != null ? undefined : CHART_HEIGHTS[height];
  return (
    <div className={cn('flex min-w-0 flex-col', className)}>
      {loading ? (
        <Skeleton className={cn('w-full', size)} style={style} />
      ) : empty ? (
        <div className={cn('flex w-full items-center justify-center', size)} style={style}>
          <Empty>{empty}</Empty>
        </div>
      ) : (
        <ChartContainer config={config} className={cn('aspect-auto w-full animate-fade-in', size)} style={style}>
          {children}
        </ChartContainer>
      )}
      {!empty && legend}
    </div>
  );
}
