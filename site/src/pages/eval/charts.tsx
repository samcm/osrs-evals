/** The eval page's charts: success CDF, Pareto, where time goes, per-run scatter, attempts. */

import { useMemo, useState } from 'react';
import { useNavigate } from '@tanstack/react-router';
import type { EChartsOption } from 'echarts';
import { Card } from '@/components/Card';
import { Chart } from '@/components/Chart';
import { ChartLegend } from '@/components/ChartLegend';
import { Empty, Segmented } from '@/components/bits';
import type { Eval, Run } from '@/data/types';
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
import { evalArt, hasTarget, outcomeWord } from '@/lib/evals';
import { formatCost, formatCostTick, formatInt, formatPercent, formatSeconds } from '@/lib/format';
import { median, niceSteps, paretoFrontier, stepAbove, stepBelow, type VariantStats } from '@/lib/stats';
import { variantOf } from '@/lib/series';
import { useThemeColors, withAlpha, type ThemeColors } from '@/lib/theme';
import { useWidth } from '@/lib/useWidth';

/** Narrower than this, names move from line ends into a legend under the chart. */
const NARROW = 520;

const LINE_TYPE = { solid: 'solid', dashed: [6, 4], dotted: [1.5, 3] } as const;

/** Grid padding to the right for end labels: an estimate of the longest name's width. */
function labelRoom(names: string[]): number {
  return Math.min(180, Math.max(...names.map(n => n.length), 4) * 6.2 + 16);
}

/** A log axis on the 1-2-5 dollar steps between lo and hi. */
function costAxis(c: ThemeColors, lo: number, hi: number) {
  const steps = niceSteps(lo, hi);
  return {
    type: 'log' as const,
    logBase: 10,
    min: lo,
    max: hi,
    ...valueAxis(c),
    axisLabel: { ...valueAxis(c).axisLabel, customValues: steps, formatter: (v: number) => formatCostTick(v) },
    axisTick: { show: false, customValues: steps },
    splitLine: { ...valueAxis(c).splitLine, show: true },
    minorSplitLine: { show: false },
  };
}

const costRange = (costs: number[]): [number, number] | null => {
  const positive = costs.filter(x => x > 0);
  if (positive.length === 0) return null;
  const lo = stepBelow(Math.min(...positive));
  let hi = stepAbove(Math.max(...positive));
  if (hi <= lo) hi = stepAbove(lo * 1.01);
  return [lo, hi];
};

type Budget = 'ticks' | 'seconds' | 'cost';

