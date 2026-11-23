import type { ReactNode } from 'react';
import type { SeriesSpec } from '@/lib/chartSeries';
import type { AxisSpec } from '@/components/Charts/axes';
import type { EndLabelItem } from '@/components/Charts/EndLabels';
import type { Plot } from '@/components/Charts/plot';
import type { SpriteMarker, SpriteMarkerSize } from '@/components/Charts/SpriteMarkers';
import type { TooltipContent } from '@/components/Charts/tooltip';

/** A line: one series' values over x, in its colour and its harness' dash. */
export interface ChartLine {
  /** Unique on the chart (a run id when a series has several lines); defaults to the series' key */
  key?: string;
  /** Its colour, dash, marks and hover id; omit for a reference line, drawn muted */
  series?: SeriesSpec;
  /** Names a reference line in the tooltip ("Every model's median") */
  label?: string;
  /** [x, y] in x order; a null y breaks the line */
  points: [number, number | null][];
  /**
   * A step line (counts, scores, CDFs: each value holds until the next) or straight
   * @default true
   */
  step?: boolean;
  /**
   * Stroke width in pixels, 1.5 to 2
   * @default 1.75
   */
  width?: number;
}

/** The spread of a series' runs: a translucent area between `lo` and `hi`, drawn under the lines. */
export interface ChartBand {
  key?: string;
  series: SeriesSpec;
  /** [x, lo, hi] in x order */
  points: [number, number, number][];
  /** @default true */
  step?: boolean;
  /** @default 0.15 */
  opacity?: number;
}

/** A filled area to the axis, stacked with others of the same `stack` (one run's spend by token kind). */
export interface ChartArea {
  key?: string;
  series: SeriesSpec;
  /** [x, y] in x order */
  points: [number, number][];
  /** Areas of one stack add up point by point, so give them the same x values */
  stack?: string;
  /** @default true */
  step?: boolean;
}

/** A point of a scatter. */
export interface ChartPoint {
  x: number;
  y: number;
  /** Unique within its series (a run id) */
  key?: string;
  /** A ring rather than a filled mark (a run that didn't finish) */
  hollow?: boolean;
  /** Anything the page needs back on hover or click */
  data?: unknown;
}

/** A scatter: one series' points in its colour and its harness' shape. */
export interface ChartPoints {
  series: SeriesSpec;
  points: ChartPoint[];
  /**
   * Mark size in pixels
   * @default 8
   */
  size?: number;
}

/** A bar segment on a chart with rows: a series' value in one row, stacked after the bars before it. */
export interface ChartBar {
  series: SeriesSpec;
  /** One value per row it has (row index from the top); bars stack in the order given */
  values: { row: number; value: number }[];
}

/** A straight rule across the plot at an x (a playhead, an attempt) or a y (a target). */
export interface ChartRule {
  x?: number;
  y?: number;
  /** muted (the default), success (a target), primary (the playhead) */
  tone?: 'muted' | 'success' | 'primary';
  /** @default true, except primary */
  dashed?: boolean;
  /** A short label at the rule's top or right end */
  label?: string;
}

/** A row of a chart with rows: its label, drawn left of the plot. */
export interface ChartRow {
  key: string;
  label: ReactNode;
}

export interface XYChartProps {
  /** The x axis: always a measure (ticks, seconds, cost, calls) */
  x: AxisSpec;
  /** The y axis; omit with `rows` */
  y?: AxisSpec;
  /**
   * One row per group instead of a y axis (a strip or bar chart ranking groups): their labels sit
   * left of the plot and y values are row indexes from the top (fractions jitter within a row). Put
   * the chart in a ChartFrame with `rows={rows.length}`.
   */
  rows?: ChartRow[];
  /**
   * Width of the row labels, in pixels
   * @default 160
   */
  rowLabelWidth?: number;

  lines?: ChartLine[];
  bands?: ChartBand[];
  areas?: ChartArea[];
  points?: ChartPoints[];
  bars?: ChartBar[];
  /** The Pareto frontier through the non-dominated points: a faint dashed line under them */
  frontier?: [number, number][];
  rules?: ChartRule[];

  /**
   * Labels at the lines' ends (vendor mark, short name, level), when the chart is wide enough (`showEndLabels`).
   * Pass [] on a chart without labels stacked under one with them, so both keep the room and their x axes line up
   */
  endLabels?: EndLabelItem[];
  /** Game sprites on the lines */
  markers?: SpriteMarker[];
  /** @default 16 */
  markerSize?: SpriteMarkerSize;
  /** Anything else drawn over the plot in HTML, placed with its scales (point labels, a moving playhead) */
  overlay?: (plot: Plot) => ReactNode;

  /**
   * The tooltip at the crosshair's x; by default each line's value there, sorted, formatted with the
   * y axis' format. false for none.
   */
  axisTooltip?: ((x: number) => TooltipContent | null) | false;
  /** The tooltip on a point; with it the tooltip follows points, not the crosshair */
  pointTooltip?: (point: ChartPoint, series: SeriesSpec) => TooltipContent | null;
  /** The tooltip on a bar */
  barTooltip?: (bar: { row: number; value: number }, series: SeriesSpec) => TooltipContent | null;

  /**
   * The series id at full strength while the rest fade: the legend's focus, else the page's hover
   * (lib/hover), which is the default. Pointing at a line or point hovers its series page-wide.
   */
  lit?: string | null;
  /**
   * Charts with the same id (on one page, sharing an x measure) share the crosshair and tooltip, matched
   * by x value; give them the same x domain
   */
  sync?: string;
  onLineClick?: (line: ChartLine) => void;
  onPointClick?: (point: ChartPoint, series: SeriesSpec) => void;
}
