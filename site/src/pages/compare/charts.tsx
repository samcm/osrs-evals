/** /compare's charts: every run as a point with its group's median, and the tool-call mix. */

import { useMemo, type JSX } from 'react';
import { useNavigate } from '@tanstack/react-router';
import {
  ChartFrame,
  KeyLegend,
  logAxis,
  SeriesLabel,
  XYChart,
  type AxisSpec,
  type ChartPoints,
  type LegendItem,
} from '@/components/Charts';
import type { Eval, Run, ToolCategory } from '@/data/types';
import { agentSeries, modelSeries, toolSeries, variantSeries, type SeriesSpec } from '@/lib/chartSeries';
import { formatPercent } from '@/lib/format';
import { useHover } from '@/lib/hover';
import type { SeriesColor } from '@/lib/series';
import type { LegendState } from '@/lib/legend';
import { roundCeil, roundTicks } from '@/lib/ticks';
import { TOOL_CATEGORIES } from '@/lib/tools';
import { useWidth } from '@/lib/useWidth';
import { GroupLabel } from './GroupLabel';
import { groupName, type GroupBy } from './groups';
import type { Metric } from './metrics';

export interface RankedGroup {
  key: string;
  sample: Run;
  /** Runs with a value, and the value */
  points: { run: Run; value: number }[];
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

/** Room for group labels left of the plot: a pairing's model and level, or one name. */
const LABEL_WIDTH = { pairing: 200, wide: 148, narrow: 112 };
const labelWidthFor = (by: GroupBy, narrow: boolean): number =>
  narrow ? LABEL_WIDTH.narrow : by === 'variant' ? LABEL_WIDTH.pairing : LABEL_WIDTH.wide;

/** Below this width a pairing's level goes under its model, so the label keeps its name. */
const NARROW = 520;

/** Harness keys are shapes in the text colour: colour belongs to models. */
const SHAPE_KEY_COLOR: SeriesColor = {
  token: '--foreground',
  swatchClassName: 'bg-foreground',
  borderClassName: 'border-foreground',
  fillClassName: 'fill-foreground',
};

/** Each row's median: a tick across the row in the text colour, never faded with the runs. */
const MEDIAN: SeriesSpec = {
  id: 'median',
  key: 'median',
  label: 'Median',
  name: 'Median',
  color: 'var(--color-foreground)',
  swatch: SHAPE_KEY_COLOR,
  line: 'solid',
  symbol: 'rect',
};

/** Unique by `key`, in first-seen order. */
const uniqueBy = <T,>(items: T[], key: (item: T) => string): T[] => [
  ...new Map(items.map(item => [key(item), item])).values(),
];

/**
 * Every run as a point on the metric, a group per row (ranked, best at the top), with the group's
 * median as a tick and its value at the row's right end: the chart is its own ranking. Points take
 * their model's colour and their harness's shape; the legend keys each once and hides or isolates
 * them through `legend` (the page drops hidden runs from `groups`).
 */
export function StripChart({
  groups,
  keyed,
  metric,
  by,
  log,
  evals,
  legend,
}: {
  groups: RankedGroup[];
  /** Every run with a value, hidden or not: the legend keys their models and harnesses */
  keyed: Run[];
  metric: Metric;
  by: GroupBy;
  log: boolean;
  /** When runs pool several evals: each point's tooltip names its eval */
  evals?: Eval[];
  legend: LegendState;
}): JSX.Element {
  const navigate = useNavigate();
  const hover = useHover();
  const [ref, width] = useWidth();
  const narrow = width > 0 && width < NARROW;
  const titles = useMemo(() => new Map((evals ?? []).map(e => [e.id, e.title])), [evals]);

  // One scatter per pairing: its model's colour (its level's lightness), its harness' shape
  const scatters = useMemo(() => {
    const byKey = new Map<string, ChartPoints>();
    groups.forEach((g, i) =>
      g.points.forEach(p => {
        const series = variantSeries(p.run);
        const entry = byKey.get(series.key) ?? { series, points: [], size: 9 };
        entry.points.push({ x: p.value, y: i + jitter(p.run.id) * 0.22, key: p.run.id, data: p.run });
        byKey.set(series.key, entry);
      })
    );
    return [...byKey.values()];
  }, [groups]);
  const medians: ChartPoints = {
    series: MEDIAN,
    size: [2, 24],
    points: groups.map((g, i) => ({ x: g.median, y: i, key: g.key, data: g })),
  };

  // A hovered legend key names a model or a harness: every pairing of it lights; the medians never fade
  const lit = useMemo(() => {
    if (hover.id == null || hover.id === MEDIAN.id) return null;
    const runs = groups.flatMap(g => g.points.map(p => p.run));
    const ids = runs.some(r => r.model === hover.id || r.agent === hover.id)
      ? uniqueBy(
          runs.filter(r => r.model === hover.id || r.agent === hover.id),
          r => variantSeries(r).id
        ).map(r => variantSeries(r).id)
      : [hover.id];
    return [...ids, MEDIAN.id];
  }, [hover.id, groups]);

  const legendItems = useMemo<LegendItem[]>(() => {
    const models = uniqueBy(keyed, r => r.model)
      .map(r => modelSeries(r.model))
      .sort((a, b) => a.name.localeCompare(b.name));
    const agents = uniqueBy(keyed, r => r.agent)
      .map(r => agentSeries(r.agent, r.agent_name))
      .sort((a, b) => a.name.localeCompare(b.name));
    // What the rows' labels already name needs no key: models when each row is a model or a pairing,
    // harnesses when each row is a harness
    return [
      { label: 'Median', swatchClassName: 'bg-foreground' },
      ...(by === 'model' || by === 'variant'
        ? []
        : models.map(s => ({
            id: s.id,
            name: s.name,
            label: null,
            mark: <SeriesLabel series={s} size={14} />,
            color: s.swatch,
          }))),
      ...(by === 'agent'
        ? []
        : agents.map(s => ({
            id: s.id,
            name: s.name,
            label: null,
            mark: <SeriesLabel series={s} size={14} />,
            color: SHAPE_KEY_COLOR,
            symbol: s.symbol,
          }))),
    ];
  }, [keyed, by]);

  // A key is lit while any of its runs is drawn: isolating a harness keeps lit the models it ran
  const keyLegend = useMemo<LegendState>(() => {
    const drawn = new Set(groups.flatMap(g => g.points.flatMap(p => [p.run.model, p.run.agent])));
    return { ...legend, visible: id => drawn.has(id) };
  }, [groups, legend]);

  const values = groups.flatMap(g => g.points.map(p => p.value));
  const tick = metric.tick ?? metric.format;
  const integer = metric.whole ?? false;
  const max = roundCeil(Math.max(...values, 0), 5, integer);
  const x: AxisSpec = (log && logAxis(values, tick)) || {
    domain: [0, max],
    ticks: roundTicks(max, 5, integer),
    format: tick,
  };

  return (
    <div ref={ref}>
      <ChartFrame
        rows={Math.max(groups.length, 2)}
        empty={groups.length === 0 ? 'Every run here is hidden.' : undefined}
        legend={<KeyLegend legend={keyLegend} items={legendItems} />}
      >
        <XYChart
          x={{ ...x, formatValue: metric.format }}
          rows={groups.map(g => ({
            key: g.key,
            label: <GroupLabel sample={g.sample} by={by} size={14} stacked={narrow} />,
            value: metric.format(g.median),
          }))}
          rowLabelWidth={labelWidthFor(by, narrow)}
          points={[...scatters, medians]}
          lit={lit}
          pointTooltip={(point, series) => {
            if (series.id === MEDIAN.id) {
              const g = point.data as RankedGroup;
              return {
                title: groupName(g.sample, by),
                rows: [
                  { label: 'Median', value: metric.format(g.median) },
                  { label: 'Runs', value: String(g.points.length) },
                ],
              };
            }
            const run = point.data as Run;
            return {
              title: evals ? (titles.get(run.eval) ?? run.eval) : undefined,
              rows: [{ series, value: metric.format(point.x) }],
            };
          }}
          onPointClick={(point, series) =>
            series.id !== MEDIAN.id && navigate({ to: '/runs/$runId', params: { runId: (point.data as Run).id } })
          }
        />
      </ChartFrame>
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
export function ToolMixChart({ groups, by }: { groups: MixGroup[]; by: GroupBy }): JSX.Element {
  const [ref, width] = useWidth();
  const narrow = width > 0 && width < NARROW;
  const used = TOOL_CATEGORIES.filter(c => groups.some(g => g.counts.get(c.id)));
  const series = used.map(c => toolSeries(c.id as ToolCategory));
  const share = (g: MixGroup, s: SeriesSpec): number => (g.counts.get(s.id) ?? 0) / g.total;

  return (
    <div ref={ref}>
      <ChartFrame
        rows={groups.length}
        legend={<KeyLegend items={series.map(s => ({ label: s.label, color: s.swatch }))} />}
      >
        <XYChart
          x={{ domain: [0, 1], ticks: [0, 0.25, 0.5, 0.75, 1], format: v => formatPercent(v) }}
          rows={groups.map(g => ({
            key: g.key,
            label: <GroupLabel sample={g.sample} by={by} size={14} stacked={narrow} />,
          }))}
          rowLabelWidth={labelWidthFor(by, narrow)}
          bars={series.map(s => ({ series: s, values: groups.map((g, row) => ({ row, value: share(g, s) })) }))}
          // The whole row's mix, the kind under the pointer in bold
          barTooltip={({ row }) => {
            const g = groups[row];
            return {
              title: groupName(g.sample, by),
              rows: series.filter(s => g.counts.get(s.id)).map(s => ({ series: s, value: formatPercent(share(g, s)) })),
            };
          }}
        />
      </ChartFrame>
    </div>
  );
}