/** Share of runs finished within a budget, per variant. Unfinished runs never count. */
export function SuccessCdf({ e, variants }: { e: Eval; variants: VariantStats[] }) {
  const [budget, setBudget] = useState<Budget>('ticks');
  const c = useThemeColors();
  const [ref, width] = useWidth();
  const narrow = width > 0 && width < NARROW;
  const navigate = useNavigate();

  const option = useMemo<EChartsOption | null>(() => {
    const all = variants.flatMap(v => v.runs).filter(r => r.success != null);
    if (all.length === 0) return null;
    const valueOf = (r: Run): number | null => (budget === 'ticks' ? r.ticks : budget === 'seconds' ? r.seconds : r.cost);

    let lo = 0;
    let hi: number;
    if (budget === 'ticks') hi = e.budget_ticks;
    else if (budget === 'seconds') hi = stepAbove(Math.max(1, ...all.map(r => r.game_seconds ?? r.seconds ?? 0)));
    else {
      const range = costRange(all.map(r => r.cost ?? 0));
      if (!range) return null;
      [lo, hi] = range;
    }

    const series = variants.map(v => {
      const eligible = v.runs.filter(r => r.success != null && (budget !== 'cost' || r.cost != null));
      const n = eligible.length;
      const finished = eligible
        .filter(r => r.success)
        .map(r => ({ run: r, x: Math.max(lo, valueOf(r) ?? lo) }))
        .sort((a, b) => a.x - b.x);
      const colour = c.resolve(v.variant.color.token);
      const data: { value: [number, number]; run?: Run; k?: number; symbol?: string }[] = [
        { value: [lo, 0], symbol: 'none' },
        ...finished.map((f, i) => ({ value: [f.x, n ? (i + 1) / n : 0] as [number, number], run: f.run, k: i + 1 })),
      ];
      data.push({ value: [hi, data[data.length - 1].value[1]], symbol: 'none' });
      return {
        type: 'line' as const,
        name: v.variant.short,
        step: 'end' as const,
        data,
        n,
        color: colour,
        symbol: 'circle',
        symbolSize: 5,
        showSymbol: true,
        lineStyle: { width: 1.5, type: LINE_TYPE[v.variant.line] },
        itemStyle: { color: colour },
        emphasis: { focus: 'series' as const },
        endLabel: narrow
          ? { show: false }
          : { show: true, formatter: v.variant.short, color: colour, fontSize: 11, distance: 6 },
        labelLayout: { moveOverlap: 'shiftY' as const },
      };
    });

    const xName = { ticks: 'Game ticks', seconds: 'Wall-clock seconds', cost: 'Cost per run' }[budget];
    return {
      animation: false,
      grid: { left: 48, right: narrow ? 16 : labelRoom(variants.map(v => v.variant.short)), top: 24, bottom: 50 },
      tooltip: {
        ...getChartTooltipChrome(c),
        trigger: 'item',
        formatter: (p: unknown) => {
          const { data, seriesIndex } = p as { data: { value: [number, number]; run?: Run; k?: number }; seriesIndex: number };
          const s = series[seriesIndex];
          if (!data.run) return '';
          const x = budget === 'cost' ? formatCost(data.run.cost) : budget === 'ticks' ? `${formatInt(data.value[0])} ticks` : `${formatSeconds(data.value[0])} s`;
          return (
            tooltipTitle(s.name) +
            tooltipRow(s.color, 'Within', x) +
            tooltipRow(null, 'Finished', `${data.k} of ${s.n}`) +
            tooltipRow(null, 'Share', formatPercent(data.value[1]))
          );
        },
      },
      xAxis:
        budget === 'cost'
          ? { ...costAxis(c, lo, hi), ...getChartXAxisName(c), name: xName, axisLine: categoryAxis(c).axisLine }
          : {
              type: 'value',
              min: 0,
              max: hi,
              ...categoryAxis(c),
              ...getChartXAxisName(c),
              name: xName,
              axisLabel: { ...categoryAxis(c).axisLabel, formatter: (v: number) => formatAxisNumber(v) },
            },
      yAxis: {
        type: 'value',
        min: 0,
        max: 1,
        interval: 0.25,
        ...valueAxis(c),
        axisLabel: { ...valueAxis(c).axisLabel, formatter: (v: number) => formatPercent(v) },
      },
      series: series.map(({ n: _n, ...s }) => s),
    } as EChartsOption;
  }, [budget, c, e.budget_ticks, narrow, variants]);

  return (
    <Card
      title="Finished within a budget"
      subtitle="Share of runs; unfinished runs never count"
      actions={
        <Segmented
          label="Budget"
          value={budget}
          onChange={setBudget}
          options={[
            { value: 'ticks', label: 'Ticks' },
            { value: 'seconds', label: 'Seconds' },
            { value: 'cost', label: 'Cost' },
          ]}
        />
      }
    >
      <div ref={ref}>
        {option ? (
          <>
            <Chart
              option={option}
              height={300}
              onEvents={{
                click: p => {
                  const run = (p as { data?: { run?: Run } }).data?.run;
                  if (run) navigate({ to: '/runs/$runId', params: { runId: run.id } });
                },
              }}
            />
            {narrow && (
              <ChartLegend
                className="mt-2"
                items={variants.map(v => ({ label: v.variant.short, color: v.variant.color, line: v.variant.line }))}
              />
            )}
          </>
        ) : (
          <Empty>{budget === 'cost' ? 'No run here cost more than $0.' : 'No runs.'}</Empty>
        )}
      </div>
    </Card>
  );
}

type LabelPosition = 'right' | 'left' | 'top' | 'bottom';

/**
 * Place point labels so they stay in the plot and clear each other and the points: each label
 * takes the first of right, left, top, bottom that fits, in order of the points from the top.
 */
