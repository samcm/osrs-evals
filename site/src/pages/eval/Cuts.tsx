/** What each variant spent for its result (a Pareto), and how soon runs finished (a success CDF). */

import { useMemo } from 'react';
import { useNavigate } from '@tanstack/react-router';
import type { EChartsOption } from 'echarts';
import { Card } from '@/components/Card';
import { Chart } from '@/components/Chart';
import { Empty, ParamSegmented } from '@/components/bits';
import { VariantLabel } from '@/components/marks';
import type { Eval, Run } from '@/data/types';
import { getChartTooltipChrome, getChartXAxisName, tooltipRow, tooltipTitle } from '@/lib/chartChrome';
import { layoutEndLabels, markRich, markText, useBrandImages } from '@/lib/chartKit';
import { capitalize, formatInt, formatPercent } from '@/lib/format';
import type { LegendState } from '@/lib/legend';
import { median, paretoFrontier, stepAbove, stepBelow } from '@/lib/stats';
import { useThemeColors, withAlpha } from '@/lib/theme';
import { useWidth } from '@/lib/useWidth';
import { LINE_TYPE, formatX, labelWidth, placePointLabels, variantShortText, variantSlugs, xAxisFor, yAxisFor } from './chartBits';
import { niceMax, type CdfX, type ParetoX, type RankedVariant, type XRange } from './model';

const HEIGHT = 360;

const spendOf = (run: Run, px: ParetoX): number | null => {
  if (px === 'cost') return run.cost;
  if (px === 'seconds') return run.game_seconds;
  if (px === 'ticks') return run.game_ticks;
  return run.input_tokens + run.output_tokens;
};

const PX_NAME: Record<ParetoX, string> = {
  cost: 'Median cost per run',
  seconds: 'Median time per run',
  ticks: 'Median ticks per run',
  tokens: 'Median tokens per run',
};

function logRange(values: number[]): XRange | null {
  const positive = values.filter(v => v > 0);
  if (positive.length === 0) return null;
  const lo = stepBelow(Math.min(...positive));
  let hi = stepAbove(Math.max(...positive));
  if (hi <= lo) hi = stepAbove(lo * 1.01);
  return { min: lo, max: hi, log: true, budget: null };
}

