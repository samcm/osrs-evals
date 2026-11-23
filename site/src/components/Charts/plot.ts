import type { AxisSpec, ChartGrid } from './axes';

/**
 * Where a chart's plot is inside its box and how data maps onto it, in CSS pixels from the box's top
 * left. XYChart sets its axes from the same specs, so HTML drawn over the chart with these (end
 * labels, sprites, a playhead, point labels) lands on the canvas' lines.
 */
export interface Plot {
  left: number;
  top: number;
  width: number;
  height: number;
  /** An x value's pixel */
  x: (value: number) => number;
  /** A y value's pixel; for a chart with rows, a row's centre (rows count from the top) */
  y: (value: number) => number;
}

function scale(axis: Pick<AxisSpec, 'domain' | 'log'>, from: number, length: number, flip: boolean) {
  const f = (v: number): number => (axis.log ? Math.log10(Math.max(v, Number.MIN_VALUE)) : v);
  const lo = f(axis.domain[0]);
  const span = f(axis.domain[1]) - lo || 1;
  return (value: number): number => {
    const t = (f(value) - lo) / span;
    return from + (flip ? 1 - t : t) * length;
  };
}

export function plotOf(
  size: { width: number; height: number },
  grid: ChartGrid,
  x: AxisSpec,
  y: AxisSpec | { rows: number }
): Plot {
  const width = Math.max(0, size.width - grid.left - grid.right);
  const height = Math.max(0, size.height - grid.top - grid.bottom);
  const yScale =
    'rows' in y
      ? (row: number): number => grid.top + ((row + 0.5) / Math.max(1, y.rows)) * height
      : scale(y, grid.top, height, true);
  return { left: grid.left, top: grid.top, width, height, x: scale(x, grid.left, width, false), y: yScale };
}
