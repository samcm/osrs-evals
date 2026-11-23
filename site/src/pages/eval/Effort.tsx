/**
 * How the runs went about it, per pairing, model or harness: each measure as one dot per run with
 * the group's median marked (so a spread or an outlier shows), and the mix of tool calls each group
 * made. Rows run in the leaderboard's order (a model or harness at its best pairing's place), so
 * what the winners did reads down the top. A narrow card shows one measure at a time (`?measure=`).
 */

import { useMemo, type JSX } from 'react';
import { useNavigate } from '@tanstack/react-router';
import {
  ChartFrame,
  KeyLegend,
  SeriesLabel,
  XYChart,
  Y_AXIS_WIDTH,
  type ChartPoints,
  type ChartRow,
} from '@/components/Charts';
import type { Run } from '@/data/types';
import { extraLabelWidth, toolSeries, type SeriesSpec } from '@/lib/chartSeries';
import { useLit } from './lit';
import { median } from '@/lib/stats';
import { TOOL_CATEGORIES } from '@/lib/tools';
import { useWidth } from '@/lib/useWidth';
import { SelectField } from '@/components/SelectField';
import { levelName, variantKey } from '@/lib/series';
import { formatTick, formatX, labelWidth, roundMax, roundTicks, type Measure } from './chartBits';
import { groupRuns, type Group, type GroupBy, type RankedVariant, type StripMeasure } from '@/pages/eval/model';

interface Column {
  id: StripMeasure;
  title: string;
  measure: Measure;
  value: (run: Run) => number | null;
}

const COLUMNS: Column[] = [
  { id: 'calls', title: 'Model calls', measure: 'count', value: r => (r.model_calls > 0 ? r.model_calls : null) },
  { id: 'waiting', title: 'Waiting on the model', measure: 'share', value: r => r.metrics.model_share },
  { id: 'actions', title: 'Game actions', measure: 'count', value: r => r.metrics.sdk_actions },
  {
    id: 'failed',
    title: 'Game actions failed',
    measure: 'share',
    value: r => (r.metrics.sdk_actions ? (r.metrics.sdk_failed ?? 0) / r.metrics.sdk_actions : null),
  },
  // How it worked, as site/summarize.py measured it from the logs
  { id: 'helpers', title: 'Helper agents', measure: 'count', value: r => r.facts?.subagents ?? null },
  { id: 'deaths', title: 'Deaths', measure: 'count', value: r => r.facts?.deaths ?? null },
  {
    id: 'first_score',
    title: 'Time to first score',
    measure: 'seconds',
    value: r => (r.facts?.first_score_minutes != null ? r.facts.first_score_minutes * 60 : null),
  },
  {
    id: 'source_reads',
    title: 'Reads of the server source',
    measure: 'count',
    value: r => r.facts?.server_source_reads ?? null,
  },
];

/** The groups as the chart's rows: each one's marks, short name and thinking level, or none in a column beside the labels. */
const rowsOf = (groups: Group[], labels: boolean): ChartRow[] =>
  groups.map(g => ({ key: g.spec.key, label: labels ? <SeriesLabel series={g.spec} size={14} /> : null }));

/** The plot's left edge when another column holds the labels: room for the first tick's label. */
const NO_LABELS = 12;

/** Each group's median: a tick across its row in the text colour, never faded with the runs (as /compare's strips). */
const MEDIAN: SeriesSpec = {
  id: 'median',
  key: 'median',
  label: 'Median',
  name: 'Median',
  color: 'var(--color-foreground)',
  swatch: {
    token: '--color-foreground',
    swatchClassName: 'bg-foreground',
    borderClassName: 'border-foreground',
    fillClassName: 'fill-foreground',
  },
  line: 'solid',
  symbol: 'rect',
};

function Strip({
  column,
  groups,
  labels,
  labelRoom,
  lit,
  titled = true,
}: {
  column: Column;
  groups: Group[];
  labels: boolean;
  labelRoom: number;
  lit: string | null;
  titled?: boolean;
}): JSX.Element {
  const navigate = useNavigate();
  const { dots, medians, max } = useMemo(() => {
    const dots = groups.map(
      (g, row): ChartPoints => ({
        series: g.spec,
        points: g.runs.flatMap((run, i) => {
          const v = column.value(run);
          // A little vertical spread by epoch, so runs with the same value don't hide each other
          return v == null ? [] : [{ x: v, y: row + ((i % 5) - 2) * 0.1, key: run.id, data: run }];
        }),
      })
    );
    const medians: ChartPoints = {
      series: MEDIAN,
      size: [2, 16],
      points: groups.flatMap((g, row) => {
        const m = median(g.runs.map(column.value));
        return m == null ? [] : [{ x: m, y: row, key: g.spec.key, data: g }];
      }),
    };
    const top = Math.max(0, ...dots.flatMap(d => d.points.map(p => p.x)));
    return { dots, medians, max: column.measure === 'share' ? 1 : roundMax(Math.max(1, top)) };
  }, [column, groups]);
  const ticks = column.measure === 'share' ? [0, 0.5, 1] : roundTicks(max, column.measure, 3);

  return (
    <div className="flex min-w-0 flex-col gap-2">
      {titled && (
        <h3 className="text-sm text-muted" style={{ paddingLeft: labels ? labelRoom : NO_LABELS }}>
          {column.title}
        </h3>
      )}
      <ChartFrame rows={groups.length}>
        <XYChart
          rows={rowsOf(groups, labels)}
          rowLabelWidth={labels ? labelRoom : NO_LABELS}
          x={{ domain: [0, max], ticks, format: v => formatTick(v, column.measure) }}
          points={[...dots, medians]}
          // The medians stay at full strength while a pairing is lit
          lit={lit == null ? null : [lit, MEDIAN.id]}
          pointTooltip={(point, spec) =>
            spec.id === MEDIAN.id
              ? {
                  title: 'Median',
                  rows: [{ series: (point.data as Group).spec, value: formatX(point.x, column.measure) }],
                }
              : {
                  title: `Epoch ${(point.data as Run).epoch}`,
                  rows: [{ series: spec, value: formatX(point.x, column.measure) }],
                }
          }
          onPointClick={(point, spec) =>
            spec.id !== MEDIAN.id &&
            point.key &&
            navigate({ to: '/runs/$runId', params: { runId: point.key }, search: {} as never })
          }
        />
      </ChartFrame>
    </div>
  );
}

