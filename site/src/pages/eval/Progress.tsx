/** The page's answer: every run's progress over time, coloured by model, beside the variants ranked. */

import { useMemo, useState, type ReactNode } from 'react';
import { Link, useNavigate } from '@tanstack/react-router';
import type { EChartsOption } from 'echarts';
import clsx from 'clsx';
import { Chart } from '@/components/Chart';
import { AgentLabel, ModelLabel } from '@/components/marks';
import type { Eval, Run } from '@/data/types';
import { crosshairTooltip, tooltipRow, tooltipTitle } from '@/lib/chartChrome';
import { layoutEndLabels, markRich, markText, useBrandImages } from '@/lib/chartKit';
import { formatClock, formatCost, formatInt } from '@/lib/format';
import type { LegendState } from '@/lib/legend';
import { median } from '@/lib/stats';
import { useThemeColors } from '@/lib/theme';
import { useWidth } from '@/lib/useWidth';
import { LINE_TYPE, NARROW, formatX, labelWidth, variantShortText, variantSlugs, xAxisFor, yAxisFor } from './chartBits';
import {
  aggregate,
  hasX,
  niceMax,
  resultValue,
  valueAt,
  xOf,
  type Agg,
  type RankedVariant,
  type RunCurve,
  type XMeasure,
  type XRange,
} from './model';

const HEIGHT = 340;
const GRID_TOP = 28;
const GRID_BOTTOM = 28;
export const GRID_LEFT = 44;

/** Grid sides of the progress chart, for charts that share its crosshair. */
export interface ProgressGrid {
  left: number;
  right: number;
  range: XRange;
}

