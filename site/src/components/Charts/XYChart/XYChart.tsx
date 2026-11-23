/**
 * The site's chart: lines, bands, areas, points and bars over a measure, on ECharts with lab's chrome,
 * from typed props. It fills its ChartFrame. Every series keeps its fixed colour, its harness' dash
 * and shape and its thinking level's lightness (lib/chartSeries); the page's one hover lights a
 * series and fades the rest; HTML over the canvas carries what canvas can't draw well: line-end
 * labels and row labels with their marks, game sprites, rules and anything in `overlay`.
 *
 * Lab's MultiLine and ScatterAndLine don't fit here: they have no log axis, their legends and end
 * labels are plain text without marks, and they don't expose where their plot is for HTML on top.
 * Lab's Heatmap and Bar fit their charts as they are; use them in a ChartFrame.
 *
 *   <ChartFrame height="lead" legend={<SeriesLegend series={specs} legend={legend} />}>
 *     <XYChart x={{ domain: [0, budget], ticks: roundTicks(budget) }} y={{ domain: [0, 10], ticks }}
 *       lines={runs.map(r => ({ key: r.id, series: specs.get(r.key), points: r.points }))} sync="eval" />
 *   </ChartFrame>
 */

import { useCallback, useEffect, useRef, useState, type JSX } from 'react';
import ReactEChartsCore from 'echarts-for-react/lib/core';
import type { EChartsInstance } from 'echarts-for-react/lib';
import * as echarts from 'echarts/core';
import { CustomChart, LineChart, ScatterChart } from 'echarts/charts';
import { AxisPointerComponent, GridComponent, TooltipComponent } from 'echarts/components';
import { CanvasRenderer } from 'echarts/renderers';
import clsx from 'clsx';
import { setHovered, useHover, FADED_OPACITY } from '@/lib/hover';
import { ECHARTS_THEME } from '@/utils/echarts-theme';
import { chartGrid, showEndLabels, Y_AXIS_WIDTH } from '@/components/Charts/axes';
import { EndLabels } from '@/components/Charts/EndLabels';
import { plotOf, type Plot } from '@/components/Charts/plot';
import { SpriteMarkers } from '@/components/Charts/SpriteMarkers';
import { useChartColors } from '@/components/Charts/useChartColors';
import { buildOption } from './option';
import { publishSync, subscribeSync } from './sync';
import type { ChartRule, XYChartProps } from './XYChart.types';

echarts.use([
  LineChart,
  ScatterChart,
  CustomChart,
  GridComponent,
  TooltipComponent,
  AxisPointerComponent,
  CanvasRenderer,
]);

