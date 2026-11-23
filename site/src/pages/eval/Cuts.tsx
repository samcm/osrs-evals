/** What each variant spent for its result (a Pareto), how soon runs finished (a success CDF), and attempts. */

import { useMemo, type JSX } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { createColumnHelper, type ColumnDef } from '@tanstack/react-table';
import clsx from 'clsx';
import { Tip } from '@/components/bits';
import { DataTable } from '@/components/DataTable';
import { VariantLabel } from '@/components/marks';
import {
  ChartFrame,
  SeriesLabel,
  SeriesLegend,
  XYChart,
  logAxis,
  type AxisSpec,
  type ChartLine,
  type ChartPoints,
  type Plot,
} from '@/components/Charts';
import type { Eval, Run } from '@/data/types';
import { extraLabelWidth, variantSeries, type SeriesSpec } from '@/lib/chartSeries';
import { variantKey } from '@/lib/series';
import { capitalize, formatInt } from '@/lib/format';
import { FADED_OPACITY } from '@/lib/hover';
import { faded, useLit } from './lit';
import type { LegendState } from '@/lib/legend';
import { median, paretoFrontier } from '@/lib/stats';
import { formatTick, formatX, labelWidth, placePointLabels, roundMax, roundTicks } from './chartBits';
import type { CdfX, ParetoX, RankedVariant } from './model';
import { useWidth } from '@/lib/useWidth';

const spendOf = (run: Run, px: ParetoX): number | null => {
  if (px === 'cost') return run.cost;
  if (px === 'seconds') return run.game_seconds;
  return run.game_ticks;
};

const PX_NAME: Record<ParetoX, string> = {
  cost: 'Median cost per run',
  seconds: 'Median time per run',
  ticks: 'Median ticks per run',
};

interface Point {
  r: RankedVariant;
  spec: SeriesSpec;
  x: number;
  y: number;
  frontier: boolean;
}

/** Labels beside the points, placed so they clear each other, the points and the plot's edges. */
function PointLabels({ points, plot, lit }: { points: Point[]; plot: Plot; lit: string | null }): JSX.Element {
  // The frontier's labels first; any other point's only where it fits
  const placed = points.map(p => ({
    p,
    px: plot.x(p.x),
    py: plot.y(p.y),
    width: labelWidth(p.spec.label) + extraLabelWidth(p.spec),
    optional: !p.frontier,
  }));
  // Labels may run into the chart's right margin, not past its edges
  const positions = placePointLabels(placed, {
    x: 0,
    y: plot.top,
    width: plot.left + plot.width + 16,
    height: plot.height,
  });
  return (
    <>
      {placed.map((q, i) => {
        const at = positions[i];
        if (!at) return null;
        const [pos, [left, top]] = at;
        const end = pos.endsWith('left');
        return (
          <div
            key={q.p.spec.key}
            aria-hidden
            className={clsx(
              'pointer-events-none absolute flex h-5 items-center text-xs transition-opacity',
              q.p.frontier ? 'text-foreground' : 'text-muted',
              end && 'justify-end'
            )}
            style={{
              left: end ? left - 8 : left,
              top,
              width: q.width + 8,
              opacity: faded(lit, q.p.spec.id) ? FADED_OPACITY : 1,
            }}
          >
            <SeriesLabel series={q.p.spec} size={14} />
          </div>
        );
      })}
    </>
  );
}

