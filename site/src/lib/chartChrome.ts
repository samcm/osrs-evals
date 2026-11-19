/**
 * Shared ECharts chrome (axes, tooltip), copied from lab's chartChrome.ts, so every chart matches.
 */

export interface ChartChromeColors {
  foreground: string;
  muted: string;
  border: string;
  surface: string;
}

/** Tooltip container styling shared by all charts. */
export function getChartTooltipChrome(colors: ChartChromeColors) {
  return {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    padding: [8, 10],
    extraCssText: 'border-radius: 6px; box-shadow: none;',
    confine: true,
    textStyle: { color: colors.foreground, fontSize: 12 },
  };
}

/**
 * An axis-triggered tooltip with a vertical crosshair, for charts that share an x and a Chart
 * `group`: hovering one moves the crosshair on all of them.
 */
export function crosshairTooltip(colors: ChartChromeColors) {
  return {
    ...getChartTooltipChrome(colors),
    trigger: 'axis' as const,
    axisPointer: { type: 'line' as const, snap: false, lineStyle: { color: colors.muted, width: 1, type: 'dashed' as const } },
  };
}

/** Axis name text style. */
export function getChartAxisNameStyle(colors: ChartChromeColors) {
  return { color: colors.muted, fontSize: 11, fontWeight: 'normal' as const };
}

/** Name placement for a value axis that sits above the axis, reading horizontally. */
export function getChartValueAxisName(colors: ChartChromeColors) {
  return {
    nameLocation: 'end' as const,
    nameGap: 10,
    nameTextStyle: { ...getChartAxisNameStyle(colors), align: 'left' as const, padding: [0, 0, 0, -8] },
  };
}

/** Name placement for an x axis: under the labels, at the end. */
export function getChartXAxisName(colors: ChartChromeColors) {
  return {
    nameLocation: 'middle' as const,
    nameGap: 28,
    nameTextStyle: getChartAxisNameStyle(colors),
  };
}

/** Axis label style. */
export function getChartAxisLabelStyle(colors: ChartChromeColors) {
  return { color: colors.muted, fontSize: 11 };
}

/** Axis line shown in the border color. */
export function getChartAxisLine(colors: ChartChromeColors) {
  return { show: true, lineStyle: { color: colors.border } };
}

/** Hairline split lines for a value axis. */
export function getChartValueSplitLine(colors: ChartChromeColors) {
  return { show: true, lineStyle: { color: colors.border, type: 'solid' as const } };
}

/** A value axis: no axis line, hairline split lines, muted labels. */
export function valueAxis(colors: ChartChromeColors) {
  return {
    axisLine: { show: false },
    axisTick: { show: false },
    splitLine: getChartValueSplitLine(colors),
    axisLabel: getChartAxisLabelStyle(colors),
  };
}

/** A category or time axis: its line, no split lines. */
export function categoryAxis(colors: ChartChromeColors) {
  return {
    axisLine: getChartAxisLine(colors),
    axisTick: { show: false },
    splitLine: { show: false },
    axisLabel: getChartAxisLabelStyle(colors),
  };
}

/** Axis numbers: compact from 10,000 up ("40K", "1.2M"), grouped digits below. */
export function formatAxisNumber(value: number): string {
  if (Math.abs(value) >= 10_000) {
    return new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 }).format(value);
  }
  return value.toLocaleString('en-US', { maximumFractionDigits: 6 });
}

/** A tooltip row: swatch, label, right-aligned value. */
export function tooltipRow(color: string | null, label: string, value: string): string {
  const swatch = color
    ? `<span style="display:inline-block;width:8px;height:8px;border-radius:2px;background:${color};margin-right:6px"></span>`
    : '';
  return `<div style="display:flex;align-items:center;justify-content:space-between;gap:16px;line-height:18px"><span>${swatch}${escapeHtml(label)}</span><span style="font-variant-numeric:tabular-nums;font-weight:500">${escapeHtml(value)}</span></div>`;
}

export function tooltipTitle(text: string): string {
  return `<div style="font-weight:600;margin-bottom:4px">${escapeHtml(text)}</div>`;
}

export function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}
