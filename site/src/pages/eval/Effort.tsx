/** How time and effort were spent, per variant, model or agent: model time against tool time, the tool-call mix, game actions that failed. */

import { useMemo } from 'react';
import { Bar, BarChart, CartesianGrid, Cell, XAxis, YAxis } from 'recharts';
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ChartContainer, ChartTooltip, type ChartConfig } from '@/components/ui/chart';
import { ParamSegmented } from '@/components/bits';
import { KeyLegend, SeriesLabel, SeriesTooltip, gridProps, xAxisProps, type LegendItem } from '@/components/charts';
import type { Run } from '@/data/types';
import { cssColor, seriesKey, toolSeries, type SeriesSpec } from '@/lib/chartSeries';
import { formatClock, formatInt } from '@/lib/format';
import { mean } from '@/lib/stats';
import { SDK_OUTCOMES } from '@/lib/tokens';
import { TOOL_CATEGORIES } from '@/lib/tools';
import { useWidth } from '@/lib/useWidth';
import { formatTick, labelWidth, roundMax, roundTicks, type Measure } from './chartBits';
import { groupRuns, type Group, type GroupBy } from './model';

const ROW = 36;

/** A segment that has no series of its own (model time, tool time …): a colour and a name. */
function segment(id: string, label: string, color: string): SeriesSpec {
  const swatch = { token: '', swatchClassName: '', borderClassName: '', fillClassName: '' };
  return { id, key: seriesKey(id), label, name: label, color, swatch, line: 'solid', symbol: 'circle' };
}

interface Panel {
  title: string;
  measure: Measure;
  segments: { spec: SeriesSpec; value: (runs: Run[]) => number }[];
  /** The model-time segment takes each group's own colour */
  byGroup?: string;
  legend: LegendItem[];
}

const neutral = 'var(--muted-foreground)';

function panels(runs: Run[], groups: Group[]): Panel[] {
  const present = TOOL_CATEGORIES.filter(cat => runs.some(r => (r.metrics.tool_mix[cat.id] ?? 0) > 0));
  const coloured = [...new Map(groups.filter(g => g.spec.vendor || g.spec.sprite).map(g => [g.spec.swatch.token, g.spec.swatch])).values()];
  return [
    {
      title: 'Time per run',
      measure: 'seconds',
      byGroup: 'model',
      segments: [
        { spec: segment('model', 'Model', neutral), value: rs => mean(rs.map(r => r.model_seconds)) ?? 0 },
        {
          spec: segment('tools', 'Tools', 'color-mix(in oklab, var(--muted-foreground) 45%, transparent)'),
          value: rs => mean(rs.map(r => r.metrics.tool_seconds)) ?? 0,
        },
        {
          spec: segment('other', 'Other', 'color-mix(in oklab, var(--muted-foreground) 18%, transparent)'),
          value: rs => mean(rs.map(r => Math.max(0, (r.game_seconds ?? 0) - r.model_seconds - r.metrics.tool_seconds))) ?? 0,
        },
      ],
      legend: [
        coloured.length ? { label: 'Model', colors: coloured } : { label: 'Model', swatchClassName: 'bg-muted-foreground' },
        { label: 'Tools', swatchClassName: 'bg-muted-foreground/45' },
        { label: 'Other', swatchClassName: 'bg-muted-foreground/20' },
      ],
    },
    {
      title: 'Tool calls per run',
      measure: 'count',
      segments: present.map(cat => ({ spec: toolSeries(cat.id), value: rs => mean(rs.map(r => r.metrics.tool_mix[cat.id] ?? 0)) ?? 0 })),
      legend: present.map(cat => ({ label: cat.label, color: cat.color })),
    },
    {
      title: 'Game actions per run',
      measure: 'count',
      segments: [
        {
          spec: segment('ok', SDK_OUTCOMES.ok.label, cssColor(SDK_OUTCOMES.ok.color)),
          value: rs => mean(rs.map(r => (r.metrics.sdk_actions ?? 0) - (r.metrics.sdk_failed ?? 0))) ?? 0,
        },
        {
          spec: segment('failed', SDK_OUTCOMES.failed.label, cssColor(SDK_OUTCOMES.failed.color)),
          value: rs => mean(rs.map(r => r.metrics.sdk_failed ?? 0)) ?? 0,
        },
      ],
      legend: [
        { label: SDK_OUTCOMES.ok.label, color: SDK_OUTCOMES.ok.color },
        { label: SDK_OUTCOMES.failed.label, color: SDK_OUTCOMES.failed.color },
      ],
    },
  ];
}