/** Each variant's median spend per run against its finish rate (or median result), with the frontier under the points. */
export function ParetoCard({ e, ranked, px, legend }: { e: Eval; ranked: RankedVariant[]; px: ParetoX; legend: LegendState }) {
  const c = useThemeColors();
  const [ref, width] = useWidth();
  const marks = useBrandImages(
    ranked.flatMap(r => variantSlugs(r.variant)),
    c.foreground,
    14
  );
  const target = e.target != null;
  const log = px === 'cost' || px === 'tokens';

  const all = ranked.map(r => ({
    r,
    x: median(r.runs.map(run => spendOf(run, px))),
    y: target ? r.finished / r.runs.length : (r.medianResult ?? 0),
  }));
  const points = all.filter(p => p.x != null && (!log || p.x > 0)) as { r: RankedVariant; x: number; y: number }[];
  const left = all.filter(p => !points.includes(p as never));

  const yMax = target
    ? 1
    : Math.max(1, ...points.map(p => p.y)) <= 10
      ? Math.ceil(Math.max(1, ...points.map(p => p.y)))
      : niceMax(Math.max(...points.map(p => p.y)));

  const option = useMemo<EChartsOption | null>(() => {
    if (points.length === 0 || width === 0) return null;
    const range: XRange = log
      ? logRange(points.map(p => p.x))!
      : { min: 0, max: niceMax(Math.max(...points.map(p => p.x))), log: false, budget: null };
    const frontier = paretoFrontier(
      points,
      p => p.x,
      p => p.y
    );
    const grid = { left: 44, right: 20, top: 24, bottom: 48 };
    const plotW = width - grid.left - grid.right;
    const plotH = HEIGHT - grid.top - grid.bottom;
    const f = (v: number): number => (log ? Math.log10(v) : v);
    const positions = placePointLabels(
      points.map(p => ({
        px: grid.left + ((f(p.x) - f(range.min)) / (f(range.max) - f(range.min))) * plotW,
        py: grid.top + (1 - p.y / yMax) * plotH,
        width: labelWidth(variantSlugs(p.r.variant).length, variantShortText(p.r.variant)),
      })),
      { width, height: HEIGHT }
    );
    return {
      animation: false,
      grid,
      tooltip: {
        ...getChartTooltipChrome(c),
        trigger: 'item',
        formatter: (p: unknown) => {
          const point = points[(p as { dataIndex: number }).dataIndex];
          if (!point) return '';
          const v = point.r.variant;
          return (
            tooltipTitle(v.name) +
            tooltipRow(c.resolve(v.color.token), PX_NAME[px], formatX(point.x, px)) +
            (target
              ? tooltipRow(null, 'Finished', `${point.r.finished} of ${point.r.runs.length}`)
              : tooltipRow(null, `Median ${e.measure.toLowerCase()}`, formatInt(point.y)))
          );
        },
      },
      xAxis: xAxisFor(c, range, px, PX_NAME[px]),
      yAxis: yAxisFor(c, yMax, target ? (v: number) => formatPercent(v) : undefined),
      series: [
        {
          type: 'line',
          data: frontier.map(p => [p.x, p.y]),
          symbol: 'none',
          silent: true,
          z: 1,
          lineStyle: { width: 1.25, type: [3, 4], color: withAlpha(c.muted, 0.6) },
          tooltip: { show: false },
        },
        {
          type: 'scatter',
          z: 3,
          symbolSize: 11,
          data: points.map((p, i) => {
            const shown = legend.visible(p.r.variant.key);
            const color = c.resolve(p.r.variant.color.token);
            return {
              value: [p.x, p.y],
              key: p.r.variant.key,
              symbol: p.r.variant.symbol,
              itemStyle: { color, opacity: shown ? 1 : 0.25 },
              label: {
                show: true,
                position: positions[i],
                distance: 7,
                fontSize: 11,
                formatter: markText(marks, variantSlugs(p.r.variant), variantShortText(p.r.variant)),
                rich: markRich(marks),
                color: frontier.includes(p) ? c.foreground : c.muted,
                opacity: shown ? 1 : 0.4,
              },
            };
          }),
        },
      ],
    } as EChartsOption;
  }, [c, e.measure, legend, log, marks, points, px, target, width, yMax]);

  return (
    <Card
      title="What it cost"
      className="flex flex-col"
      actions={
        <ParamSegmented
          param="px"
          value={px}
          label="Spend"
          options={[
            { value: 'cost', label: 'Cost' },
            { value: 'seconds', label: 'Time' },
            { value: 'ticks', label: 'Ticks' },
            { value: 'tokens', label: 'Tokens' },
          ]}
        />
      }
    >
      <div ref={ref}>
        {option ? (
          <Chart
            option={option}
            height={HEIGHT}
            onEvents={{
              click: p => {
                const key = (p as { data?: { key?: string } }).data?.key;
                if (key) legend.isolate(key);
              },
            }}
          />
        ) : (
          <div style={{ height: HEIGHT }} />
        )}
        {left.length > 0 && (
          <p className="mt-2 text-xs text-muted">
            {px === 'cost' ? 'No cost' : 'Nothing'} to place: {left.map(p => p.r.variant.name).join(', ')}.
          </p>
        )}
      </div>
    </Card>
  );
}

const finishOf = (run: Run, cx: CdfX): number | null => (cx === 'ticks' ? run.ticks : cx === 'seconds' ? run.seconds : run.cost);

