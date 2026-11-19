/**
 * Recharts prop presets in the shadcn chart look: hairline horizontal grid, axes without lines or
 * ticks, muted labels, a dashed crosshair, synced charts, a log cost axis on 1-2-5 steps, and lines
 * in a series' fixed colour and dash. Spread them onto the Recharts parts:
 *
 *   <LineChart data={rows} {...syncProps('eval-x')} margin={chartMargin({ endLabels: true })}>
 *     <CartesianGrid {...gridProps} />
 *     <XAxis {...xAxisProps({ dataKey: 'tick', domain: [0, budget], name: 'Game ticks' })} />
 *     <YAxis {...yAxisProps({ name: 'Quest points' })} />
 *     <ChartTooltip cursor={crosshairCursor} content={<SeriesTooltip series={series} />} />
 *     {series.map(s => <Line key={s.key} {...lineProps(s)} />)}
 *   </LineChart>
 *
 *   <YAxis {...logAxisProps(runs.map(r => r.cost))} />   // $0.01, $0.02, $0.05 …
 */

import type { XAxisProps } from 'recharts';
import { formatAxisNumber, formatCostTick } from '@/lib/format';
import { logRange, logTicks } from '@/lib/logAxis';
import { dashArray, type SeriesSpec } from '@/lib/chartSeries';
import { FADED_OPACITY } from '@/lib/hover';
import { seriesColor } from './config';

type AxisDomain = NonNullable<XAxisProps['domain']>;

/** CartesianGrid: horizontal hairlines only. */
export const gridProps = { vertical: false } as const;

/** Tooltip `cursor`: a dashed vertical crosshair. */
export const crosshairCursor = { stroke: 'var(--muted-foreground)', strokeWidth: 1, strokeDasharray: '3 3' };

/**
 * Charts with the same id share the crosshair and tooltip position, matched by x value (so their
 * data arrays may differ); give them the same x domain.
 */
export const syncProps = (id: string) => ({ syncId: id, syncMethod: 'value' as const });

/** Width the end labels take at the right of the plot. */
export const END_LABEL_WIDTH = 184;

/**
 * Whether a chart this wide (its container's CSS pixels, from useWidth) has room for line-end
 * labels; narrower charts rely on the legend.
 */
export const showEndLabels = (width: number): boolean => width >= 560;

/** Chart margin: room on the right for line-end labels when asked. */
export function chartMargin({ endLabels = false }: { endLabels?: boolean } = {}) {
  return { top: 8, right: endLabels ? END_LABEL_WIDTH : 12, bottom: 0, left: 0 };
}

interface AxisOptions {
  dataKey?: string;
  /** 'number' for measures (default), 'category' for names */
  type?: 'number' | 'category';
  domain?: AxisDomain;
  ticks?: number[];
  format?: (value: number) => string;
  /** The axis name, drawn under the x axis or beside the y axis; omit when the card title says it */
  name?: string;
  /** Clamp data outside the domain (axes stop at the budget) */
  clamp?: boolean;
}

const base = { tickLine: false, axisLine: false, tickMargin: 8, minTickGap: 16 } as const;

/**
 * Every chart's y axis takes the same width, so charts stacked on a page share their plot's left
 * edge; one with a rotated axis name takes NAMED_Y_AXIS_WIDTH. Pass `width: 'auto'` only for a chart
 * that stands alone.
 */
export const Y_AXIS_WIDTH = 48;
export const NAMED_Y_AXIS_WIDTH = 64;

export function xAxisProps({ dataKey, type = 'number', domain, ticks, format = formatAxisNumber, name, clamp = true }: AxisOptions = {}) {
  return {
    ...base,
    dataKey,
    type,
    ...(type === 'number' ? { domain, tickFormatter: format } : {}),
    ticks,
    allowDataOverflow: clamp,
    ...(name ? { height: 44, label: { value: name, position: 'insideBottom' as const, offset: 0, className: 'fill-muted-foreground' } } : {}),
  };
}

export function yAxisProps({
  dataKey,
  type = 'number',
  domain,
  ticks,
  format = formatAxisNumber,
  name,
  clamp = false,
  width,
}: AxisOptions & { width?: number | 'auto' } = {}) {
  return {
    ...base,
    dataKey,
    type,
    ...(type === 'number' ? { domain, tickFormatter: format } : {}),
    ticks,
    width: width ?? (name ? NAMED_Y_AXIS_WIDTH : Y_AXIS_WIDTH),
    allowDataOverflow: clamp,
    ...(name
      ? { label: { value: name, angle: -90, position: 'insideLeft' as const, style: { textAnchor: 'middle' as const }, className: 'fill-muted-foreground' } }
      : {}),
  };
}

/**
 * A log axis on 1-2-5 steps around the positive values (spread onto XAxis or YAxis), formatted as
 * dollars by default; null when no value is positive. Zero and missing values can't sit on it:
 * filter them out and say so.
 */
export function logAxisProps(values: (number | null | undefined)[], format: (value: number) => string = formatCostTick, name?: string) {
  const range = logRange(values.filter((v): v is number => v != null));
  if (!range) return null;
  return {
    ...base,
    type: 'number' as const,
    scale: 'log' as const,
    domain: range as AxisDomain,
    ticks: logTicks(range[0], range[1]),
    tickFormatter: format,
    allowDataOverflow: true,
    ...(name ? { label: { value: name, position: 'insideBottom' as const, offset: 0, className: 'fill-muted-foreground' } } : {}),
  };
}

/**
 * A series' Line: its colour, its agent's dash, 1.75px, no dots, no animation; a step line by
 * default (counts, scores and CDFs step). Hidden series stay mounted but invisible, so colours and
 * the legend don't shift. `faded` (from useHover) dims it while another series is hovered.
 */
export function lineProps(
  series: SeriesSpec,
  { step = true, hidden = false, width = 1.75, faded = false }: { step?: boolean; hidden?: boolean; width?: number; faded?: boolean } = {}
) {
  return {
    dataKey: series.key,
    name: series.key,
    type: step ? ('stepAfter' as const) : ('linear' as const),
    stroke: seriesColor(series),
    strokeWidth: width,
    strokeDasharray: dashArray(series.line),
    dot: false,
    activeDot: hidden ? false : { r: 3 },
    connectNulls: false,
    isAnimationActive: false,
    hide: hidden,
    strokeOpacity: faded ? FADED_OPACITY : 1,
  };
}