export function ProgressChart({
  e,
  curves,
  ranked,
  x,
  agg,
  range,
  legend,
  pending,
  below,
}: {
  e: Eval;
  curves: RunCurve[];
  ranked: RankedVariant[];
  x: XMeasure;
  agg: Agg;
  range: XRange;
  legend: LegendState;
  /** The x measure's data is still loading */
  pending: boolean;
  /** A chart under this one that shares its x, given where the crosshair is */
  below?: (grid: ProgressGrid, hover: number | null) => ReactNode;
}) {
  const c = useThemeColors();
  const navigate = useNavigate();
  const [ref, width] = useWidth();
  const narrow = width > 0 && width < NARROW;
  // Transient: where the crosshair is, for the chart below
  const [hover, setHover] = useState<number | null>(null);
  const marks = useBrandImages(
    ranked.flatMap(r => variantSlugs(r.variant)),
    c.foreground,
    14
  );

  const target = e.target;
  const drawn = useMemo(() => curves.filter(cv => legend.visible(cv.variant.key) && hasX(cv, x)), [curves, legend, x]);
  const missing = ranked.filter(r => legend.visible(r.variant.key) && !curves.some(cv => cv.variant.key === r.variant.key && hasX(cv, x)));

  const yMax = useMemo(() => {
    const top = Math.max(target ?? 0, ...curves.flatMap(cv => cv.points.map(p => p.value)), 1);
    return top <= 10 ? Math.ceil(top) : niceMax(top);
  }, [curves, target]);

  const lines = useMemo(() => {
    const clampX = (v: number): number => Math.min(range.max, Math.max(range.min, v));
    const out: { key: string; id: string; run?: Run; data: [number, number][] }[] = [];
    if (agg === 'runs') {
      for (const cv of drawn) {
        out.push({ key: cv.variant.key, id: cv.run.id, run: cv.run, data: cv.points.map(p => [clampX(xOf(p, x)!), p.value]) });
      }
    } else {
      for (const r of ranked) {
        const mine = drawn.filter(cv => cv.variant.key === r.variant.key);
        if (mine.length === 0) continue;
        out.push({ key: r.variant.key, id: r.variant.key, data: aggregate(mine, x, range, agg).map(([a, v]) => [clampX(a), v]) });
      }
    }
    return out;
  }, [agg, drawn, range, ranked, x]);

  const labels = useMemo(() => {
    if (narrow) return [];
    const ends = new Map<string, number>();
    for (const line of lines) {
      const end = line.data[line.data.length - 1]?.[1] ?? 0;
      ends.set(line.key, Math.max(ends.get(line.key) ?? -Infinity, end));
    }
    const items = ranked
      .filter(r => ends.has(r.variant.key))
      .map((r, i) => ({ id: r.variant.key, value: ends.get(r.variant.key)!, priority: ranked.length - i, variant: r.variant }));
    const offsets = layoutEndLabels(items, { min: 0, max: yMax, height: HEIGHT - GRID_TOP - GRID_BOTTOM, lineHeight: 17 });
    return items.filter(i => offsets.get(i.id) != null).map(i => ({ ...i, dy: offsets.get(i.id)! }));
  }, [lines, narrow, ranked, yMax]);

  const right = narrow
    ? 16
    : Math.max(24, ...labels.map(l => labelWidth(variantSlugs(l.variant).length, variantShortText(l.variant)) + 14));

  const option = useMemo<EChartsOption>(() => {
    const byKey = new Map(ranked.map(r => [r.variant.key, r.variant]));
    const series: object[] = lines.map(line => {
      const v = byKey.get(line.key)!;
      const color = c.resolve(v.color.token);
      return {
        type: 'line',
        id: line.id,
        name: v.short,
        step: 'end',
        data: line.data.map((d, i) =>
          i === line.data.length - 1 ? { value: d, symbol: v.symbol, symbolSize: 7 } : { value: d, symbol: 'none' }
        ),
        showSymbol: true,
        lineStyle: { width: 1.5, type: LINE_TYPE[v.line], color, opacity: agg === 'runs' ? 0.85 : 1 },
        itemStyle: { color },
        triggerEvent: true,
        emphasis: { focus: 'series', lineStyle: { width: 2.5 } },
        blur: { lineStyle: { opacity: 0.2 }, itemStyle: { opacity: 0.2 } },
        z: 3,
      };
    });
    series.push({
      type: 'scatter',
      id: 'labels',
      silent: true,
      symbol: 'circle',
      symbolSize: 1,
      itemStyle: { color: 'transparent' },
      tooltip: { show: false },
      emphasis: { disabled: true },
      blur: { label: { opacity: 1 } },
      data: labels.map(l => ({
        value: [range.max, l.value],
        label: {
          show: true,
          position: 'right',
          distance: 8,
          offset: [0, l.dy],
          formatter: markText(marks, variantSlugs(l.variant), variantShortText(l.variant)),
          color: c.resolve(l.variant.color.token),
          fontSize: 11,
          rich: markRich(marks),
        },
      })),
      z: 4,
    });
    const markLines: object[] = [];
    if (target != null) {
      markLines.push({
        yAxis: target,
        label: { formatter: 'Target', position: 'insideStartTop', color: c.muted, fontSize: 11 },
      });
    }
    if (range.budget != null) {
      markLines.push({
        xAxis: range.budget,
        label: { formatter: 'Budget', position: 'end', align: 'right', padding: [0, 2, 0, 0], color: c.muted, fontSize: 11 },
      });
    }
    series.push({
      type: 'line',
      id: 'guides',
      data: [],
      silent: true,
      emphasis: { disabled: true },
      markLine: {
        silent: true,
        symbol: 'none',
        animation: false,
        blur: { lineStyle: { opacity: 0.7 }, label: { opacity: 1 } },
        lineStyle: { color: c.muted, type: [4, 4], width: 1, opacity: 0.7 },
        data: markLines,
      },
    });

    const visibleRanked = ranked.filter(r => legend.visible(r.variant.key));
    return {
      animation: false,
      grid: { left: GRID_LEFT, right, top: GRID_TOP, bottom: GRID_BOTTOM },
      tooltip: {
        ...crosshairTooltip(c),
        formatter: (params: unknown) => {
          const list = params as { axisValue?: number }[];
          const at = Number(list[0]?.axisValue);
          if (!Number.isFinite(at)) return '';
          const rows = visibleRanked
            .map(r => {
              const mine = drawn.filter(cv => cv.variant.key === r.variant.key);
              if (mine.length === 0) return '';
              const values = mine.map(cv => valueAt(cv, x, at)).filter((v): v is number => v != null);
              let text: string;
              if (agg === 'runs' && target != null) text = `${values.filter(v => v >= target).length} of ${mine.length} finished`;
              else text = formatInt(agg === 'best' ? Math.max(...values) : median(values));
              return tooltipRow(c.resolve(r.variant.color.token), r.variant.short, text);
            })
            .join('');
          return tooltipTitle(formatX(at, x)) + rows;
        },
      },
      xAxis: xAxisFor(c, range, x),
      yAxis: { ...yAxisFor(c, yMax), minInterval: 1, interval: yMax <= 10 ? 1 : undefined },
      series,
    } as EChartsOption;
  }, [agg, c, drawn, labels, legend, lines, marks, range, ranked, right, target, x, yMax]);

  const onEvents = useMemo(
    () => ({
      click: (p: unknown) => {
        const { seriesId } = p as { seriesId?: string };
        if (!seriesId || seriesId === 'labels' || seriesId === 'guides') return;
        if (agg === 'runs') navigate({ to: '/runs/$runId', params: { runId: seriesId }, search: {} as never });
        else legend.isolate(seriesId);
      },
      updateAxisPointer: (p: unknown) => {
        if (!below) return;
        const value = (p as { axesInfo?: { axisDim: string; value: number }[] }).axesInfo?.find(a => a.axisDim === 'x')?.value;
        setHover(value ?? null);
      },
      globalout: () => setHover(null),
    }),
    [agg, below, legend, navigate]
  );

  return (
    <div ref={ref} className="min-w-0">
      <div className="relative">
        <Chart option={option} height={HEIGHT} onEvents={onEvents} />
        {pending && <p className="absolute inset-x-0 top-1/3 text-center text-sm text-muted">Loading model calls.</p>}
      </div>
      {below?.({ left: GRID_LEFT, right, range }, hover)}
      {missing.length > 0 && !pending && (
        <p className="mt-2 text-xs text-muted">
          {x === 'cost' ? 'No cost to draw' : 'No model calls to draw'}: {missing.map(r => r.variant.name).join(', ')}.
        </p>
      )}
    </div>
  );
}

