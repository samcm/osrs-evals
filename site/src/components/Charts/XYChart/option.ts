/**
 * XYChart's ECharts option, built from its typed props: lab's chrome for axes, grid and tooltip,
 * each series in its fixed colour, dash and shape, faded unless lit.
 */

import type { SeriesSpec } from '@/lib/chartSeries';
import { FADED_OPACITY } from '@/lib/hover';
import { echartsAxis, type AxisSpec, type ChartGrid } from '@/components/Charts/axes';
import { getChartTooltipChrome } from '@/components/Charts/chartChrome';
import { tooltipHtml, type TooltipContent } from '@/components/Charts/tooltip';
import type { ChartColors } from '@/components/Charts/useChartColors';
import type { ChartLine, ChartPoint, XYChartProps } from './XYChart.types';
import { formatTick } from '@/lib/ticks';

/** What a drawn ECharts series stands for, by its name (its id), for hover, click and tooltips. */
export type Hit =
  | { kind: 'line'; line: ChartLine; series?: SeriesSpec }
  | { kind: 'points'; series: SeriesSpec; points: ChartPoint[] }
  | { kind: 'bars'; series: SeriesSpec; values: { row: number; value: number }[] }
  | { kind: 'other'; series?: SeriesSpec };

const LINE_WIDTH = 1.75;

/** An agent's line style as an ECharts dash. */
function dash(line: SeriesSpec['line'] | undefined): 'solid' | number[] {
  return line === 'dashed' ? [6, 4] : line === 'dotted' ? [1.5, 3] : 'solid';
}

/** A line's value at x: the last point at or before it on a step line, else interpolated. */
export function valueAt(points: [number, number | null][], x: number, step: boolean): number | null {
  let i = -1;
  for (let j = 0; j < points.length && points[j][0] <= x; j++) i = j;
  if (i < 0) return null;
  const [x0, y0] = points[i];
  const next = points[i + 1];
  if (step || !next || y0 == null || next[1] == null || next[0] === x0) return y0;
  return y0 + ((next[1] - y0) * (x - x0)) / (next[0] - x0);
}

function defaultAxisTooltip(lines: ChartLine[], x: AxisSpec, y: AxisSpec | undefined) {
  const format = y?.formatValue ?? y?.format ?? formatTick;
  return (at: number): TooltipContent | null => {
    const rows = lines
      .map(line => ({ line, value: valueAt(line.points, at, line.step ?? true) }))
      .filter((r): r is { line: ChartLine; value: number } => r.value != null)
      .sort((a, b) => b.value - a.value)
      .map(({ line, value }) => ({ series: line.series, label: line.label, value: format(value) }));
    return rows.length ? { title: (x.formatValue ?? x.format ?? formatTick)(at), rows } : null;
  };
}