/** A group's label as a y-axis tick: its marks, short name and harness badge. */
function GroupTick({
  x,
  y,
  payload,
  groups,
  width,
}: {
  x?: number;
  y?: number;
  payload?: { value: string };
  groups: Group[];
  width: number;
}) {
  const g = groups.find(q => q.spec.key === payload?.value);
  if (!g || x == null || y == null) return null;
  return (
    <foreignObject x={x - width} y={y - 11} width={width - 4} height={22}>
      <div className="flex h-full items-center justify-end text-xs text-foreground">
        <SeriesLabel series={g.spec} size={14} />
      </div>
    </foreignObject>
  );
}

function PanelChart({ panel, groups, labels, labelRoom }: { panel: Panel; groups: Group[]; labels: boolean; labelRoom: number }) {
  const rows = useMemo(
    () => groups.map(g => Object.fromEntries([['group', g.spec.key], ...panel.segments.map(s => [s.spec.key, s.value(g.runs)])])),
    [groups, panel]
  );
  const total = Math.max(1, ...rows.map(r => panel.segments.reduce((sum, s) => sum + (r[s.spec.key] as number), 0)));
  const max = roundMax(total, panel.measure);
  const config: ChartConfig = Object.fromEntries(panel.segments.map(s => [s.spec.key, { label: s.spec.label, color: s.spec.color }]));
  const colorOf = (g: Group | undefined) => (g?.spec.vendor || g?.spec.sprite ? g.spec.color : neutral);
  const format = panel.measure === 'seconds' ? formatClock : formatInt;
  return (
    <div className="flex min-w-0 flex-col">
      <h3 className="text-sm text-muted-foreground">{panel.title}</h3>
      <ChartContainer config={config} className="aspect-auto w-full" style={{ height: groups.length * ROW + 32 }}>
        <BarChart data={rows} layout="vertical" margin={{ top: 4, right: 12, bottom: 0, left: labels ? 0 : 12 }} barCategoryGap={8}>
          <CartesianGrid {...gridProps} vertical horizontal={false} />
          <XAxis {...xAxisProps({ domain: [0, max], ticks: roundTicks(max, panel.measure), format: v => formatTick(v, panel.measure) })} />
          <YAxis
            type="category"
            dataKey="group"
            width={labels ? labelRoom : 0}
            hide={!labels}
            axisLine={false}
            tickLine={false}
            interval={0}
            tick={<GroupTick groups={groups} width={labelRoom} />}
          />
          <ChartTooltip
            cursor={{ fill: 'var(--muted)', opacity: 0.6 }}
            content={({ active, payload, label }) => {
              const g = groups.find(q => q.spec.key === label);
              if (!g) return null;
              const series = panel.segments.map(s => (panel.byGroup === s.spec.id ? { ...s.spec, color: colorOf(g) } : s.spec));
              return (
                <SeriesTooltip
                  active={active}
                  payload={payload}
                  label={g.spec.name}
                  series={series}
                  sort="none"
                  labelFormat={() => <SeriesLabel series={g.spec} />}
                  format={v => format(v)}
                />
              );
            }}
          />
          {panel.segments.map((s, i) => (
            <Bar
              key={s.spec.key}
              dataKey={s.spec.key}
              stackId="a"
              fill={s.spec.color}
              isAnimationActive={false}
              radius={i === panel.segments.length - 1 ? [0, 4, 4, 0] : 0}
            >
              {panel.byGroup === s.spec.id && groups.map(g => <Cell key={g.spec.key} fill={colorOf(g)} />)}
            </Bar>
          ))}
        </BarChart>
      </ChartContainer>
      <KeyLegend items={panel.legend} />
    </div>
  );
}

export function EffortCard({ runs, by }: { runs: Run[]; by: GroupBy }) {
  const [ref, width] = useWidth();
  const groups = useMemo(() => groupRuns(runs, by), [runs, by]);
  const wide = width >= 960;
  const labelRoom = Math.max(...groups.map(g => labelWidth(g.spec.label) + (g.spec.harness ? g.spec.harness.length * 7 + 26 : 0) + 8), 48);
  const specs = useMemo(() => panels(runs, groups), [runs, groups]);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Time and effort</CardTitle>
        <CardDescription>Mean per run</CardDescription>
        <CardAction>
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
        </CardAction>
      </CardHeader>
      <CardContent ref={ref} className={wide ? 'grid grid-cols-[1.4fr_1fr_1fr] gap-6' : 'flex flex-col gap-6'}>
        {width > 0 &&
          specs.map((panel, i) => (
            <PanelChart key={panel.title} panel={panel} groups={groups} labels={!wide || i === 0} labelRoom={labelRoom} />
          ))}
      </CardContent>
    </Card>
  );
}
