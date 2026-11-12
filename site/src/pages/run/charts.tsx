/** The run page's charts: the eval's measure over game ticks, and each model call along wall-clock time. */

import { useMemo } from 'react';
import type { EChartsOption } from 'echarts';
import type { CustomSeriesRenderItemAPI, CustomSeriesRenderItemParams } from 'echarts';
import { Card } from '@/components/Card';
import { Chart } from '@/components/Chart';
import { ChartLegend } from '@/components/ChartLegend';
import type { RunDetail } from '@/data/types';
import {
  categoryAxis,
  formatAxisNumber,
  getChartTooltipChrome,
  getChartValueAxisName,
  getChartXAxisName,
  tooltipRow,
  tooltipTitle,
  valueAxis,
} from '@/lib/chartChrome';
import { evalArt } from '@/lib/evals';
import { formatClock, formatInt, formatSeconds, formatTokens } from '@/lib/format';
import { hashColor, modelInfo } from '@/lib/series';
import { useThemeColors, withAlpha } from '@/lib/theme';

/** Timeline points on one tick axis: attempts after the first continue from where the last ended. */
function onOneAxis(run: RunDetail) {
  const points: { x: number; value: number; attempt: number; accounts: Record<string, number> }[] = [];
  const boundaries: { x: number; attempt: number }[] = [];
  let offset = 0;
  let lastAttempt = run.timeline[0]?.attempt ?? 1;
  let lastX = 0;
  for (const p of run.timeline) {
    const attempt = p.attempt ?? 1;
    if (attempt !== lastAttempt) {
      offset = lastX;
      boundaries.push({ x: offset, attempt });
      lastAttempt = attempt;
    }
    lastX = offset + p.tick;
    points.push({ x: lastX, value: p.value, attempt, accounts: p.accounts ?? {} });
  }
  return { points, boundaries };
}

export function ScoreChart({ run }: { run: RunDetail }) {
  const c = useThemeColors();
  const measure = evalArt(run.eval).measure;

  const option = useMemo<EChartsOption>(() => {
    const { points, boundaries } = onOneAxis(run);
    const accounts = Object.keys(points[0]?.accounts ?? {});
    const colour = c.resolve(modelInfo(run.model).color.token);
    const lastX = points[points.length - 1]?.x ?? 0;
    // The budget, unless the run played past it (the last tick lands after the budget ends)
    const maxX = lastX <= run.budget_ticks * run.attempts ? run.budget_ticks * run.attempts : undefined;
    const marks: object[] = boundaries.map(b => ({
      xAxis: b.x,
      label: { formatter: `Attempt ${b.attempt}`, position: 'end' },
    }));
    if (run.success && run.ticks != null && run.attempts === 1) {
      marks.push({ xAxis: run.ticks, label: { formatter: 'Finished', color: c.success, position: 'end' }, lineStyle: { color: c.success, type: [4, 4] } });
    }
    const yMarks = run.target != null ? [{ yAxis: run.target, label: { formatter: 'Target', position: 'insideEndTop' } }] : [];
    return {
      animation: false,
      grid: { left: 56, right: 24, top: 32, bottom: 50 },
      tooltip: {
        ...getChartTooltipChrome(c),
        trigger: 'axis',
        axisPointer: { type: 'line', lineStyle: { color: c.border } },
        formatter: (p: unknown) => {
          const items = p as { dataIndex: number; seriesName: string; color: string; value: [number, number] }[];
          const point = points[items[0].dataIndex];
          if (!point) return '';
          return (
            tooltipTitle(`Tick ${formatInt(point.x)}`) +
            (run.attempts > 1 ? tooltipRow(null, 'Attempt', String(point.attempt)) : '') +
            items.map(i => tooltipRow(i.color, i.seriesName, formatInt(i.value[1]))).join('')
          );
        },
      },
      xAxis: {
        type: 'value',
        min: 0,
        max: maxX,
        ...categoryAxis(c),
        ...getChartXAxisName(c),
        name: 'Game ticks',
        axisLabel: { ...categoryAxis(c).axisLabel, formatter: (v: number) => formatAxisNumber(v) },
      },
      yAxis: {
        type: 'value',
        min: 0,
        max: run.target != null ? (v: { max: number }) => Math.max(v.max, run.target!) : undefined,
        minInterval: 1,
        ...valueAxis(c),
        ...getChartValueAxisName(c),
        name: measure,
        axisLabel: { ...valueAxis(c).axisLabel, formatter: (v: number) => formatAxisNumber(v) },
      },
      series: [
        {
          type: 'line',
          name: accounts.length > 1 ? 'Total' : measure,
          step: 'end',
          showSymbol: false,
          data: points.map(p => [p.x, p.value]),
          lineStyle: { width: 1.5, color: colour },
          itemStyle: { color: colour },
          areaStyle: { color: withAlpha(colour, 0.08) },
          markLine: {
            silent: true,
            symbol: 'none',
            lineStyle: { color: c.muted, type: [4, 4], width: 1 },
            label: { color: c.muted, fontSize: 11, position: 'insideEndTop' },
            data: [...marks, ...yMarks] as never,
          },
        },
        ...(accounts.length > 1
          ? accounts.map(a => {
              const accountColour = c.resolve(hashColor(a).token);
              return {
                type: 'line' as const,
                name: a,
                step: 'end' as const,
                showSymbol: false,
                data: points.map(p => [p.x, p.accounts[a] ?? 0]),
                lineStyle: { width: 1, color: accountColour },
                itemStyle: { color: accountColour },
              };
            })
          : []),
      ],
    } as EChartsOption;
  }, [c, measure, run]);

  return (
    <Card title={`${measure} over the run`} subtitle={run.attempts > 1 ? 'Game ticks, attempts end to end' : 'Game ticks'}>
      {run.timeline.length ? <Chart option={option} height={280} /> : <p className="py-6 text-center text-sm text-muted">No timeline was recorded.</p>}
    </Card>
  );
}