/** Each variant's median spend per run against its finish rate (or median result), with the frontier under the points. */
export function ParetoChart({
  e,
  ranked,
  px,
  legend,
}: {
  e: Eval;
  ranked: RankedVariant[];
  px: ParetoX;
  legend: LegendState;
}): JSX.Element {
  const lit = useLit(legend.focus);
  const target = e.target != null;
  const log = px === 'cost';

  const { points, left } = useMemo(() => {
    const all = ranked.map(r => ({
      r,
      spec: variantSeries(r.variant),
      x: median(r.runs.map(run => spendOf(run, px))),
      y: target ? r.finished / r.runs.length : (r.medianResult ?? 0),
      frontier: false,
    }));
    const drawable = all.filter((p): p is Point => p.x != null && (!log || p.x > 0));
    const frontier = new Set(
      paretoFrontier(
        drawable,
        p => p.x,
        p => p.y
      )
    );
    return {
      points: drawable.map(p => ({ ...p, frontier: frontier.has(p) })),
      left: all.filter(p => !drawable.includes(p as Point)),
    };
  }, [log, px, ranked, target]);

  const yMax = target ? 1 : roundMax(Math.max(1, ...points.map(p => p.y)));
  const xMax = log ? 0 : roundMax(Math.max(1, ...points.map(p => p.x)), px === 'seconds' ? 'seconds' : 'count');
  const xAxis: AxisSpec | null = log
    ? logAxis(
        points.map(p => p.x),
        v => formatTick(v, 'cost')
      )
    : {
        domain: [0, xMax],
        ticks: roundTicks(xMax, px === 'seconds' ? 'seconds' : 'count'),
        format: v => formatTick(v, px),
      };
  const shown = points.filter(p => legend.visible(p.spec.id));
  const frontier = points.filter(p => p.frontier).map((p): [number, number] => [p.x, p.y]);
  const [ref, width] = useWidth();
  const narrow = width > 0 && width < 640;

  return (
    <div ref={ref} className="flex flex-1 flex-col">
      <ChartFrame
        height="lead"
        empty={
          points.length && xAxis ? undefined : `No pairing here has a ${px === 'cost' ? 'cost' : 'value'} to place.`
        }
        // Wide, the points' labels are the key; narrow, a legend is, and the points go unlabelled
        legend={
          narrow ? <SeriesLegend series={ranked.map(r => variantSeries(r.variant))} legend={legend} /> : undefined
        }
      >
        <XYChart
          x={xAxis!}
          y={{
            domain: [0, yMax],
            ticks: target ? [0, 0.25, 0.5, 0.75, 1] : roundTicks(yMax),
            format: target ? v => `${Math.round(v * 100)}%` : formatInt,
          }}
          points={shown.map(
            (p): ChartPoints => ({ series: p.spec, points: [{ x: p.x, y: p.y, key: p.spec.key, data: p }] })
          )}
          frontier={frontier}
          lit={lit}
          pointTooltip={(point, spec) => {
            const p = point.data as Point;
            return {
              rows: [
                { series: spec, value: '' },
                { label: PX_NAME[px], value: formatX(p.x, px) },
                target
                  ? { label: 'Finished', value: `${p.r.finished} of ${p.r.runs.length}` }
                  : { label: `Median ${e.measure.toLowerCase()}`, value: formatInt(p.y) },
              ],
            };
          }}
          onPointClick={(_, spec) => legend.isolate(spec.id)}
          // The frontier always, every other point where its label fits; any point names itself on hover
          overlay={narrow ? undefined : plot => <PointLabels points={shown} plot={plot} lit={lit} />}
        />
      </ChartFrame>
      {left.length > 0 && points.length > 0 && (
        <p className="text-xs text-muted">
          {px === 'cost' ? 'No cost for' : 'Nothing to place for'} {left.map(p => p.r.variant.name).join(', ')}.
        </p>
      )}
    </div>
  );
}

const finishOf = (run: Run, cx: CdfX): number | null =>
  cx === 'ticks' ? run.ticks : cx === 'seconds' ? run.seconds : run.cost;

