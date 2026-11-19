import { TOOL_CATEGORIES } from '@/lib/tools';
/** How time and effort were spent, per variant, model or agent: model time against tool time, the tool-call mix, game actions that failed. */

import { useMemo } from 'react';
import type { EChartsOption } from 'echarts';
import { Card } from '@/components/Card';
import { Chart } from '@/components/Chart';
import { ChartLegend, type LegendItem } from '@/components/ChartLegend';
import { ParamSegmented } from '@/components/bits';
import type { Run } from '@/data/types';
import { categoryAxis, getChartTooltipChrome, tooltipRow, tooltipTitle, valueAxis } from '@/lib/chartChrome';
import { markRich, markText, useBrandImages } from '@/lib/chartKit';
import { formatClock, formatDecimal, formatInt } from '@/lib/format';
import { mean } from '@/lib/stats';
import { useThemeColors, withAlpha } from '@/lib/theme';
import { useWidth } from '@/lib/useWidth';
import { labelWidth } from './chartBits';
import { groupRuns, type Group, type GroupBy } from './model';

const CATEGORIES = TOOL_CATEGORIES.map(c => ({ id: c.id, label: c.label, token: c.color.token, className: c.color.swatchClassName }));

const ROW = 34;

interface Segment {
  name: string;
  /** Resolved colour per group, or one for all */
  color: (g: Group) => string;
  value: (runs: Run[]) => number;
}

interface PanelSpec {
  title: string;
  segments: Segment[];
  format: (v: number) => string;
  legend: LegendItem[];
}

function Panel({
  groups,
  spec,
  showLabels,
  labelRoom,
  marks,
}: {
  groups: Group[];
  spec: PanelSpec;
  showLabels: boolean;
  labelRoom: number;
  marks: Record<string, string>;
}) {
  const c = useThemeColors();
  const option = useMemo<EChartsOption>(() => {
    const rows = [...groups].reverse();
    const values = spec.segments.map(s => rows.map(g => s.value(g.runs)));
    return {
      animation: false,
      grid: { left: showLabels ? labelRoom : 8, right: 16, top: 4, bottom: 24 },
      tooltip: {
        ...getChartTooltipChrome(c),
        trigger: 'axis',
        axisPointer: { type: 'shadow', shadowStyle: { color: withAlpha(c.muted, 0.08) } },
        formatter: (p: unknown) => {
          const i = (p as { dataIndex: number }[])[0]?.dataIndex;
          const g = rows[i];
          if (!g) return '';
          return (
            tooltipTitle(g.full) +
            spec.segments.map((s, k) => (values[k][i] > 0 ? tooltipRow(s.color(g), s.name, spec.format(values[k][i])) : '')).join('')
          );
        },
      },
      xAxis: { type: 'value', ...valueAxis(c), axisLabel: { ...valueAxis(c).axisLabel, hideOverlap: true, formatter: spec.format } },
      yAxis: {
        type: 'category',
        data: rows.map(g => g.key),
        ...categoryAxis(c),
        axisLabel: {
          ...categoryAxis(c).axisLabel,
          show: showLabels,
          color: c.foreground,
          formatter: (key: string) => {
            const g = rows.find(r => r.key === key)!;
            return markText(marks, g.slugs, g.name);
          },
          rich: markRich(marks),
        },
      },
      series: spec.segments.map((s, k) => ({
        type: 'bar',
        name: s.name,
        stack: 'all',
        barWidth: 14,
        data: rows.map((g, i) => ({ value: values[k][i], itemStyle: { color: s.color(g) } })),
      })),
    } as EChartsOption;
  }, [c, groups, labelRoom, marks, showLabels, spec]);

  return (
    <div className="flex min-w-0 flex-col">
      <h3 className="text-xs/5 font-medium text-muted" style={{ paddingLeft: showLabels ? labelRoom : 8 }}>
        {spec.title}
      </h3>
      <Chart option={option} height={28 + groups.length * ROW} />
      <ChartLegend className="mt-1" items={spec.legend} />
    </div>
  );
}

