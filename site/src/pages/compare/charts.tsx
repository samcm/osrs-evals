/** /compare's charts: every run as a point with its group's median, and the tool-call mix. */

import { useMemo } from 'react';
import { useNavigate } from '@tanstack/react-router';
import type { EChartsOption } from 'echarts';
import { Chart } from '@/components/Chart';
import type { Eval, Run } from '@/data/types';
import { categoryAxis, formatAxisNumber, getChartTooltipChrome, tooltipRow, tooltipTitle, valueAxis } from '@/lib/chartChrome';
import { markRich, markText, useBrandImages } from '@/lib/chartKit';
import { formatPercent } from '@/lib/format';
import { logAxis, logRange } from '@/lib/logAxis';
import { variantOf } from '@/lib/series';
import { useThemeColors } from '@/lib/theme';
import { useWidth } from '@/lib/useWidth';
import { groupName, groupSlugs, type GroupBy } from './groups';
import { TOOL_CATEGORIES, type Metric } from './metrics';

/** Narrower than this, a variant's label names its model and leaves the harness to its mark. */
const NARROW = 480;

export interface RankedGroup {
  key: string;
  sample: Run;
  /** Runs with a value, and the value */
  points: { run: Run; value: number }[];
  /** Runs in the group, with or without a value */
  total: number;
  median: number;
}

/** A stable offset in [-1, 1] for a run, so points in a group spread the same way on every render. */
function jitter(id: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return ((h >>> 0) / 0xffffffff) * 2 - 1;
}

/** Canvas label for a group: its marks, then its short name. */
function useGroupLabels(samples: Run[], by: GroupBy, narrow: boolean) {
  const colors = useThemeColors();
  const images = useBrandImages(
    samples.flatMap(s => groupSlugs(s, by)),
    colors.foreground,
    14
  );
  return {
    rich: markRich(images, 14),
    text: (sample: Run) => markText(images, groupSlugs(sample, by), groupName(sample, by, narrow)),
  };
}

/** Every run as a point on the metric, a group per row (ranked, best at the top), with the group's median as a bar. */
export function StripChart({ groups, metric, by, log, evals }: { groups: RankedGroup[]; metric: Metric; by: GroupBy; log: boolean; evals: Eval[] }) {
  const colors = useThemeColors();
  const navigate = useNavigate();
  const [ref, width] = useWidth();
  const labels = useGroupLabels(
    groups.map(g => g.sample),
    by,
    width > 0 && width < NARROW
  );

  const option = useMemo<EChartsOption>(() => {
    const values = groups.flatMap(g => g.points.map(p => p.value));
    const tick = metric.tick ?? metric.format;
    const range = log ? logRange(values) : null;
    const axisLine = { ...categoryAxis(colors).axisLine, onZero: false };
    const xAxis = range
      ? { ...logAxis(colors, range[0], range[1], tick), axisLine }
      : {
          type: 'value' as const,
          min: 0,
          ...valueAxis(colors),
          axisLine,
          axisLabel: {
            ...valueAxis(colors).axisLabel,
            formatter: (v: number) => tick(v),
            hideOverlap: true,
          },
        };
    const titles = new Map(evals.map(e => [e.id, e.title]));

    return {
      animation: false,
      grid: { left: 8, right: 24, top: 8, bottom: 8, containLabel: true },
      tooltip: {
        ...getChartTooltipChrome(colors),
        trigger: 'item',
        formatter: (p: unknown) => {
          const { data } = p as {
            data: { run?: Run; group?: RankedGroup; value: [number, number] };
          };
          if (data.run) {
            return (
              tooltipTitle(variantOf(data.run).name) +
              tooltipRow(null, metric.label, metric.format(data.value[0])) +
              tooltipRow(null, 'Eval', titles.get(data.run.eval) ?? data.run.eval) +
              tooltipRow(null, 'Run', data.run.id)
            );
          }
          if (data.group) {
            return (
              tooltipTitle(groupName(data.group.sample, by)) +
              tooltipRow(null, 'Median', metric.format(data.group.median)) +
              tooltipRow(null, 'Runs', String(data.group.points.length))
            );
          }
          return '';
        },
      },
      xAxis,
      yAxis: {
        type: 'value',
        inverse: true,
        min: -0.5,
        max: groups.length - 0.5,
        interval: 1,
        axisLine: { show: false },
        axisTick: { show: false },
        splitLine: { show: false },
        axisLabel: {
          color: colors.foreground,
          fontSize: 12,
          rich: labels.rich,
          customValues: groups.map((_, i) => i),
          formatter: (v: number) => {
            const g = Number.isInteger(v) ? groups[v] : undefined;
            return g ? labels.text(g.sample) : '';
          },
        },
      },
      series: [
        {
          type: 'scatter',
          id: 'runs',
          data: groups.flatMap((g, i) =>
            g.points.map(p => {
              const v = variantOf(p.run);
              const color = colors.resolve(v.color.token);
              return {
                value: [p.value, i + jitter(p.run.id) * 0.22],
                run: p.run,
                symbol: v.symbol,
                itemStyle: {
                  color: 'transparent',
                  borderColor: color,
                  borderWidth: 1.5,
                },
              };
            })
          ),
          symbolSize: 9,
          cursor: 'pointer',
          emphasis: { scale: 1.4 },
        },
        {
          type: 'scatter',
          id: 'medians',
          data: groups.map((g, i) => ({ value: [g.median, i], group: g })),
          symbol: 'rect',
          symbolSize: [3, 26],
          itemStyle: { color: colors.foreground },
          z: 3,
        },
      ],
    };
  }, [groups, metric, log, colors, labels, by, evals]);

  return (
    <div ref={ref}>
      <Chart
        option={option}
        height={Math.max(160, groups.length * 44 + 40)}
        onEvents={{
          click: p => {
            const run = (p as { data?: { run?: Run } }).data?.run;
            if (run) navigate({ to: '/runs/$runId', params: { runId: run.id } });
          },
        }}
      />
    </div>
  );
}

