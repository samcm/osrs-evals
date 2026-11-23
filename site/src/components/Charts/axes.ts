/**
 * The chart kit's geometry and axes, in lab's chart chrome (chartChrome.ts): one y axis width on
 * every chart so stacked charts share their plot's left edge, room on the right for line-end labels,
 * and ECharts value and log axes on the round ticks the page passes (lib/ticks.ts, lib/logAxis.ts).
 * XYChart builds its option from these.
 */

import { formatCostTick } from '@/lib/format';
import { logRange, logTicks } from '@/lib/logAxis';
import { formatTick } from '@/lib/ticks';
import {
  getChartAxisLabelStyle,
  getChartAxisLine,
  getChartAxisNameStyle,
  getChartValueAxisName,
  getChartValueSplitLine,
  type ChartChromeColors,
} from './chartChrome';

/** Every chart's y axis width, so charts stacked on a page share their plot's left edge. */
export const Y_AXIS_WIDTH = 48;

/** Width the line-end labels take at the right of the plot. */
export const END_LABEL_WIDTH = 184;

/** The plot's right edge without end labels: room for the last x tick's label. */
const RIGHT = 16;

/** Whether a chart this wide has room for line-end labels; narrower charts rely on the legend. */
export const showEndLabels = (width: number): boolean => width >= 560;

/** A row-per-group chart's height per row (ChartFrame `rows`), and the x axis under the rows. */
export const ROW_HEIGHT = 44;
export const ROWS_AXIS_HEIGHT = 32;

/** Where the plot sits inside the chart's box, in pixels from each edge (an ECharts `grid`). */
export interface ChartGrid {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

/** The plot's edges: the fixed y axis (or row labels), end labels or not, and room for axis names. */
export function chartGrid({
  left = Y_AXIS_WIDTH,
  endLabels = false,
  xName = false,
  yName = false,
}: {
  left?: number;
  endLabels?: boolean;
  xName?: boolean;
  yName?: boolean;
} = {}): ChartGrid {
  return { left, right: endLabels ? END_LABEL_WIDTH : RIGHT, top: yName ? 28 : 10, bottom: xName ? 44 : 24 };
}

/** A measure axis: where it stops, its ticks and their labels, and its scale. */
export interface AxisSpec {
  /** Where the axis starts and stops (a budget, a round max); data past it is clipped, not stretched */
  domain: [number, number];
  /** Round ticks (`roundTicks`, `logTicks`); omitted, ECharts picks its own between the ends */
  ticks?: number[];
  /** A tick's label; compact thousands by default (`formatTick`: 10K, 2.5K, 1.2M) */
  format?: (value: number) => string;
  /** A value in the tooltip (a crosshair's x, a line's y), when it needs more than a tick: "$11.44", "1:40:00" */
  formatValue?: (value: number) => string;
  /** A log scale (cost); the domain must be positive, as `logAxis` gives */
  log?: boolean;
  /** The axis' name, under the x axis or above the y axis; omit when the card's title says it */
  name?: string;
  /** Lines across the plot at each tick: on by default for y, off for x (lab's chrome) */
  grid?: boolean;
}

/**
 * A log cost axis on 1-2-5 steps around the positive values, labelled `$0.01`, `$0.02`, `$0.05`; null
 * when no value is positive. Zero and missing values can't sit on it: leave them out and say so.
 */
export function logAxis(
  values: (number | null | undefined)[],
  format: (value: number) => string = formatCostTick,
  name?: string
): AxisSpec | null {
  const range = logRange(values.filter((v): v is number => v != null));
  if (!range) return null;
  return { domain: range, ticks: logTicks(range[0], range[1]), format, log: true, name };
}

/** An ECharts value or log axis in lab's chrome, from an AxisSpec. */
export function echartsAxis(
  spec: AxisSpec,
  colors: ChartChromeColors,
  dim: 'x' | 'y'
): Record<string, unknown> & { type: 'value' | 'log' } {
  const ticks = spec.ticks?.filter(t => t >= spec.domain[0] - 1e-9 && t <= spec.domain[1] + 1e-9);
  const format = spec.format ?? formatTick;
  const grid = spec.grid ?? dim === 'y';
  return {
    type: spec.log ? 'log' : 'value',
    ...(spec.log ? { logBase: 10 } : {}),
    min: spec.domain[0],
    max: spec.domain[1],
    // The time or measure axis draws its line; the value axis only its hairlines (lab's charts.md)
    axisLine: dim === 'x' ? { ...getChartAxisLine(colors), onZero: false } : { show: false },
    axisTick: { show: false, ...(ticks ? { customValues: ticks } : {}) },
    axisLabel: {
      ...getChartAxisLabelStyle(colors),
      margin: 8,
      hideOverlap: true,
      formatter: (value: number) => format(value),
      ...(ticks ? { customValues: ticks } : {}),
    },
    splitLine: grid ? getChartValueSplitLine(colors) : { show: false },
    ...(spec.name
      ? dim === 'x'
        ? { name: spec.name, nameLocation: 'middle', nameGap: 28, nameTextStyle: getChartAxisNameStyle(colors) }
        : { name: spec.name, ...getChartValueAxisName(colors) }
      : {}),
  };
}