/** The size of an element, kept current with a ResizeObserver; the callback is its ref. */
function useSize(): [(node: HTMLElement | null) => (() => void) | undefined, { width: number; height: number }] {
  const [size, setSize] = useState({ width: 0, height: 0 });
  const ref = useCallback((node: HTMLElement | null) => {
    if (!node) return;
    const observer = new ResizeObserver(([entry]) =>
      setSize({ width: entry.contentRect.width, height: entry.contentRect.height })
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, []);
  return [ref, size];
}

const RULE_TONE: Record<NonNullable<ChartRule['tone']>, string> = {
  muted: 'border-muted',
  success: 'border-success',
  primary: 'border-primary',
};

/** Rules across the plot, in HTML so a moving one (a playhead) never redraws the chart. */
function Rules({ rules, plot }: { rules: ChartRule[]; plot: Plot }): JSX.Element {
  return (
    <>
      {rules.map(rule => {
        const tone = rule.tone ?? 'muted';
        const dashed = rule.dashed ?? tone !== 'primary';
        const vertical = rule.x != null;
        const at = vertical ? plot.x(rule.x!) : plot.y(rule.y!);
        if (!Number.isFinite(at)) return null;
        return (
          <div
            key={`${vertical ? 'x' : 'y'}${vertical ? rule.x : rule.y}`}
            aria-hidden
            className={clsx(
              'pointer-events-none absolute',
              vertical ? 'border-l' : 'border-t',
              dashed && 'border-dashed',
              RULE_TONE[tone]
            )}
            style={
              vertical
                ? { left: at, top: plot.top, height: plot.height }
                : { top: at, left: plot.left, width: plot.width }
            }
          >
            {rule.label && (
              <span
                className={clsx(
                  'absolute text-xs whitespace-nowrap text-muted',
                  vertical ? 'bottom-full left-1' : 'right-0 bottom-0.5'
                )}
              >
                {rule.label}
              </span>
            )}
          </div>
        );
      })}
    </>
  );
}

export function XYChart(props: XYChartProps): JSX.Element {
  const {
    x,
    y,
    rows,
    rowLabelWidth = 160,
    endLabels,
    markers,
    rules,
    overlay,
    sync,
    onLineClick,
    onPointClick,
  } = props;
  const colors = useChartColors();
  const hover = useHover();
  const lit = props.lit !== undefined ? props.lit : (hover.id ?? null);
  const [ref, size] = useSize();

  // Room for labels whenever `endLabels` is given, even empty: a synced chart without labels under
  // one with them passes [] so their plots keep one right edge
  const labels = endLabels != null && showEndLabels(size.width);
  const grid = chartGrid({
    left: rows ? rowLabelWidth : Y_AXIS_WIDTH,
    endLabels: labels,
    xName: !!x.name,
    yName: !!y?.name,
  });
  // Rebuilt each render: the props are new each time, and the build is cheap next to ECharts' own update
  const { option, hits } = buildOption(props, grid, colors, lit);
  const plot = plotOf(size, grid, x, rows ? { rows: rows.length } : y!);
  const strength = (id: string | undefined): number => (lit != null && id != null && id !== lit ? FADED_OPACITY : 1);

  const events = {
    mouseover: (e: { seriesName?: string }) => {
      const hit = e.seriesName ? hits.get(e.seriesName) : undefined;
      if (hit?.series) setHovered(hit.series.id);
    },
    mouseout: () => setHovered(undefined),
    globalout: () => setHovered(undefined),
    click: (e: { seriesName?: string; dataIndex: number }) => {
      const hit = e.seriesName ? hits.get(e.seriesName) : undefined;
      if (hit?.kind === 'line') onLineClick?.(hit.line);
      if (hit?.kind === 'points') onPointClick?.(hit.points[e.dataIndex], hit.series);
    },
  };
  // A change of the lit series redraws the chart, which drops the crosshair and tooltip under a
  // still pointer; put them back where the pointer is
  const chartRef = useRef<EChartsInstance | null>(null);
  const pointerRef = useRef<{ x: number; y: number } | null>(null);
  const syncRef = useRef(sync);
  useEffect(() => {
    const instance = chartRef.current;
    if (pointerRef.current && instance && !instance.isDisposed())
      instance.dispatchAction({ type: 'showTip', ...pointerRef.current });
  }, [lit]);

  const ready = useCallback((instance: EChartsInstance) => {
    chartRef.current = instance;
    const zr = instance.getZr();
    zr.on('mousemove', (e: { offsetX: number; offsetY: number }) => {
      pointerRef.current = { x: e.offsetX, y: e.offsetY };
      if (syncRef.current) {
        const inside = instance.containPixel({ gridIndex: 0 }, [e.offsetX, e.offsetY]);
        const at = inside ? (instance.convertFromPixel({ gridIndex: 0 }, [e.offsetX, e.offsetY]) as number[])[0] : null;
        publishSync(syncRef.current, at, instance);
      }
    });
    zr.on('globalout', () => {
      pointerRef.current = null;
      if (syncRef.current) publishSync(syncRef.current, null, instance);
    });
  }, []);

  // The group's crosshair: show this chart's at the x another chart of the group is pointing at
  useEffect(() => {
    syncRef.current = sync;
    if (!sync) return;
    return subscribeSync(sync, (at, from) => {
      const instance = chartRef.current;
      if (!instance || instance === from || instance.isDisposed()) return;
      if (at == null) {
        instance.dispatchAction({ type: 'hideTip' });
        return;
      }
      const [px, py] = instance.convertToPixel({ gridIndex: 0 }, [at, 0]) as number[];
      // Halfway up the chart, so the tooltip sits beside the crosshair rather than on the axis
      instance.dispatchAction({ type: 'showTip', x: px, y: Math.min(py, instance.getHeight() / 2) });
    });
  }, [sync]);

  return (
    <div ref={ref} className="relative size-full">
      {size.height > 0 && (
        <>
          <ReactEChartsCore
            echarts={echarts}
            theme={ECHARTS_THEME}
            option={option}
            replaceMerge={['series']}
            opts={{ renderer: 'canvas' }}
            className="w-full"
            style={{ height: size.height }}
            onEvents={events}
            onChartReady={ready}
          />
          {rows?.map((row, i) => (
            <div
              key={row.key}
              className="absolute left-0 flex h-5 items-center overflow-hidden text-xs"
              style={{ top: plot.y(i) - 10, width: rowLabelWidth - 8 }}
            >
              {row.label}
            </div>
          ))}
          {rules && <Rules rules={rules} plot={plot} />}
          {markers && <SpriteMarkers markers={markers} plot={plot} size={props.markerSize} opacity={strength} />}
          {labels && (
            <EndLabels
              items={endLabels!}
              plot={plot}
              color={s => colors.resolve(s.color)}
              opacity={s => strength(s.id)}
            />
          )}
          {overlay?.(plot)}
        </>
      )}
    </div>
  );
}
