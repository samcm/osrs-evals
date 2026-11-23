/**
 * A shadcn ChartConfig from series specs: each key gets its marks as the label and its fixed colour,
 * so ChartContainer sets `--color-<key>` and the tooltip and legend show the marks.
 *
 *   const series = variants.map(variantSeries);
 *   <ChartContainer config={seriesConfig(series)} className="aspect-auto h-72 w-full">…</ChartContainer>
 */

import type { ChartConfig } from '@/components/ui/chart';
import type { SeriesSpec } from '@/lib/chartSeries';
import { SeriesLabel } from '@/components/Charts/SeriesLabel';

export function seriesConfig(series: SeriesSpec[]): ChartConfig {
  return Object.fromEntries(series.map(s => [s.key, { label: <SeriesLabel series={s} />, color: s.color }]));
}

/** The colour a series draws in, inside its ChartContainer. */
export const seriesColor = (series: Pick<SeriesSpec, 'key'>): string => `var(--color-${series.key})`;
