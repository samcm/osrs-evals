/**
 * The chart kit, on ECharts with lab's chart chrome. Every chart is a ChartFrame (lead, compact or
 * rows) holding an XYChart (lines, bands, areas, points, bars) or a lab core chart (Heatmap, Bar,
 * StackedBar, in their own folders here). Series specs come from `@/lib/chartSeries`; which series
 * show is `useLegend` (`hide=`, `focus=`); the page's hover is `@/lib/hover`.
 *
 *   const specs = ranked.map(r => variantSeries(r.variant));
 *   const legend = useLegend();
 *   <ChartFrame height="lead" legend={<SeriesLegend series={specs} legend={legend} />}>
 *     <XYChart
 *       x={{ domain: [0, budget], ticks: roundTicks(budget), format: formatTickX }}
 *       y={{ domain: [0, yMax], ticks: roundTicks(yMax) }}
 *       lines={specs.filter(s => legend.visible(s.id)).map(s => ({ series: s, points: medians.get(s.id) }))}
 *       bands={lit ? [{ series: specs.find(s => s.id === lit), points: spread }] : []}
 *       endLabels={shown.map(s => ({ series: s, value: last(s) }))}
 *       markers={finishes.map(f => ({ id: f.run, x: f.tick, y: target, src: CHECK, title: 'Finished' }))}
 *       sync="eval-x"
 *     />
 *   </ChartFrame>
 *
 * Pages not ported yet import the Recharts kit from `./legacy`, which goes with Recharts.
 */

export { ChartFrame, type ChartHeight } from './ChartFrame';
export { XYChart } from './XYChart';
export { subscribeSync } from './XYChart/sync';
export type {
  ChartArea,
  ChartBand,
  ChartBar,
  ChartLine,
  ChartPoint,
  ChartPoints,
  ChartRow,
  ChartRule,
  XYChartProps,
} from './XYChart';
export {
  chartGrid,
  END_LABEL_WIDTH,
  logAxis,
  ROW_HEIGHT,
  showEndLabels,
  Y_AXIS_WIDTH,
  type AxisSpec,
  type ChartGrid,
} from './axes';
export type { Plot } from './plot';
export { useChartColors, type ChartColors } from './useChartColors';
export { heatGradient } from './heat';
export type { TooltipContent, TooltipRow } from './tooltip';
export { SeriesLabel } from './SeriesLabel';
export { KeyLegend, SeriesLegend, type LegendItem } from './Legend';
export type { EndLabelItem } from './EndLabels';
export type { SpriteMarker, SpriteMarkerSize } from './SpriteMarkers';
