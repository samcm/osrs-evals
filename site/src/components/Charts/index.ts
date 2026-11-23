/**
 * The chart kit, on ECharts with lab's chart chrome. Every chart is a ChartFrame (lead, compact or
 * rows) holding an XYChart (lines, bands, areas, points, bars); a table cell's chart is lab's
 * Sparkline (`./Sparkline`). Series specs come from `@/lib/chartSeries`; which series show is
 * `useLegend` (`hide=`, `focus=`); the page's hover is `@/lib/hover`.
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
 */

export { ChartFrame } from './ChartFrame';
export { XYChart } from './XYChart';
export { subscribeSync } from './XYChart/sync';
export type { ChartArea, ChartBand, ChartLine, ChartPoints, ChartRow, ChartRule } from './XYChart';
export { chartGrid, logAxis, Y_AXIS_WIDTH, type AxisSpec } from './axes';
export type { Plot } from './plot';
export type { TooltipContent, TooltipRow } from './tooltip';
export { SeriesLabel } from './SeriesLabel';
export { KeyLegend, SeriesLegend, type LegendItem } from './Legend';
