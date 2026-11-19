/**
 * One frame for every chart on a page, so charts stacked on a page line up and read as one
 * instrument: the same left gutter (the y axis, or the row labels of a row chart), the same plot
 * margins, and two heights only.
 *
 *   <ChartContainer className={cn('aspect-auto w-full', FRAME.lead)}>
 *     <LineChart margin={FRAME.margin}>
 *       <YAxis … width={FRAME.gutter} />
 *
 * Row charts (one row per series, such as dot strips and stacked bars) take FRAME.row per row and
 * put their row labels in the same gutter, widened to `gutterFor(labels)` when names need it; give
 * every chart on the page that same gutter.
 */

export const FRAME = {
  /** Left gutter: the y axis or the row labels, in CSS pixels */
  gutter: 64,
  /** Plot margins inside the chart; the left is the gutter */
  margin: { top: 12, right: 16, bottom: 0, left: 0 },
  /** Heights: the page's lead chart, and every other chart */
  lead: 'h-80',
  compact: 'h-56',
  leadPx: 320,
  compactPx: 224,
  /** Recharts' x axis height, under the plot */
  xAxis: 30,
  /** One row of a row chart */
  row: 28,
} as const;

/** The gutter that fits the widest row label (marks, short name, harness badge), at least FRAME.gutter. */
export function gutterFor(labels: { label: string; harness?: string }[]): number {
  return Math.max(FRAME.gutter, ...labels.map(l => 22 + l.label.length * 6.6 + (l.harness ? l.harness.length * 7 + 26 : 0) + 8));
}