/** Share of each variant's runs finished within a budget of ticks, time or cost. Unfinished runs never count. */
export function CdfChart({
  e,
  ranked,
  cx,
  legend,
}: {
  e: Eval;
  ranked: RankedVariant[];
  cx: CdfX;
  legend: LegendState;
}): JSX.Element {
  const lit = useLit(legend.focus);
  const navigate = useNavigate();
  const chart = useMemo(() => {
    const shown = ranked.filter(r => legend.visible(r.variant.key));
    const costAxis =
      cx === 'cost'
        ? logAxis(
            shown.flatMap(r => r.runs.map(run => run.cost)),
            v => formatTick(v, 'cost')
          )
        : null;
    let lo = 0;
    let hi: number;
    if (cx === 'ticks') hi = e.budget_ticks;
    else if (cx === 'seconds') hi = (e.budget_ticks * e.tick_ms) / 1000;
    else if (costAxis) [lo, hi] = costAxis.domain;
    else return null;
    const lines: ChartLine[] = [];
    const finishes: ChartPoints[] = [];
    for (const r of shown) {
      const spec = variantSeries(r.variant);
      const eligible = r.runs.filter(run => cx !== 'cost' || run.cost != null);
      const finished = eligible
        .filter(run => run.success)
        .map(run => ({ run, x: Math.min(hi, Math.max(lo, finishOf(run, cx) ?? lo)) }))
        .sort((a, b) => a.x - b.x);
      const share = (k: number): number => (eligible.length ? k / eligible.length : 0);
      // A step up at each finish, held to the axis' end
      lines.push({
        series: spec,
        points: [
          [lo, 0],
          ...finished.map((f, i): [number, number] => [f.x, share(i + 1)]),
          [hi, share(finished.length)],
        ],
      });
      // Each finish a dot that opens its run
      finishes.push({
        series: spec,
        size: 6,
        points: finished.map((f, i) => ({ x: f.x, y: share(i + 1), key: f.run.id })),
      });
    }
    const xAxis: AxisSpec = costAxis
      ? { ...costAxis, formatValue: v => formatX(v, cx) }
      : {
          domain: [lo, hi],
          ticks: roundTicks(hi, cx),
          format: v => formatTick(v, cx),
          formatValue: v => formatX(v, cx),
        };
    return { lines, finishes, xAxis };
  }, [cx, e.budget_ticks, e.tick_ms, ranked, legend]);

  return (
    <div className="flex flex-1 flex-col">
      <ChartFrame height="lead" empty={chart ? undefined : 'No run here has a cost.'}>
        <XYChart
          x={chart?.xAxis ?? { domain: [0, 1] }}
          y={{ domain: [0, 1], ticks: [0, 0.25, 0.5, 0.75, 1], format: v => formatX(v, 'share') }}
          lines={chart?.lines}
          points={chart?.finishes}
          lit={lit}
          onPointClick={point =>
            point.key && navigate({ to: '/runs/$runId', params: { runId: point.key }, search: {} as never })
          }
        />
      </ChartFrame>
    </div>
  );
}

interface AttemptRow {
  run: Run;
}

const col = createColumnHelper<AttemptRow>();

/** For evals with several attempts: each run's attempts, finished in so many ticks or reaching some value. */
export function AttemptsTable({
  e,
  ranked,
  legend,
}: {
  e: Eval;
  ranked: RankedVariant[];
  legend: LegendState;
}): JSX.Element {
  const navigate = useNavigate();
  const rows = ranked.filter(r => legend.visible(r.variant.key)).flatMap(r => r.runs.map(run => ({ run })));
  const columns = useMemo(() => {
    const reached = capitalize(e.measure.replace(/^Quest /, ''));
    return [
      col.display({
        id: 'variant',
        header: 'Pairing',
        cell: ({ row }) => <VariantLabel run={row.original.run} compact />,
      }),
      col.accessor(r => r.run.epoch, { id: 'epoch', header: 'Epoch', meta: { numeric: true } }),
      ...Array.from({ length: e.attempts }, (_, i) =>
        col.display({
          id: `a${i + 1}`,
          header: String(i + 1),
          meta: { numeric: true },
          cell: ({ row }) => {
            const result = row.original.run.attempt_results?.find(a => a.attempt === i + 1);
            if (!result) return null;
            if (result.ticks != null) {
              return (
                <Tip content={`Finished attempt ${i + 1} in ${formatInt(result.ticks)} ticks`}>
                  <span className="inline-flex items-center gap-1.5">
                    <span aria-hidden className="size-2 rounded-full bg-success" />
                    {formatInt(result.ticks)}
                  </span>
                </Tip>
              );
            }
            return (
              <Tip content={`Not finished: ${e.measure.toLowerCase()} ${formatInt(result.best_value)}`}>
                <span className="inline-flex items-center gap-1.5 text-muted">
                  <span aria-hidden className="size-2 rounded-full border-2 border-danger" />
                  {reached} {formatInt(result.best_value)}
                </span>
              </Tip>
            );
          },
        })
      ),
    ] as ColumnDef<AttemptRow, unknown>[];
  }, [e.attempts, e.measure]);

  return (
    <>
      <DataTable
        data={rows}
        columns={columns}
        getRowId={r => r.run.id}
        onRowClick={r => navigate({ to: '/runs/$runId', params: { runId: r.run.id }, search: {} as never })}
        hoverId={r => variantKey(r.run)}
      />
    </>
  );
}
