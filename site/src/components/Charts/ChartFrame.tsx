/**
 * The frame every chart sits in, so charts on a page read as one instrument: two heights only (`lead`
 * for a page's or section's main chart, `compact` for the rest), lab's shimmer at the same height
 * while data loads (nothing jumps), the chart fading in, an empty state in the same space (without
 * the legend: it keys nothing), and the legend in one place, centred under the plot.
 *
 *   <ChartFrame height="compact" loading={!data} legend={<SeriesLegend series={specs} legend={legend} />}>
 *     <XYChart … />
 *   </ChartFrame>
 *
 * A chart with one row per group (a strip or bar chart ranking groups) sizes to its rows instead:
 * pass `rows`, and it takes ROW_HEIGHT per row plus room for the x axis. The child, an XYChart,
 * fills the frame.
 */

import type { JSX, ReactElement, ReactNode } from 'react';
import clsx from 'clsx';
import { LoadingContainer } from '@/components/Layout/LoadingContainer';
import { ROW_HEIGHT, ROWS_AXIS_HEIGHT } from './axes';

const CHART_HEIGHTS = { lead: 'h-80', compact: 'h-48' } as const;
export type ChartHeight = keyof typeof CHART_HEIGHTS;

export function ChartFrame({
  height = 'lead',
  rows,
  loading,
  empty,
  legend,
  className,
  children,
}: {
  height?: ChartHeight;
  /** For a chart with one row per group: its row count, which sets its height instead of `height` */
  rows?: number;
  loading?: boolean;
  /** What is missing, in one short sentence, when there is nothing to draw */
  empty?: ReactNode;
  /** A SeriesLegend or KeyLegend */
  legend?: ReactNode;
  className?: string;
  /** One chart, filling the frame */
  children: ReactElement;
}): JSX.Element {
  const style = rows != null ? { height: rows * ROW_HEIGHT + ROWS_AXIS_HEIGHT } : undefined;
  const size = rows != null ? undefined : CHART_HEIGHTS[height];
  return (
    <div className={clsx('flex min-w-0 flex-col', className)}>
      {loading ? (
        <div className={clsx('w-full', size)} style={style}>
          <LoadingContainer className="size-full" />
        </div>
      ) : empty ? (
        <div className={clsx('flex w-full items-center justify-center text-sm text-muted', size)} style={style}>
          {empty}
        </div>
      ) : (
        <div className={clsx('w-full animate-fade-in', size)} style={style}>
          {children}
        </div>
      )}
      {!empty && legend}
    </div>
  );
}