/** Share of each variant's runs finished within a budget of ticks, time or cost. Unfinished runs never count. */
export function SuccessCdfCard({ e, ranked, cx, legend }: { e: Eval; ranked: RankedVariant[]; cx: CdfX; legend: LegendState }) {
  const c = useThemeColors();
  const navigate = useNavigate();
  const [ref, width] = useWidth();
  const narrow = width > 0 && width < 420;
  const marks = useBrandImages(
    ranked.flatMap(r => variantSlugs(r.variant)),
    c.foreground,
    14
  );

  const option = useMemo<EChartsOption | null>(() => {
    const shown = ranked.filter(r => legend.visible(r.variant.key));
    let range: XRange | null;
    if (cx === 'ticks') range = { min: 0, max: e.budget_ticks, log: false, budget: null };
    else if (cx === 'seconds') range = { min: 0, max: (e.budget_ticks * e.tick_ms) / 1000, log: false, budget: null };
    else range = logRange(shown.flatMap(r => r.runs.map(run => run.cost ?? 0)));
    if (!range || shown.length === 0) return null;
    const lo = range.min;
    const hi = range.max;

    const lines = shown.map(r => {
      const eligible = r.runs.filter(run => cx !== 'cost' || run.cost != null);
      const n = eligible.length;
      const finished = eligible
        .filter(run => run.success)
        .map(run => ({ run, x: Math.min(hi, Math.max(lo, finishOf(run, cx) ?? lo)) }))
        .sort((a, b) => a.x - b.x);
      const data: { value: [number, number]; run?: Run; k?: number; symbol?: string }[] = [
        { value: [lo, 0], symbol: 'none' },
        ...finished.map((f, i) => ({ value: [f.x, n ? (i + 1) / n : 0] as [number, number], run: f.run, k: i + 1 })),
      ];
      data.push({ value: [hi, data[data.length - 1].value[1]], symbol: 'none' });
      return { r, n, data };
    });

    const offsets = narrow
      ? new Map<string, number | null>()
      : layoutEndLabels(
          lines.map(l => ({ id: l.r.variant.key, value: l.data[l.data.length - 1].value[1] })),
          { min: 0, max: 1, height: HEIGHT - 24 - 32, lineHeight: 17 }
        );
    const right = narrow
      ? 16
      : Math.max(
          20,
          ...lines
            .filter(l => offsets.get(l.r.variant.key) != null)
            .map(l => labelWidth(variantSlugs(l.r.variant).length, variantShortText(l.r.variant)) + 12)
        );

    return {
      animation: false,
      grid: { left: 44, right, top: 24, bottom: 32 },
      tooltip: {
        ...getChartTooltipChrome(c),
        trigger: 'item',
        formatter: (p: unknown) => {
          const { data, seriesIndex } = p as { data: { run?: Run; k?: number }; seriesIndex: number };
          const line = lines[seriesIndex];
          if (!data.run || !line) return '';
          return (
            tooltipTitle(line.r.variant.name) +
            tooltipRow(c.resolve(line.r.variant.color.token), 'Epoch', String(data.run.epoch)) +
            tooltipRow(null, 'Finished within', formatX(finishOf(data.run, cx), cx)) +
            tooltipRow(null, 'Finished by then', `${data.k} of ${line.n}`)
          );
        },
      },
      xAxis: { ...xAxisFor(c, range, cx), ...(cx === 'cost' ? {} : getChartXAxisName(c)) },
      yAxis: { ...yAxisFor(c, 1, (v: number) => formatPercent(v)), interval: 0.25 },
      series: lines.map(l => {
        const color = c.resolve(l.r.variant.color.token);
        const dy = offsets.get(l.r.variant.key);
        return {
          type: 'line',
          step: 'end',
          data: l.data,
          symbol: l.r.variant.symbol,
          symbolSize: 6,
          showSymbol: true,
          color,
          lineStyle: { width: 1.5, type: LINE_TYPE[l.r.variant.line], color },
          itemStyle: { color },
          emphasis: { focus: 'series' },
          endLabel:
            dy == null
              ? { show: false }
              : {
                  show: true,
                  offset: [0, dy],
                  distance: 8,
                  formatter: markText(marks, variantSlugs(l.r.variant), variantShortText(l.r.variant)),
                  rich: markRich(marks),
                  color,
                  fontSize: 11,
                },
        };
      }),
    } as EChartsOption;
  }, [c, cx, e.budget_ticks, e.tick_ms, legend, marks, narrow, ranked]);

  return (
    <Card
      title="Finished within"
      className="flex flex-col"
      actions={
        <ParamSegmented
          param="cx"
          value={cx}
          label="Budget"
          options={[
            { value: 'ticks', label: 'Ticks' },
            { value: 'seconds', label: 'Time' },
            { value: 'cost', label: 'Cost' },
          ]}
        />
      }
    >
      <div ref={ref}>
        {option ? (
          <Chart
            option={option}
            height={HEIGHT}
            onEvents={{
              click: p => {
                const run = (p as { data?: { run?: Run } }).data?.run;
                if (run) navigate({ to: '/runs/$runId', params: { runId: run.id }, search: {} as never });
              },
            }}
          />
        ) : (
          <Empty>No run here has a cost.</Empty>
        )}
      </div>
    </Card>
  );
}