/** Each model call as a bar along wall-clock seconds, then a lighter bar until the next call. */
export function TurnTimeline({ run, onTurn }: { run: RunDetail; onTurn: (turn: number) => void }) {
  const c = useThemeColors();
  const turns = run.turns;
  const height = Math.min(520, Math.max(180, turns.length * 14 + 70));

  const option = useMemo<EChartsOption>(() => {
    const colour = c.resolve(modelInfo(run.model).color.token);
    const light = withAlpha(c.muted, 0.3);
    const end = Math.max(...turns.map(t => t.at + t.model_seconds + (t.then_seconds ?? 0)), 1);
    const data = turns.map((t, i) => [i, t.at, t.at + t.model_seconds, t.at + t.model_seconds + (t.then_seconds ?? 0)]);
    return {
      animation: false,
      grid: { left: 48, right: 24, top: 16, bottom: 50 },
      tooltip: {
        ...getChartTooltipChrome(c),
        trigger: 'item',
        formatter: (p: unknown) => {
          const i = (p as { dataIndex: number }).dataIndex;
          const t = turns[i];
          return (
            tooltipTitle(`Turn ${i + 1}`) +
            tooltipRow(null, 'Starts at', formatClock(t.at)) +
            tooltipRow(colour, 'Model', `${formatSeconds(t.model_seconds)} s`) +
            tooltipRow(light, 'Until next call', t.then_seconds == null ? 'Last call' : `${formatSeconds(t.then_seconds)} s`) +
            tooltipRow(null, 'Input tokens', formatTokens(t.input_tokens)) +
            tooltipRow(null, 'Output tokens', formatTokens(t.output_tokens)) +
            tooltipRow(null, 'Tool calls', String(t.actions.length))
          );
        },
      },
      xAxis: {
        type: 'value',
        min: 0,
        max: Math.ceil(end),
        ...categoryAxis(c),
        ...getChartXAxisName(c),
        name: 'Wall-clock seconds',
        axisLabel: { ...categoryAxis(c).axisLabel, formatter: (v: number) => formatClock(v) },
      },
      yAxis: {
        type: 'value',
        inverse: true,
        min: -0.5,
        max: turns.length - 0.5,
        ...valueAxis(c),
        splitLine: { show: false },
        minInterval: 1,
        ...getChartValueAxisName(c),
        nameLocation: 'start',
        name: 'Turn',
        axisLabel: {
          ...valueAxis(c).axisLabel,
          formatter: (v: number) => (Number.isInteger(v) && v >= 0 && v < turns.length ? String(v + 1) : ''),
        },
      },
      series: [
        {
          type: 'custom',
          encode: { x: [1, 2, 3], y: 0 },
          data,
          cursor: 'pointer',
          renderItem: (_params: CustomSeriesRenderItemParams, api: CustomSeriesRenderItemAPI) => {
            const row = api.value(0) as number;
            const [x0, y] = api.coord([api.value(1), row]);
            const [x1] = api.coord([api.value(2), row]);
            const [x2] = api.coord([api.value(3), row]);
            const size = api.size?.([0, 1]) as number[];
            const h = Math.max(2, Math.min(10, size[1] * 0.7));
            return {
              type: 'group',
              children: [
                { type: 'rect', shape: { x: x1, y: y - h / 2, width: Math.max(0, x2 - x1), height: h }, style: { fill: light } },
                { type: 'rect', shape: { x: x0, y: y - h / 2, width: Math.max(1.5, x1 - x0), height: h }, style: { fill: colour } },
              ],
            };
          },
        },
      ],
    } as EChartsOption;
  }, [c, run.model, turns]);

  return (
    <Card title="Model calls" subtitle="Wall-clock time from the first event">
      <Chart
        option={option}
        height={height}
        onEvents={{ click: p => onTurn((p as { dataIndex: number }).dataIndex + 1) }}
      />
      <ChartLegend
        className="mt-2"
        items={[
          { label: 'Waiting on model', colors: [modelInfo(run.model).color] },
          { label: 'Until the next call', swatchClassName: 'bg-muted-30' },
        ]}
      />
    </Card>
  );
}