function placeLabels(
  points: { x: number; y: number; text: string }[],
  g: { width: number; left: number; right: number; top: number; bottom: number; height: number; lo: number; hi: number }
): LabelPosition[] {
  const plotW = Math.max(1, g.width - g.left - g.right);
  const plotH = g.height - g.top - g.bottom;
  const px = (x: number): number => g.left + ((Math.log(x) - Math.log(g.lo)) / (Math.log(g.hi) - Math.log(g.lo))) * plotW;
  const py = (y: number): number => g.top + (1 - y) * plotH;
  type Rect = [number, number, number, number];
  const overlaps = (a: Rect, b: Rect): boolean => a[0] < b[2] && b[0] < a[2] && a[1] < b[3] && b[1] < a[3];
  const marks: Rect[] = points.map(p => [px(p.x) - 6, py(p.y) - 6, px(p.x) + 6, py(p.y) + 6]);
  const placed: Rect[] = [];
  const out: LabelPosition[] = new Array(points.length).fill('right');
  const order = points.map((_, i) => i).sort((a, b) => points[b].y - points[a].y || points[a].x - points[b].x);
  for (const i of order) {
    const cx = px(points[i].x);
    const cy = py(points[i].y);
    const w = points[i].text.length * 6 + 4;
    const h = 14;
    const candidates: [LabelPosition, Rect][] = [
      ['right', [cx + 8, cy - h / 2, cx + 8 + w, cy + h / 2]],
      ['left', [cx - 8 - w, cy - h / 2, cx - 8, cy + h / 2]],
      ['top', [cx - w / 2, cy - 8 - h, cx + w / 2, cy - 8]],
      ['bottom', [cx - w / 2, cy + 8, cx + w / 2, cy + 8 + h]],
    ];
    const fits = ([, r]: [LabelPosition, Rect]): boolean =>
      r[0] >= 0 &&
      r[2] <= g.width &&
      r[1] >= 0 &&
      r[3] <= g.height &&
      !placed.some(o => overlaps(o, r)) &&
      !marks.some((m, j) => j !== i && overlaps(m, r));
    const choice = candidates.find(fits) ?? candidates.find(([, r]) => r[0] >= 0 && r[2] <= g.width) ?? candidates[0];
    out[i] = choice[0];
    placed.push(choice[1]);
  }
  return out;
}

/** Mean cost per run against finish rate, per variant, with the frontier under the points. */
export function Pareto({ variants }: { variants: VariantStats[] }) {
  const c = useThemeColors();
  const [ref, width] = useWidth();

  const points = variants.filter(v => (v.meanCost ?? 0) > 0 && v.finishRate != null);
  const left = variants.filter(v => !points.includes(v));

  const option = useMemo<EChartsOption | null>(() => {
    if (points.length === 0) return null;
    const range = costRange(points.map(p => p.meanCost!))!;
    const frontier = paretoFrontier(points, p => p.meanCost!, p => p.finishRate!);
    const positions = placeLabels(
      points.map(p => ({ x: p.meanCost!, y: p.finishRate!, text: p.variant.short })),
      { width, left: 48, right: 24, top: 24, bottom: 50, height: 300, lo: range[0], hi: range[1] }
    );
    const frontierLine = {
      type: 'line' as const,
      data: frontier.map(p => [p.meanCost!, p.finishRate!]),
      symbol: 'none',
      silent: true,
      z: 1,
      lineStyle: { width: 1.25, type: [3, 4] as number[], color: withAlpha(c.muted, 0.55) },
      tooltip: { show: false },
    };
    return {
      animation: false,
      grid: { left: 48, right: 24, top: 24, bottom: 50 },
      tooltip: {
        ...getChartTooltipChrome(c),
        trigger: 'item',
        formatter: (p: unknown) => {
          const { dataIndex } = p as { dataIndex: number };
          const v = points[dataIndex];
          if (!v) return '';
          return (
            tooltipTitle(v.variant.name) +
            tooltipRow(c.resolve(v.variant.color.token), 'Mean cost per run', formatCost(v.meanCost)) +
            tooltipRow(null, 'Finish rate', formatPercent(v.finishRate)) +
            tooltipRow(null, 'Finished', `${v.finished} of ${v.scored}`) +
            (frontier.includes(v) ? tooltipRow(null, 'On the frontier', 'Yes') : '')
          );
        },
      },
      xAxis: { ...costAxis(c, range[0], range[1]), ...getChartXAxisName(c), name: 'Mean cost per run', axisLine: categoryAxis(c).axisLine },
      yAxis: {
        type: 'value',
        min: 0,
        max: 1,
        interval: 0.25,
        ...valueAxis(c),
        axisLabel: { ...valueAxis(c).axisLabel, formatter: (v: number) => formatPercent(v) },
      },
      series: [
        frontierLine,
        {
          type: 'scatter',
          z: 3,
          data: points.map((p, i) => ({
            value: [p.meanCost!, p.finishRate!],
            symbol: p.variant.symbol,
            itemStyle: { color: c.resolve(p.variant.color.token) },
            label: {
              show: true,
              formatter: p.variant.short,
              position: positions[i],
              distance: 6,
              fontSize: 11,
              color: frontier.includes(p) ? c.foreground : c.muted,
            },
          })),
          symbolSize: 10,
        },
      ],
    } as EChartsOption;
  }, [c, points, width]);

  if (!option) return null;
  return (
    <Card title="Cost against finish rate" subtitle="Per variant; mean cost per run at list price">
      <div ref={ref}>
        <Chart option={option} height={300} />
        {left.length > 0 && (
          <p className="mt-2 text-xs text-muted">
            Not on the log axis, at $0 or without a price: {left.map(v => v.variant.name).join(', ')}
          </p>
        )}
      </div>
    </Card>
  );
}

