/**
 * The chart kit: small pieces to compose shadcn charts (ChartContainer and ChartTooltip from
 * `@/components/ui/chart`, over Recharts). Series specs come from `@/lib/chartSeries`.
 *
 *   const series = variants.map(variantSeries);
 *   const shown = series.filter(s => legend.visible(s.id));
 *   const [ref, width] = useWidth();               // @/lib/useWidth
 *   const labels = showEndLabels(width);           // no end labels on a phone: the legend names the lines
 *   <div ref={ref}><ChartContainer config={seriesConfig(series)} className="aspect-auto h-72 w-full">
 *     <LineChart data={rows} margin={chartMargin({ endLabels: labels })} {...syncProps('eval')}>
 *       <CartesianGrid {...gridProps} />
 *       <XAxis {...xAxisProps({ dataKey: 'tick', domain: [0, budget] })} />
 *       <YAxis {...yAxisProps()} />
 *       <ChartTooltip cursor={crosshairCursor} content={<SeriesTooltip series={shown} />} />
 *       {series.map(s => <Line key={s.key} {...lineProps(s, { hidden: !legend.visible(s.id) })} />)}
 *       {labels && <EndLabels items={shown.map(s => ({ series: s, value: last(s) }))} />}
 *       <SpriteMarkers markers={…} />
 *     </LineChart>
 *   </ChartContainer></div>
 *   <SeriesLegend series={series} legend={legend} />
 */

export { seriesConfig, seriesColor } from './config';
export { chartMargin, crosshairCursor, END_LABEL_WIDTH, gridProps, lineProps, logAxisProps, showEndLabels, syncProps, xAxisProps, yAxisProps } from './axes';
export { SeriesTooltip } from './SeriesTooltip';
export { SeriesLabel } from './SeriesLabel';
export { KeyLegend, SeriesLegend, type LegendItem } from './Legend';
export { EndLabels, type EndLabelItem } from './EndLabels';
export { SpriteMarkers, type SpriteMarker } from './SpriteMarkers';
