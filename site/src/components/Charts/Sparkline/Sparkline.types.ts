export interface SparklineProps {
  /** [x, y] points in x order, on a value axis (nulls create gaps) */
  data: [number, number | null][];
  /** Where the x axis starts and stops, so sparklines in a column share a scale */
  xDomain: [number, number];
  /** Where the y axis starts and stops, likewise */
  yDomain: [number, number];
  /** Width in pixels @default 120 */
  width?: number;
  /** Height in pixels @default 24 */
  height?: number;
  /** Line colour (any CSS colour, a token's `var()` too) */
  color?: string;
  /** Line width @default 1.5 */
  lineWidth?: number;
  /** A step line (each value holds until the next) rather than straight @default false */
  step?: boolean;
}
