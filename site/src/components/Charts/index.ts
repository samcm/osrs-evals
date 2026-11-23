/**
 * The chart kit: small pieces to compose shadcn charts (ChartContainer and ChartTooltip from
 * `@/components/ui/chart`, over Recharts). Series specs come from `@/lib/chartSeries`.
 *
 *   const series = variants.map(variantSeries);
 *   const shown = series.filter(s => legend.visible(s.id));
 *   const [ref, width] = useWidth();               // @/lib/useWidth
 *   const labels = showEndLabels(width);           // no end labels on a phone: the legend names the lines
 *   <div ref={ref}><ChartFrame config={seriesConfig(series)} height="lead" loading={!data} legend={<SeriesLegend series={series} legend={legend} />}>
 *     <LineChart data={rows} margin={chartMargin({ endLabels: labels })} {...syncProps('eval')}>
 *       <CartesianGrid {...gridProps} />
 *       <XAxis {...xAxisProps({ dataKey: 'tick', domain: [0, budget] })} />
 *       <YAxis {...yAxisProps()} />
 *       <ChartTooltip cursor={crosshairCursor} content={<SeriesTooltip series={shown} />} />
 *       {series.map(s => <Line key={s.key} {...lineProps(s, { hidden: !legend.visible(s.id), faded: hover.faded(s.id) })} />)}
 *       {labels && <EndLabels items={shown.map(s => ({ series: s, value: last(s) }))} />}
 *       <SpriteMarkers markers={…} />
 *     </LineChart>
 *   </ChartFrame></div>
 */

export { seriesConfig, seriesColor } from './config';
export { CHART_HEIGHTS, ChartFrame, ROW_HEIGHT, type ChartHeight } from './ChartFrame';
export {
  chartMargin,
  crosshairCursor,
  END_LABEL_WIDTH,
  gridProps,
  lineProps,
  logAxisProps,
  NAMED_Y_AXIS_WIDTH,
  showEndLabels,
  syncProps,
  xAxisProps,
  Y_AXIS_WIDTH,
  yAxisProps,
} from './axes';
export { SeriesTooltip } from './SeriesTooltip';
export { SeriesLabel } from './SeriesLabel';
export { KeyLegend, SeriesLegend, type LegendItem } from './Legend';
export { EndLabels, type EndLabelItem } from './EndLabels';
export { SpriteMarkers, type SpriteMarker } from './SpriteMarkers';