/** Mean wall seconds per run, split into waiting on the model and everything else. */
export function TimeSplit({ variants }: { variants: VariantStats[] }) {
  const c = useThemeColors();
  const [ref, width] = useWidth();
  const narrow = width > 0 && width < NARROW;

  const option = useMemo<EChartsOption>(() => {
    const rows = [...variants].reverse();
    const model = rows.map(v => v.meanModelSeconds ?? 0);
    const rest = rows.map(v => Math.max(0, (v.meanWallSeconds ?? 0) - (v.meanModelSeconds ?? 0)));
    const labelWidth = narrow ? 104 : 168;
    return {
      animation: false,
      grid: { left: labelWidth + 12, right: 56, top: 8, bottom: 44 },
      tooltip: {
        ...getChartTooltipChrome(c),
        trigger: 'axis',
        axisPointer: { type: 'none' },
        formatter: (p: unknown) => {
          const i = (p as { dataIndex: number }[])[0].dataIndex;
          const v = rows[i];
          const colour = c.resolve(v.variant.color.token);
          const total = model[i] + rest[i];
          return (
            tooltipTitle(v.variant.name) +
            tooltipRow(colour, 'Waiting on model', `${formatSeconds(model[i])} s`) +
            tooltipRow(withAlpha(c.muted, 0.3), 'Everything else', `${formatSeconds(rest[i])} s`) +
            tooltipRow(null, 'Share waiting', formatPercent(total ? model[i] / total : null))
          );
        },
      },
      xAxis: {
        type: 'value',
        ...valueAxis(c),
        ...getChartXAxisName(c),
        name: 'Mean wall-clock seconds per run',
      },
      yAxis: {
        type: 'category',
        data: rows.map(v => v.variant.short),
        ...categoryAxis(c),
        axisLabel: { ...categoryAxis(c).axisLabel, width: labelWidth, overflow: 'break', lineHeight: 13 },
      },
      series: [
        {
          type: 'bar',
          name: 'Waiting on model',
          stack: 'time',
          barWidth: 16,
          data: rows.map((v, i) => ({ value: model[i], itemStyle: { color: c.resolve(v.variant.color.token) } })),
        },
        {
          type: 'bar',
          name: 'Everything else',
          stack: 'time',
          barWidth: 16,
          data: rows.map((_v, i) => ({
            value: rest[i],
            itemStyle: { color: withAlpha(c.muted, 0.3), borderRadius: [0, 2, 2, 0] },
          })),
          label: {
            show: true,
            position: 'right',
            fontSize: 11,
            color: c.muted,
            formatter: (p: unknown) => {
              const i = (p as { dataIndex: number }).dataIndex;
              return `${formatSeconds(model[i] + rest[i])} s`;
            },
          },
        },
      ],
    } as EChartsOption;
  }, [c, narrow, variants]);

  return (
    <Card title="Where time goes" subtitle="Mean per run, wall-clock seconds">
      <div ref={ref}>
        <Chart option={option} height={56 + variants.length * 40} />
        <ChartLegend
          className="mt-2"
          items={[
            { label: 'Waiting on model', colors: [...new Map(variants.map(v => [v.variant.color.token, v.variant.color])).values()] },
            { label: 'Everything else', swatchClassName: 'bg-muted-30' },
          ]}
        />
      </div>
    </Card>
  );
}

