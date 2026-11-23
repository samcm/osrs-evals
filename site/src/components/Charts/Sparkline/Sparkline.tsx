import { useMemo, type JSX } from 'react';
import ReactEChartsCore from 'echarts-for-react/lib/core';
import * as echarts from 'echarts/core';
import { LineChart } from 'echarts/charts';
import { GridComponent } from 'echarts/components';
import { CanvasRenderer } from 'echarts/renderers';
import { useChartColors } from '@/components/Charts/useChartColors';
import { ECHARTS_THEME } from '@/utils/echarts-theme';
import type { SparklineProps } from './Sparkline.types';

echarts.use([LineChart, GridComponent, CanvasRenderer]);

/**
 * A tiny inline chart for table cells: a line with no axes, labels, tooltip or grid. Lab's Sparkline,
 * on a value x axis with fixed domains so a column of them shares one scale, and optionally a step
 * line (a count or score over game time).
 *
 * @example
 * ```tsx
 * <Sparkline data={[[0, 0], [120, 3], [400, 5]]} xDomain={[0, 1000]} yDomain={[0, 10]} step />
 * ```
 */
export function Sparkline({
  data,
  xDomain,
  yDomain,
  width = 120,
  height = 24,
  color,
  lineWidth = 1.5,
  step = false,
}: SparklineProps): JSX.Element {
  const { chrome, resolve } = useChartColors();
  const resolvedColor = color ? resolve(color) : chrome.primary;

  const option = useMemo(
    () => ({
      animation: false,
      // Room for half the line's width at the edges, so a line along the top or bottom isn't clipped
      grid: { left: 2, right: 2, top: 2, bottom: 2 },
      xAxis: { type: 'value' as const, show: false, min: xDomain[0], max: xDomain[1] },
      yAxis: { type: 'value' as const, show: false, min: yDomain[0], max: yDomain[1] },
      series: [
        {
          type: 'line' as const,
          data,
          step: step ? ('end' as const) : false,
          symbol: 'none',
          silent: true,
          lineStyle: { width: lineWidth, color: resolvedColor },
        },
      ],
    }),
    [data, xDomain, yDomain, lineWidth, resolvedColor, step]
  );

  return (
    <div aria-hidden style={{ width, height }}>
      <ReactEChartsCore
        theme={ECHARTS_THEME}
        echarts={echarts}
        option={option}
        style={{ width, height }}
        notMerge={true}
        lazyUpdate={true}
      />
    </div>
  );
}