export function EffortCard({ runs, by }: { runs: Run[]; by: GroupBy }) {
  const c = useThemeColors();
  const [ref, width] = useWidth();
  const groups = useMemo(() => groupRuns(runs, by), [runs, by]);
  const marks = useBrandImages(
    groups.flatMap(g => g.slugs),
    c.foreground,
    14
  );
  const wide = width >= 900;
  const labelRoom = Math.min(200, Math.max(...groups.map(g => labelWidth(g.slugs.length, g.name)))) + 12;

  const specs = useMemo<PanelSpec[]>(() => {
    const groupColor = (g: Group): string => (g.color ? c.resolve(g.color.token) : withAlpha(c.foreground, 0.6));
    const tools = withAlpha(c.muted, 0.55);
    const other = withAlpha(c.muted, 0.22);
    const present = CATEGORIES.filter(cat => runs.some(r => (r.metrics.tool_mix[cat.id] ?? 0) > 0));
    const modelColors = [...new Map(groups.flatMap(g => (g.color ? [[g.color.token, g.color] as const] : []))).values()];
    return [
      {
        title: 'Time per run',
        format: (v: number) => formatClock(v),
        segments: [
          { name: 'Model', color: groupColor, value: rs => mean(rs.map(r => r.model_seconds)) ?? 0 },
          { name: 'Tools', color: () => tools, value: rs => mean(rs.map(r => r.metrics.tool_seconds)) ?? 0 },
          {
            name: 'Other',
            color: () => other,
            value: rs => mean(rs.map(r => Math.max(0, (r.game_seconds ?? 0) - r.model_seconds - r.metrics.tool_seconds))) ?? 0,
          },
        ],
        legend: [
          modelColors.length ? { label: 'Model', colors: modelColors } : { label: 'Model', swatchClassName: 'bg-foreground-60' },
          { label: 'Tools', swatchClassName: 'bg-muted-50' },
          { label: 'Other', swatchClassName: 'bg-muted-20' },
        ],
      },
      {
        title: 'Tool calls per run',
        format: (v: number) => formatDecimal(v).replace(/\.0$/, ''),
        segments: present.map(cat => ({
          name: cat.label,
          color: () => c.resolve(cat.token),
          value: rs => mean(rs.map(r => r.metrics.tool_mix[cat.id] ?? 0)) ?? 0,
        })),
        legend: present.map(cat => ({ label: cat.label, swatchClassName: cat.className })),
      },
      {
        title: 'Game actions per run',
        format: (v: number) => formatInt(v),
        segments: [
          {
            name: 'Done',
            color: () => withAlpha(c.foreground, 0.4),
            value: rs => mean(rs.map(r => (r.metrics.sdk_actions ?? 0) - (r.metrics.sdk_failed ?? 0))) ?? 0,
          },
          { name: 'Failed', color: () => c.danger, value: rs => mean(rs.map(r => r.metrics.sdk_failed ?? 0)) ?? 0 },
        ],
        legend: [
          { label: 'Done', swatchClassName: 'bg-foreground-40' },
          { label: 'Failed', swatchClassName: 'bg-danger' },
        ],
      },
    ];
  }, [c, groups, runs]);

  return (
    <Card
      title="Time and effort"
      subtitle="Mean per run"
      actions={
        <ParamSegmented
          param="by"
          value={by}
          label="Group by"
          options={[
            { value: 'variant', label: 'Variant' },
            { value: 'model', label: 'Model' },
            { value: 'agent', label: 'Agent' },
          ]}
        />
      }
    >
      <div ref={ref} className={wide ? 'grid grid-cols-[1.3fr_1fr_1fr] gap-6' : 'flex flex-col gap-6'}>
        {width > 0 &&
          specs.map((spec, i) => (
            <Panel key={spec.title} groups={groups} spec={spec} showLabels={!wide || i === 0} labelRoom={labelRoom} marks={marks} />
          ))}
      </div>
    </Card>
  );
}