export interface MixGroup {
  key: string;
  sample: Run;
  counts: Map<string, number>;
  total: number;
}

/** Each group's tool calls as shares by kind, stacked to 100%. */
export function ToolMixChart({ groups, by }: { groups: MixGroup[]; by: GroupBy }) {
  const colors = useThemeColors();
  const [ref, width] = useWidth();
  const labels = useGroupLabels(
    groups.map(g => g.sample),
    by,
    width > 0 && width < NARROW
  );
  const used = TOOL_CATEGORIES.filter(c => groups.some(g => g.counts.get(c.id)));

  const option = useMemo<EChartsOption>(
    () => ({
      animation: false,
      grid: { left: 8, right: 16, top: 8, bottom: 8, containLabel: true },
      tooltip: {
        ...getChartTooltipChrome(colors),
        trigger: 'axis',
        axisPointer: { type: 'none' },
        formatter: (p: unknown) => {
          const items = p as { dataIndex: number; seriesIndex: number }[];
          const g = groups[items[0]?.dataIndex ?? -1];
          if (!g) return '';
          return (
            tooltipTitle(groupName(g.sample, by)) +
            tooltipRow(null, 'Tool calls', formatAxisNumber(g.total)) +
            used
              .filter(c => g.counts.get(c.id))
              .map(c => tooltipRow(colors.resolve(c.token), c.label, formatPercent((g.counts.get(c.id) ?? 0) / g.total)))
              .join('')
          );
        },
      },
      xAxis: {
        type: 'value',
        min: 0,
        max: 1,
        ...valueAxis(colors),
        axisLabel: {
          ...valueAxis(colors).axisLabel,
          formatter: (v: number) => `${Math.round(v * 100)}%`,
        },
      },
      yAxis: {
        type: 'category',
        inverse: true,
        data: groups.map(g => g.key),
        axisLine: { show: false },
        axisTick: { show: false },
        axisLabel: {
          color: colors.foreground,
          fontSize: 12,
          rich: labels.rich,
          formatter: (_: string, i: number) => labels.text(groups[i].sample),
        },
      },
      series: used.map(c => ({
        type: 'bar' as const,
        name: c.label,
        stack: 'mix',
        barWidth: 18,
        itemStyle: {
          color: colors.resolve(c.token),
          borderColor: colors.surface,
          borderWidth: 1,
        },
        data: groups.map(g => (g.counts.get(c.id) ?? 0) / g.total),
      })),
    }),
    [groups, by, colors, labels, used]
  );

  return (
    <div ref={ref}>
      <Chart option={option} height={Math.max(120, groups.length * 36 + 40)} />
    </div>
  );
}