/** For evals with several attempts: each run's attempts, finished in so many ticks or reaching some value. */
export function AttemptsCard({ e, ranked, legend }: { e: Eval; ranked: RankedVariant[]; legend: LegendState }) {
  const navigate = useNavigate();
  const runs = ranked.filter(r => legend.visible(r.variant.key)).flatMap(r => r.runs);
  const attempts = Array.from({ length: e.attempts }, (_, i) => i + 1);
  return (
    <Card title="Attempts" subtitle="Ticks to finish each attempt" flush className="flex flex-col">
      <div className="table-inset inset-from-card scrollbar-thin overflow-x-auto">
        <table className="min-w-full divide-y divide-border text-sm">
          <thead>
            <tr className="text-xs text-muted">
              <th scope="col" className="py-2.5 pr-3 pl-table-inset text-left font-medium">
                <span className="sr-only">Run</span>
              </th>
              {attempts.map(a => (
                <th key={a} scope="col" className="w-24 px-3 py-2.5 text-right font-medium whitespace-nowrap last:pr-table-inset">
                  {a}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {runs.map(run => (
              <tr
                key={run.id}
                onClick={() => navigate({ to: '/runs/$runId', params: { runId: run.id }, search: {} as never })}
                className="cursor-pointer transition-colors hover:bg-background"
              >
                <td className="py-2.5 pr-3 pl-table-inset whitespace-nowrap">
                  <span className="inline-flex items-center gap-2">
                    <VariantLabel run={run} compact />
                    <span className="text-muted tabular-nums">{run.epoch}</span>
                  </span>
                </td>
                {attempts.map(a => {
                  const result = run.attempt_results?.find(x => x.attempt === a);
                  return (
                    <td key={a} className="px-3 py-2.5 text-right whitespace-nowrap tabular-nums last:pr-table-inset">
                      {result == null ? null : result.ticks != null ? (
                        <span
                          className="inline-flex items-center gap-1.5"
                          title={`Finished attempt ${a} in ${formatInt(result.ticks)} ticks`}
                        >
                          <span aria-hidden className="size-2 rounded-full bg-success" />
                          {formatInt(result.ticks)}
                        </span>
                      ) : (
                        <span
                          className="inline-flex items-center gap-1.5 text-muted"
                          title={`Not finished: ${e.measure.toLowerCase()} ${formatInt(result.best_value)}`}
                        >
                          <span aria-hidden className="size-2 rounded-full border-2 border-danger" />
                          {capitalize(e.measure.replace(/^Quest /, ''))} {formatInt(result.best_value)}
                        </span>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