const LINE_CLASS = { solid: 'border-solid', dashed: 'border-dashed', dotted: 'border-dotted' } as const;

const TO_FINISH: Record<XMeasure, string> = { ticks: 'Ticks', seconds: 'Time', cost: 'Cost', calls: 'Calls' };

function formatFinish(value: number | null, x: XMeasure): string {
  if (value == null) return '–';
  if (x === 'seconds') return formatClock(value);
  if (x === 'cost') return formatCost(value);
  return formatInt(value);
}

/** One dot per run: filled when it finished; each opens its run. */
function RunDots({ e, runs }: { e: Eval; runs: Run[] }) {
  return (
    <span className="inline-flex justify-end gap-0.5">
      {runs.map(run => (
        <Link
          key={run.id}
          to="/runs/$runId"
          params={{ runId: run.id }}
          search={{} as never}
          title={
            run.success
              ? `Epoch ${run.epoch}: finished in ${formatInt(run.ticks)} ticks`
              : `Epoch ${run.epoch}: ${e.measure.toLowerCase()} ${formatInt(resultValue(run))}`
          }
          className="grid size-4 place-items-center rounded-full focus-visible:ring-2 focus-visible:ring-primary-50"
        >
          <span className={clsx('size-2.5 rounded-full', run.success ? 'bg-success' : 'border-2 border-danger')} />
        </Link>
      ))}
    </span>
  );
}

/** Each run's result as a small number that opens the run, best first. */
function RunValues({ runs }: { runs: Run[] }) {
  const sorted = [...runs].sort((a, b) => (resultValue(b) ?? 0) - (resultValue(a) ?? 0));
  return (
    <span className="inline-flex flex-wrap justify-end gap-1">
      {sorted.map(run => (
        <Link
          key={run.id}
          to="/runs/$runId"
          params={{ runId: run.id }}
          search={{} as never}
          title={`Epoch ${run.epoch}`}
          className="min-w-6 rounded-xs bg-background px-1.5 text-center text-xs/5 font-medium text-foreground tabular-nums outline -outline-offset-1 outline-border transition-colors hover:text-primary focus-visible:ring-2 focus-visible:ring-primary-50"
        >
          {formatInt(resultValue(run))}
        </Link>
      ))}
    </span>
  );
}

/** The variants ranked by the headline result; a click isolates one in every chart. */
export function RankedPanel({ e, ranked, x, legend }: { e: Eval; ranked: RankedVariant[]; x: XMeasure; legend: LegendState }) {
  const target = e.target != null;
  return (
    <div className="scrollbar-thin overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-xs text-muted">
            <th scope="col" className="pb-2 text-left font-medium">
              <span className="sr-only">Variant</span>
            </th>
            <th scope="col" className="pb-2 pl-3 text-right font-medium whitespace-nowrap">
              {target ? 'Finished' : 'Runs'}
            </th>
            {target && (
              <th scope="col" className="pb-2 pl-3 text-right font-medium whitespace-nowrap" title="Median over finished runs">
                {TO_FINISH[x]}
                <span className="max-sm:hidden"> to finish</span>
              </th>
            )}
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {ranked.map(r => {
            const key = r.variant.key;
            const focused = legend.focus === key;
            return (
              <tr key={key} className={clsx('transition-opacity', !legend.visible(key) && 'opacity-40', focused && 'bg-primary-wash')}>
                <td className="py-2 pr-1">
                  <button
                    type="button"
                    aria-pressed={legend.visible(key)}
                    title={focused ? 'Click to show every variant' : 'Click to hide; double-click to show only this'}
                    onClick={event => (event.detail >= 2 ? legend.isolate(key) : legend.toggle(key))}
                    className="flex min-w-0 items-center gap-2.5 rounded-xs text-left focus-visible:ring-2 focus-visible:ring-primary-50"
                  >
                    <span
                      aria-hidden
                      className={clsx('w-4 shrink-0 border-t-2 max-sm:hidden', r.variant.color.borderClassName, LINE_CLASS[r.variant.line])}
                    />
                    <span className="flex min-w-0 flex-col gap-0.5">
                      {r.variant.vendorSlug !== 'program' && <ModelLabel model={r.variant.model} />}
                      <AgentLabel agent={r.variant.agent} fallback={r.runs[0]?.agent_name} className="text-muted" />
                    </span>
                  </button>
                </td>
                <td className="py-2 pl-3 text-right align-middle whitespace-nowrap">
                  {target ? <RunDots e={e} runs={r.runs} /> : <RunValues runs={r.runs} />}
                </td>
                {target && <td className="py-2 pl-3 text-right tabular-nums">{formatFinish(r.toFinish, x)}</td>}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