/** Every run: ticks against cost. Unfinished runs sit at the ticks they played, hollow. */
export function RunScatter({ e, runs }: { e: Eval; runs: Run[] }) {
  const c = useThemeColors();
  const navigate = useNavigate();
  const drawn = runs.filter(r => (r.cost ?? 0) > 0);
  const left = runs.length - drawn.length;
  const leftNames = [...new Set(runs.filter(r => !drawn.includes(r)).map(r => variantOf(r).name))];
  const variants = useMemo(() => {
    const seen = new Map<string, ReturnType<typeof variantOf>>();
    for (const r of drawn) seen.set(variantOf(r).key, variantOf(r));
    return [...seen.values()].sort((a, b) => a.name.localeCompare(b.name));
  }, [drawn]);

  const option = useMemo<EChartsOption | null>(() => {
    if (drawn.length === 0) return null;
    const range = costRange(drawn.map(r => r.cost!))!;
    const x = (r: Run): number => (r.success ? r.ticks : r.game_ticks ?? r.ticks) ?? 0;
    const xMax = Math.max(e.budget_ticks, ...drawn.map(x));
    const series = variants.flatMap(v => {
      const colour = c.resolve(v.color.token);
      const mine = drawn.filter(r => variantOf(r).key === v.key);
      const make = (list: Run[], hollow: boolean) => ({
        type: 'scatter' as const,
        name: v.short,
        symbol: v.symbol,
        symbolSize: 9,
        data: list.map(r => ({ value: [x(r), r.cost!], run: r })),
        itemStyle: hollow
          ? { color: c.surface, borderColor: colour, borderWidth: 1.5 }
          : { color: colour, borderColor: colour, borderWidth: 1.5 },
      });
      return [make(mine.filter(r => r.success !== false), false), make(mine.filter(r => r.success === false), true)];
    });
    return {
      animation: false,
      grid: { left: 56, right: 24, top: 32, bottom: 50 },
      tooltip: {
        ...getChartTooltipChrome(c),
        trigger: 'item',
        formatter: (p: unknown) => {
          const run = (p as { data: { run: Run } }).data.run;
          const v = variantOf(run);
          return (
            tooltipTitle(v.name) +
            tooltipRow(c.resolve(v.color.token), 'Epoch', String(run.epoch)) +
            tooltipRow(null, 'Outcome', outcomeWord(run)) +
            tooltipRow(null, run.success ? 'Ticks to finish' : 'Ticks played', formatInt(x(run))) +
            tooltipRow(null, 'Cost', formatCost(run.cost))
          );
        },
      },
      xAxis: {
        type: 'value',
        min: 0,
        max: xMax,
        ...categoryAxis(c),
        ...getChartXAxisName(c),
        name: 'Game ticks',
        axisLabel: { ...categoryAxis(c).axisLabel, formatter: (v: number) => formatAxisNumber(v) },
      },
      yAxis: { ...costAxis(c, range[0], range[1]), ...getChartValueAxisName(c), name: 'Cost' },
      series: [
        ...series,
        {
          type: 'line',
          data: [],
          silent: true,
          markLine: {
            silent: true,
            symbol: 'none',
            lineStyle: { color: c.muted, type: [4, 4], width: 1 },
            label: { formatter: 'Budget', color: c.muted, fontSize: 11, position: 'end' },
            data: [{ xAxis: e.budget_ticks }],
          },
        },
      ],
    } as EChartsOption;
  }, [c, drawn, e.budget_ticks, variants]);

  if (!option) return null;
  return (
    <Card title="Every run" subtitle={e.target == null ? 'Ticks played' : 'Ticks to finish, or ticks played when not finished'}>
      {option ? (
        <>
          <Chart
            option={option}
            height={300}
            onEvents={{
              click: p => {
                const run = (p as { data?: { run?: Run } }).data?.run;
                if (run) navigate({ to: '/runs/$runId', params: { runId: run.id } });
              },
            }}
          />
          <ChartLegend
            className="mt-2"
            items={[
              ...variants.map(v => ({ label: v.short, color: v.color, symbol: v.symbol })),
              ...(hasTarget(e) ? [{ label: 'Not finished', hollow: true }] : []),
            ]}
          />
          {left > 0 && (
            <p className="mt-2 text-xs text-muted">
              Not on the log axis, at $0 or without a price: {left === 1 ? '1 run' : `${left} runs`} of {leftNames.join(', ')}
            </p>
          )}
        </>
      ) : (
        <Empty>No run here has a cost.</Empty>
      )}
    </Card>
  );
}

const ticksAt = (r: Run, attempt: number): number | null =>
  r.attempt_results?.find(a => a.attempt === attempt)?.ticks ?? null;