/** The groups in the leaderboard's order: a pairing at its place, a model or harness at its best pairing's. */
function useGroups(runs: Run[], by: GroupBy, ranked: RankedVariant[]): Group[] {
  return useMemo(() => {
    const place = new Map(ranked.map((r, i) => [r.variant.key, i]));
    const best = (g: Group): number => Math.min(...g.runs.map(r => place.get(variantKey(r)) ?? Infinity));
    return groupRuns(runs, by).sort((a, b) => best(a) - best(b));
  }, [runs, by, ranked]);
}
/** The row labels' gutter: the widest label (mark, short name, thinking level, harness mark), at least the y axis width. */
const roomFor = (groups: Group[]): number =>
  Math.max(Y_AXIS_WIDTH, ...groups.map(g => labelWidth(g.spec.label) + extraLabelWidth(g.spec) + 8));

export function EffortStrips({
  runs,
  by,
  ranked,
  focus,
  measure,
  onMeasure,
}: {
  runs: Run[];
  by: GroupBy;
  ranked: RankedVariant[];
  focus?: string;
  /** The one measure a narrow card shows */
  measure: StripMeasure;
  onMeasure: (measure: StripMeasure) => void;
}): JSX.Element {
  const [ref, width] = useWidth();
  const groups = useGroups(runs, by, ranked);
  const lit = useLit(focus);
  const wide = width >= 900;
  const labelRoom = roomFor(groups);
  return (
    <div
      ref={ref}
      className={wide ? 'grid gap-6' : 'flex flex-col gap-3'}
      // Wide, the first column also holds the labels, so every column's plot is the same width
      style={
        wide
          ? {
              gridTemplateColumns: `calc(${labelRoom}px + (100% - ${labelRoom}px - 4.5rem) / 4) repeat(3, minmax(0, 1fr))`,
            }
          : undefined
      }
    >
      {width > 0 &&
        (wide ? (
          // Four to a row, each row's first column holding the labels
          COLUMNS.map((column, i) => (
            <Strip
              key={column.id}
              column={column}
              groups={groups}
              labels={i % 4 === 0}
              labelRoom={labelRoom}
              lit={lit}
            />
          ))
        ) : (
          <>
            <SelectField
              label="Measure"
              hideLabel
              value={measure}
              options={COLUMNS.map(c => ({ value: c.id, label: c.title }))}
              onChange={v => v && onMeasure(v as StripMeasure)}
            />
            <Strip
              column={COLUMNS.find(c => c.id === measure)!}
              groups={groups}
              labels
              labelRoom={labelRoom}
              lit={lit}
              titled={false}
            />
          </>
        ))}
    </div>
  );
}

/** A group's name as a tooltip's title: its short name and thinking level, "Opus 5.5 high". */
const titleOf = (spec: SeriesSpec): string =>
  spec.thinking ? `${spec.label} ${levelName(spec.thinking)}` : spec.label;

/** What each group's tool calls were for, as shares of its calls. */
export function ToolMix({ runs, by, ranked }: { runs: Run[]; by: GroupBy; ranked: RankedVariant[] }): JSX.Element {
  const groups = useGroups(runs, by, ranked);
  const labelRoom = roomFor(groups);
  const present = TOOL_CATEGORIES.filter(cat => runs.some(r => (r.metrics.tool_mix[cat.id] ?? 0) > 0));
  // Each group's share of its calls in each category, one stacked bar per row
  const shares = groups.map(g => {
    const counts = present.map(cat => g.runs.reduce((sum, r) => sum + (r.metrics.tool_mix[cat.id] ?? 0), 0));
    const total = counts.reduce((a, b) => a + b, 0) || 1;
    return counts.map(c => c / total);
  });
  const series = present.map(cat => toolSeries(cat.id));
  return (
    <ChartFrame
      rows={groups.length}
      legend={<KeyLegend items={present.map(cat => ({ label: cat.label, color: cat.color }))} />}
    >
      <XYChart
        rows={rowsOf(groups, true)}
        rowLabelWidth={labelRoom}
        x={{ domain: [0, 1], ticks: [0, 0.25, 0.5, 0.75, 1], format: v => formatX(v, 'share') }}
        bars={series.map((s, j) => ({ series: s, values: shares.map((row, i) => ({ row: i, value: row[j] })) }))}
        // Pointing at a bar lights its category; the pairings stay as they are
        barTooltip={bar => ({
          title: titleOf(groups[bar.row].spec),
          rows: series.map((s, j) => ({ series: s, value: formatX(shares[bar.row][j], 'share') })),
        })}
      />
    </ChartFrame>
  );
}