export function buildOption(
  props: XYChartProps,
  grid: ChartGrid,
  colors: ChartColors,
  lit: ReadonlySet<string> | null
): { option: Record<string, unknown>; hits: Map<string, Hit> } {
  const { chrome, resolve } = colors;
  const hits = new Map<string, Hit>();
  const series: Record<string, unknown>[] = [];
  const strength = (s: SeriesSpec | undefined): number => (lit != null && s && !lit.has(s.id) ? FADED_OPACITY : 1);
  const isLit = (s: SeriesSpec | undefined): boolean => lit != null && s != null && lit.has(s.id);
  const hoverable = { emphasis: { disabled: true }, animation: false };

  // A band is one polygon (upper edge forward, lower edge back), drawn as a custom series so it
  // needs no stacking and its runs' x values may differ from the lines'
  for (const [i, band] of (props.bands ?? []).entries()) {
    const id = `band:${band.key ?? band.series.key}:${i}`;
    const step = band.step ?? true;
    const upper: number[][] = [];
    const lower: number[][] = [];
    band.points.forEach(([px, lo, hi], j) => {
      const next = band.points[j + 1];
      upper.push([px, hi]);
      lower.push([px, lo]);
      if (step && next) {
        upper.push([next[0], hi]);
        lower.push([next[0], lo]);
      }
    });
    const outline = [...upper, ...lower.reverse()];
    const fill = resolve(band.series.color);
    const opacity = (band.opacity ?? 0.15) * strength(band.series);
    series.push({
      ...hoverable,
      id,
      name: id,
      type: 'custom',
      silent: true,
      z: 1,
      clip: true,
      data: [0],
      renderItem: (_params: unknown, api: { coord: (v: number[]) => number[] }) => ({
        type: 'polygon',
        shape: { points: outline.map(p => api.coord(p)) },
        style: { fill, opacity },
      }),
    });
  }

  for (const [i, area] of (props.areas ?? []).entries()) {
    const id = `area:${area.key ?? area.series.key}:${i}`;
    const color = resolve(area.series.color);
    hits.set(id, { kind: 'other', series: area.series });
    series.push({
      ...hoverable,
      id,
      name: id,
      type: 'line',
      stack: area.stack,
      step: (area.step ?? true) ? 'end' : false,
      symbol: 'none',
      z: 2,
      data: area.points,
      lineStyle: { color, width: 1, opacity: strength(area.series) },
      areaStyle: { color, opacity: 0.85 * strength(area.series) },
    });
  }

  if (props.frontier?.length) {
    series.push({
      ...hoverable,
      id: 'frontier',
      type: 'line',
      data: props.frontier,
      symbol: 'none',
      silent: true,
      z: 3,
      lineStyle: { color: chrome.muted, width: 1, type: [4, 4], opacity: 0.6 },
    });
  }

  // A lit line draws over the faded ones by its z, so series keep their order (and ECharts its views)
  const lines = props.lines ?? [];
  for (const [i, line] of lines.entries()) {
    const id = `line:${line.key ?? line.series?.key ?? i}`;
    hits.set(id, { kind: 'line', line, series: line.series });
    const reference = !line.series;
    series.push({
      ...hoverable,
      id,
      name: id,
      type: 'line',
      data: line.points,
      step: (line.step ?? true) ? 'end' : false,
      symbol: 'none',
      showSymbol: false,
      connectNulls: false,
      triggerLineEvent: !reference,
      silent: reference,
      cursor: props.onLineClick ? 'pointer' : 'default',
      z: reference ? 4 : isLit(line.series) ? 6 : 5,
      lineStyle: reference
        ? { color: chrome.muted, width: line.width ?? 1.5, opacity: 0.6 }
        : {
            color: resolve(line.series!.color),
            width: (line.width ?? LINE_WIDTH) + (isLit(line.series) ? 0.5 : 0),
            type: dash(line.series!.line),
            opacity: strength(line.series),
          },
    });
  }

  for (const [i, group] of (props.points ?? []).entries()) {
    const id = `points:${group.series.key}:${i}`;
    const color = resolve(group.series.color);
    hits.set(id, { kind: 'points', series: group.series, points: group.points });
    series.push({
      ...hoverable,
      id,
      name: id,
      type: 'scatter',
      symbol: group.series.symbol,
      symbolSize: group.size ?? 8,
      cursor: props.onPointClick ? 'pointer' : 'default',
      z: isLit(group.series) ? 8 : 7,
      itemStyle: { color, opacity: strength(group.series) },
      data: group.points.map(p => ({
        value: [p.x, p.y],
        ...(p.hollow ? { itemStyle: { color: 'transparent', borderColor: color, borderWidth: 1.5 } } : {}),
      })),
    });
  }

  // Bars on rows: stacked in the order given, drawn as rects so they can sit on a value axis of rows
  const stackEnd = new Map<number, number>();
  for (const [i, bar] of (props.bars ?? []).entries()) {
    const id = `bars:${bar.series.key}:${i}`;
    const color = resolve(bar.series.color);
    const opacity = strength(bar.series);
    hits.set(id, { kind: 'bars', series: bar.series, values: bar.values });
    series.push({
      ...hoverable,
      id,
      name: id,
      type: 'custom',
      z: 5,
      encode: { x: [0, 1], y: 2 },
      data: bar.values.map(({ row, value }) => {
        const from = stackEnd.get(row) ?? 0;
        stackEnd.set(row, from + value);
        return [from, from + value, row];
      }),
      renderItem: (
        _params: unknown,
        api: { value: (dim: number) => number; coord: (v: number[]) => number[]; size: (v: number[]) => number[] }
      ) => {
        const start = api.coord([api.value(0), api.value(2)]);
        const end = api.coord([api.value(1), api.value(2)]);
        const height = Math.min(20, api.size([0, 1])[1] * 0.5);
        return {
          type: 'rect',
          shape: { x: start[0], y: start[1] - height / 2, width: Math.max(0, end[0] - start[0]), height },
          style: { fill: color, opacity },
        };
      },
    });
  }

  const rows = props.rows;
  const yAxis = rows
    ? {
        type: 'value',
        inverse: true,
        min: -0.5,
        max: rows.length - 0.5,
        axisLine: { show: false },
        axisTick: { show: false },
        axisLabel: { show: false },
        splitLine: { show: false },
      }
    : echartsAxis(props.y!, chrome, 'y');

  const item = props.pointTooltip || props.barTooltip;
  const axisTooltip =
    props.axisTooltip === false
      ? null
      : (props.axisTooltip ??
        defaultAxisTooltip(
          lines.filter(l => l.series || l.label),
          props.x,
          props.y
        ));
  const html = (content: TooltipContent | null): string => (content ? tooltipHtml(content, resolve, lit) : '');

  const tooltip = item
    ? {
        ...getChartTooltipChrome(chrome),
        trigger: 'item',
        transitionDuration: 0.15,
        formatter: (p: { seriesName?: string; dataIndex: number }) => {
          const hit = p.seriesName ? hits.get(p.seriesName) : undefined;
          if (hit?.kind === 'points' && props.pointTooltip)
            return html(props.pointTooltip(hit.points[p.dataIndex], hit.series));
          if (hit?.kind === 'bars' && props.barTooltip)
            return html(props.barTooltip(hit.values[p.dataIndex], hit.series));
          return '';
        },
      }
    : axisTooltip
      ? {
          ...getChartTooltipChrome(chrome),
          trigger: 'axis',
          transitionDuration: 0.15,
          // Beside the crosshair, on the side with room, so it never covers the values it lists
          position: (
            point: number[],
            _params: unknown,
            _dom: unknown,
            _rect: unknown,
            size: { contentSize: number[]; viewSize: number[] }
          ): number[] => {
            const [w, h] = size.contentSize;
            const [viewW, viewH] = size.viewSize;
            const x = point[0] + 16 + w <= viewW ? point[0] + 16 : point[0] - 16 - w;
            return [x, Math.max(0, Math.min(point[1] - h / 2, viewH - h))];
          },
          axisPointer: {
            type: 'line',
            snap: false,
            label: { show: false },
            lineStyle: { color: chrome.muted, width: 1, type: [3, 3] },
          },
          formatter: (params: { axisValue?: number }[] | { axisValue?: number }) => {
            const first = Array.isArray(params) ? params[0] : params;
            const at = Number(first?.axisValue);
            return Number.isFinite(at) ? html(axisTooltip(at)) : '';
          },
        }
      : { show: false };

  return {
    hits,
    option: {
      animation: false,
      grid: { ...grid, containLabel: false },
      xAxis: echartsAxis({ ...props.x, grid: props.x.grid ?? !!rows }, chrome, 'x'),
      yAxis,
      tooltip,
      series,
    },
  };
}