/** Ticks to finish each attempt, per variant: the median line and each run's point. */
export function AttemptsChart({ e, variants }: { e: Eval; variants: VariantStats[] }) {
  const c = useThemeColors();
  const any = variants.some(v => v.runs.some(r => r.attempt_results?.some(a => a.ticks != null)));

  const option = useMemo<EChartsOption>(() => {
    const attempts = Array.from({ length: e.attempts }, (_, i) => i + 1);
    const series = variants.flatMap(v => {
      const colour = c.resolve(v.variant.color.token);
      return [
        {
          type: 'line' as const,
          name: v.variant.short,
          data: attempts.map(a => median(v.runs.map(r => ticksAt(r, a)))),
          connectNulls: false,
          symbol: v.variant.symbol,
          symbolSize: 7,
          lineStyle: { width: 1.5, type: LINE_TYPE[v.variant.line], color: colour },
          itemStyle: { color: colour },
        },
        {
          type: 'scatter' as const,
          name: v.variant.short,
          data: v.runs.flatMap(r =>
            attempts.map(a => [a - 1, ticksAt(r, a)] as [number, number | null]).filter(([, t]) => t != null)
          ),
          symbolSize: 5,
          itemStyle: { color: withAlpha(colour, 0.45) },
          silent: true,
        },
      ];
    });
    return {
      animation: false,
      grid: { left: 56, right: 24, top: 24, bottom: 44 },
      tooltip: {
        ...getChartTooltipChrome(c),
        trigger: 'axis',
        axisPointer: { type: 'line', lineStyle: { color: c.border } },
        formatter: (p: unknown) => {
          const items = (p as { seriesType: string; seriesName: string; value: number | null; color: string; axisValue: string }[]).filter(
            i => i.seriesType === 'line'
          );
          return (
            tooltipTitle(items[0]?.axisValue ?? '') +
            items.map(i => tooltipRow(i.color, i.seriesName, i.value == null ? 'Not finished' : `${formatInt(i.value)} ticks`)).join('')
          );
        },
      },
      xAxis: {
        type: 'category',
        data: attempts.map(a => `Attempt ${a}`),
        ...categoryAxis(c),
        boundaryGap: true,
      },
      yAxis: {
        type: 'value',
        min: 0,
        ...valueAxis(c),
        ...getChartValueAxisName(c),
        name: 'Ticks to finish',
        axisLabel: { ...valueAxis(c).axisLabel, formatter: (v: number) => formatAxisNumber(v) },
      },
      series,
    } as EChartsOption;
  }, [c, variants, e.attempts]);

  return (
    <Card title="Ticks to finish by attempt" subtitle="Median per variant; dots are runs">
      {any ? (
        <>
          <Chart option={option} height={280} />
          <ChartLegend
            className="mt-2"
            items={variants.map(v => ({ label: v.variant.short, color: v.variant.color, line: v.variant.line }))}
          />
        </>
      ) : (
        <Empty>No attempt has finished yet.</Empty>
      )}
    </Card>
  );
}

/** For evals without a target: each run's final value, per variant. */
export function ValueStrip({ e, variants }: { e: Eval; variants: VariantStats[] }) {
  const c = useThemeColors();
  const navigate = useNavigate();
  const measure = evalArt(e.id).measure;
  const option = useMemo<EChartsOption>(() => {
    const rows = [...variants].reverse();
    return {
      animation: false,
      grid: { left: 140, right: 24, top: 8, bottom: 44 },
      tooltip: {
        ...getChartTooltipChrome(c),
        trigger: 'item',
        formatter: (p: unknown) => {
          const run = (p as { data: { run: Run } }).data.run;
          const v = variantOf(run);
          return (
            tooltipTitle(v.name) +
            tooltipRow(c.resolve(v.color.token), 'Epoch', String(run.epoch)) +
            tooltipRow(null, measure, formatInt(run.final_value ?? run.score))
          );
        },
      },
      xAxis: { type: 'value', min: 0, ...valueAxis(c), ...getChartXAxisName(c), name: `${measure} at the end` },
      yAxis: { type: 'category', data: rows.map(v => v.variant.short), ...categoryAxis(c) },
      series: rows.map((v, i) => ({
        type: 'scatter' as const,
        symbol: v.variant.symbol,
        symbolSize: 10,
        itemStyle: { color: c.resolve(v.variant.color.token) },
        data: v.runs.map(r => ({ value: [r.final_value ?? r.score ?? 0, i], run: r })),
      })),
    } as EChartsOption;
  }, [c, measure, variants]);

  return (
    <Card title={`${measure} per run`} subtitle="At the end of the budget">
      <Chart
        option={option}
        height={56 + variants.length * 40}
        onEvents={{
          click: p => {
            const run = (p as { data?: { run?: Run } }).data?.run;
            if (run) navigate({ to: '/runs/$runId', params: { runId: run.id } });
          },
        }}
      />
    </Card>
  );
}
