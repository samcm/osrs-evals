import { useEffect, useState } from 'react';
import ReactEChartsCore from 'echarts-for-react/esm/core';
import type { EChartsOption } from 'echarts';
import clsx from 'clsx';
import { ECHARTS_THEME, echarts } from '@/lib/echarts-theme';

let fontsReady = false;

/**
 * Every chart on the site: ECharts with the registered theme. It waits for Geist to load so the
 * canvas never draws its labels in a fallback face.
 */
export function Chart({
  option,
  height,
  className,
  onEvents,
  group,
}: {
  option: EChartsOption;
  /** Pixels; charts are as wide as their card */
  height: number;
  className?: string;
  onEvents?: Record<string, (params: unknown) => void>;
  /** Charts with the same group share a crosshair (ECharts connect): give them the same x axis, min/max and grid left/right, and crosshairTooltip */
  group?: string;
}) {
  const [ready, setReady] = useState(fontsReady);
  useEffect(() => {
    if (ready) return;
    let live = true;
    document.fonts.ready.then(() => {
      fontsReady = true;
      if (live) setReady(true);
    });
    return () => {
      live = false;
    };
  }, [ready]);

  return (
    <div className={clsx('w-full min-w-0', className)} style={{ height }}>
      {ready && (
        <ReactEChartsCore
          echarts={echarts}
          option={option}
          theme={ECHARTS_THEME}
          notMerge
          lazyUpdate
          onEvents={onEvents}
          onChartReady={chart => {
            if (!group) return;
            chart.group = group;
            echarts.connect(group);
          }}
          style={{ height, width: '100%' }}
          opts={{ renderer: 'canvas' }}
        />
      )}
    </div>
  );
}
