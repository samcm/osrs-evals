/**
 * The Recharts chart kit, kept only so pages not yet ported to ECharts still compile. New and ported
 * charts use `@/components/Charts` (XYChart in ChartFrame). Delete this folder with Recharts once
 * no page imports it.
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
export { SeriesLabel } from '@/components/Charts/SeriesLabel';
export { KeyLegend, SeriesLegend, type LegendItem } from '@/components/Charts/Legend';
export { EndLabels, type EndLabelItem } from './EndLabels';
export { SpriteMarkers, type SpriteMarker } from './SpriteMarkers';
