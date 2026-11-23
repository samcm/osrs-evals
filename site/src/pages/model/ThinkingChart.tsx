/**
 * How a measure changes with thinking level, for one model: the thinking levels along x, lowest
 * first, each run a point (its harness's shape, its level's lightness of the model's colour) and each
 * harness a line through its median at each level. A point opens its run; pointing at one lights its
 * pairing across the page.
 */

import { useMemo, type JSX } from 'react';
import { useNavigate } from '@tanstack/react-router';
import {
  ChartFrame,
  chartGrid,
  logAxis,
  SeriesLegend,
  XYChart,
  type AxisSpec,
  type ChartLine,
  type ChartPoints,
} from '@/components/Charts';
import type { Run } from '@/data/types';
import { variantSeries, type SeriesSpec } from '@/lib/chartSeries';
import { formatInt } from '@/lib/format';
import { useHover } from '@/lib/hover';
import { levelName } from '@/lib/series';
import { median } from '@/lib/stats';
import { useWidth } from '@/lib/useWidth';
import type { ThinkingMeasure } from '@/pages/model/measures';
import { formatTick, roundMax, roundTicks } from '@/pages/eval/chartBits';

/** Short names for the level labels when the full ones don't fit; the tooltip names the level in full. */
const SHORT: Record<string, string> = { none: 'none', minimal: 'min', medium: 'med', xhigh: 'xhi' };
/** text-xs at about 6.6px a character, plus a gap between neighbours */
const labelPx = (text: string): number => text.length * 6.6 + 8;

/** The level labels in full when each fits the width its level has, else shortened. */
function levelLabels(levels: string[], width: number): string[] {
  const grid = chartGrid();
  const each = (width - grid.left - grid.right) / Math.max(1, levels.length);
  const names = levels.map(levelName);
  return Math.max(...names.map(labelPx)) <= each ? names : levels.map(l => SHORT[l] ?? l);
}

export function ThinkingChart({
  runs,
  measure,
  levels,
  series,
  evalOf,
}: {
  runs: Run[];
  measure: ThinkingMeasure;
  levels: string[];
  /** Each harness of the runs (`harnessSeries`): its median line and its legend key */
  series: SeriesSpec[];
  /** Name each point's eval in its tooltip, for a chart across evals */
  evalOf?: (run: Run) => string;
}): JSX.Element {
  const navigate = useNavigate();
  const [ref, width] = useWidth();
  const hover = useHover();
  const { points, lines, pairings } = useMemo(() => {
    const points: ChartPoints[] = [];
    const lines: ChartLine[] = [];
    /** Each harness's pairings (one per level), by the harness' id */
    const pairings = new Map<string, Set<string>>();
    series.forEach((spec, h) => {
      // Harnesses side by side at each level, so their points don't hide each other
      const offset = (h - (series.length - 1) / 2) * 0.12;
      const own = runs.filter(r => r.agent === spec.id);
      const line: [number, number][] = [];
      const ownPairings = new Set<string>();
      pairings.set(spec.id, ownPairings);
      levels.forEach((level, i) => {
        const at = own.filter(r => r.thinking === level);
        const values = at.flatMap(run => {
          const v = measure.value(run);
          return v == null ? [] : [{ x: i + offset, y: v, key: run.id, data: run }];
        });
        // Each level's runs are their pairing: its level's lightness, hovered with its table rows
        if (values.length > 0) {
          const pairing = variantSeries(at[0]);
          points.push({ series: pairing, points: values });
          ownPairings.add(pairing.id);
        }
        const m = median(values.map(p => p.y));
        if (m != null) line.push([i + offset, m]);
      });
      lines.push({ series: spec, points: line, step: false, width: 1.5 });
    });
    return { points, lines, pairings };
  }, [runs, measure, levels, series]);
  // A harness's median belongs to the harness, not to one pairing: it stays lit while one of its
  // pairings is hovered, so it takes the hovered id
  const litLines = lines.map(line =>
    hover.id != null && line.series && pairings.get(line.series.id)?.has(hover.id)
      ? { ...line, series: { ...line.series, id: hover.id } }
      : line
  );

  const values = points.flatMap(group => group.points.map(p => p.y));
  const kind = measure.ticks ? 'ticks' : 'count';
  const max = measure.max ?? roundMax(Math.max(1, ...values), kind);
  const y: AxisSpec | null = measure.log
    ? logAxis(values)
    : {
        domain: [0, max],
        ticks: roundTicks(max, kind),
        format: v => (measure.ticks ? formatTick(v, 'ticks') : formatInt(v)),
      };
  const labels = levelLabels(levels, width);

  return (
    <div ref={ref} className="min-w-0">
      <ChartFrame
        height="compact"
        empty={values.length === 0 || y == null ? measure.empty : undefined}
        legend={<SeriesLegend series={series} kind="symbol" />}
      >
        <XYChart
          x={{
            domain: [-0.5, levels.length - 0.5],
            ticks: levels.map((_, i) => i),
            // Every level named: they are the chart's categories
            format: i => labels[Math.round(i)] ?? '',
          }}
          y={y ?? undefined}
          lines={litLines}
          points={points}
          pointTooltip={(point, spec) => {
            const run = point.data as Run;
            return {
              title: evalOf?.(run),
              rows: [
                { series: spec, value: measure.format(point.y) },
                { label: 'Epoch', value: formatInt(run.epoch) },
              ],
            };
          }}
          onPointClick={point =>
            navigate({ to: '/runs/$runId', params: { runId: (point.data as Run).id }, search: {} as never })
          }
        />
      </ChartFrame>
    </div>
  );
}
