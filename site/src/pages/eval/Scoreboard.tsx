/**
 * The eval's first view: who won, and whether anyone did the task. One bar per pairing in the
 * eval's ranking (the same order as every leaderboard), the winner at the top with a trophy; the
 * bar runs to the pairing's median result and every run sits on it as a dot, filled if it finished
 * the task and hollow if it didn't.
 *
 * On an eval with a target the axis has two parts so a longer bar is always better: on the left how
 * far a run got (its stage of the target), then, past the finish line, how fast it finished (time to
 * finish, the budget at the line and no time at the right). The same order as the site's score: any
 * finish beats any miss, a faster finish a slower one. On an eval without a target the axis is the
 * amount, linear or log (`?scale=`). Static: the race is its own tab.
 */

import { useMemo } from 'react';
import { Link, useNavigate } from '@tanstack/react-router';
import { CartesianGrid, Scatter, ScatterChart, XAxis, YAxis, usePlotArea, useXAxisScale, useYAxisScale } from 'recharts';
import { TrophyIcon } from 'lucide-react';
import { ChartTooltip } from '@/components/ui/chart';
import { ChartFrame, chartMargin, gridProps, KeyLegend, logAxisProps, SeriesLabel, xAxisProps, Y_AXIS_WIDTH } from '@/components/charts';
import type { Eval, Run } from '@/data/types';
import { extraLabelWidth, variantSeries, type SeriesSpec } from '@/lib/chartSeries';
import { formatAxisNumber, formatClock, formatCost, formatInt } from '@/lib/format';
import { FADED_OPACITY, setHovered } from '@/lib/hover';
import { logRange } from '@/lib/logAxis';
import type { LegendState } from '@/lib/legend';
import { evalSlug } from '@/lib/evals';
import { modelSlug, type SeriesColor } from '@/lib/series';
import { endedWord, resultText, resultValue } from '@/lib/runResult';
import { median } from '@/lib/stats';
import { useWidth } from '@/lib/useWidth';
import { cn } from '@/lib/utils';
import { labelWidth, roundMax, roundTicks } from './chartBits';
import { PointTooltip } from './Cuts';
import { faded, useLit } from './lit';
import { rankVariants, type RankedVariant } from './model';

export type Scale = 'linear' | 'log';

/** Share of the axis for how far a run got; the rest is how fast a finished run finished. */
const STAGES = 0.4;
/** Room at the right for each row's result. */
const RESULT_WIDTH = 72;
/** The trophy's room before the winner's label. */
const TROPHY = 20;

interface Dot {
  run: Run;
  row: number;
  x: number;
  y: number;
  filled: boolean;
}

interface Row {
  r: RankedVariant;
  spec: SeriesSpec;
  bar: number;
  result: string;
  /** The exact result, on hover, when `result` is compact */
  exact?: string;
}

/** The key's dots: any pairing's, in the chrome's colour */
const NEUTRAL: SeriesColor = {
  token: '--muted-foreground',
  swatchClassName: 'bg-muted-foreground',
  borderClassName: 'border-muted-foreground',
  fillClassName: 'fill-muted-foreground',
};

const gameTime = (e: Eval, ticks: number): string => formatClock((ticks * e.tick_ms) / 1000);

/** A run's place on a target eval's two-part axis, 0 to 1. */
function targetPosition(e: Eval, run: Run): number {
  if (run.success && run.ticks != null) return STAGES + (1 - STAGES) * (1 - Math.min(1, run.ticks / e.budget_ticks));
  return STAGES * Math.min(1, Math.max(0, (resultValue(run) ?? 0) / e.target!));
}

/** A row's dots spread a little up and down by epoch, so runs with the same result don't hide each other. */
const spread = (i: number, n: number, room: number): number => (n < 2 ? 0 : (i - (n - 1) / 2) * Math.min(room, (room * 2) / (n - 1)));

/** Each row's band and, on an eval with a target, the finish zone behind them. */
function Bars({ rows, lo, finishAt, narrow, lit, e }: { rows: Row[]; lo: number; finishAt: number | null; narrow: boolean; lit: string | null; e: Eval }) {
  const plot = usePlotArea();
  const x = useXAxisScale();
  const y = useYAxisScale();
  if (!plot || !x || !y) return null;
  const band = narrow ? 12 : 24;
  const x0 = Number(x(lo));
  return (
    <g>
      {finishAt != null && <rect x={Number(x(finishAt))} y={plot.y} width={plot.x + plot.width - Number(x(finishAt))} height={plot.height} className="fill-muted" />}
      {rows.map((row, i) => {
        const cy = Number(y(i)) + (narrow ? 8 : 0);
        const fade = faded(lit, row.spec.id);
        return (
          <rect
            key={row.spec.key}
            x={x0}
            y={cy - band / 2}
            width={Math.max(0, Number(x(row.bar)) - x0)}
            height={band}
            rx={4}
            fill={row.spec.color}
            fillOpacity={(fade ? FADED_OPACITY : 1) * 0.3}
            className="transition-[fill-opacity] duration-150"
            onMouseEnter={() => setHovered(row.spec.id)}
            onMouseLeave={() => setHovered(undefined)}
          />
        );
      })}
      {narrow &&
        // A phone has no gutter: each row's name and result sit on a line above its bar
        rows.map((row, i) => (
          <foreignObject key={row.spec.key} x={plot.x} y={Number(y(i)) - 20} width={plot.width} height={18}>
            <RowLabel row={row} e={e} winner={i === 0 && isWinner(e, row)} lit={lit} withResult />
          </foreignObject>
        ))}
    </g>
  );
}

/** Each row's result in a column at the right of the plot. */
function Results({ rows, lit, winner }: { rows: Row[]; lit: string | null; winner: boolean }) {
  const plot = usePlotArea();
  const y = useYAxisScale();
  if (!plot || !y) return null;
  return (
    <g>
      {rows.map((row, i) => (
        <foreignObject key={row.spec.key} x={plot.x + plot.width} y={Number(y(i)) - 10} width={RESULT_WIDTH} height={20}>
          <div
            className={cn('flex h-full items-center justify-end text-xs tabular-nums transition-opacity duration-150', i === 0 && winner && 'font-medium')}
            style={{ opacity: faded(lit, row.spec.id) ? FADED_OPACITY : 1 }}
            title={row.exact}
          >
            {row.result}
          </div>
        </foreignObject>
      ))}
    </g>
  );
}

/** The winner: the top row, if it finished at all on an eval with a target. */
const isWinner = (e: Eval, row: Row): boolean => e.target == null || row.r.finished > 0;

/** A row's name (opening the model's page on this eval at its level and harness), the winner's with a trophy. */
function RowLabel({ row, e, winner, lit, withResult }: { row: Row; e: Eval; winner: boolean; lit: string | null; withResult?: boolean }) {
  const v = row.r.variant;
  return (
    <div
      className={cn('flex h-full min-w-0 items-center gap-1 text-xs transition-opacity duration-150', withResult ? 'justify-between' : 'justify-end')}
      style={{ opacity: faded(lit, row.spec.id) ? FADED_OPACITY : 1 }}
      onMouseEnter={() => setHovered(row.spec.id)}
      onMouseLeave={() => setHovered(undefined)}
    >
      <Link
        to="/evals/$evalId/$model"
        params={{ evalId: evalSlug(e.id), model: modelSlug(v.model) }}
        search={{ level: [v.thinking], harness: [v.agent] } as never}
        className={cn('flex min-w-0 items-center gap-1 rounded-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/50', winner && 'font-medium')}
      >
        {winner && <TrophyIcon aria-label="Winner" className="size-3.5 shrink-0" />}
        <SeriesLabel series={row.spec} size={14} />
      </Link>
      {withResult && (
        <span className="shrink-0 tabular-nums" title={row.exact}>
          {row.result}
        </span>
      )}
    </div>
  );
}

function LabelTick({ x, y, payload, rows, e, width, lit }: { x?: number; y?: number; payload?: { value: number }; rows: Row[]; e: Eval; width: number; lit: string | null }) {
  const i = payload?.value ?? -1;
  const row = rows[i];
  if (!row || x == null || y == null) return null;
  return (
    <foreignObject x={x - width} y={y - 11} width={width - 4} height={22}>
      <RowLabel row={row} e={e} winner={i === 0 && isWinner(e, row)} lit={lit} />
    </foreignObject>
  );
}

/** The dots' key, for the card's header: a long ranking would push a key under the chart off the screen. */
export const ScoreboardKey = () => (
  <KeyLegend
    className="pt-0"
    items={[
      { label: 'Finished', symbol: 'circle', color: NEUTRAL },
      { label: "Didn't finish", hollow: true },
    ]}
  />
);

/** Whether the eval's amounts span enough decades to offer a log scale. */
export function offersLog(e: Eval, runs: Run[]): boolean {
  if (e.target != null) return false;
  const range = logRange(runs.map(r => resultValue(r) ?? 0));
  return range != null && range[1] / range[0] >= 100;
}

export function Scoreboard({ e, runs, legend, scale }: { e: Eval; runs: Run[]; legend: LegendState; scale: Scale }) {
  const navigate = useNavigate();
  const lit = useLit(legend.focus);
  const [ref, width] = useWidth();
  const narrow = width > 0 && width < 640;
  const target = e.target != null;

  const ranked = useMemo(() => rankVariants(e, runs, 'ticks').filter(r => legend.visible(r.variant.key)), [e, runs, legend]);
  const values = useMemo(() => runs.map(r => resultValue(r) ?? 0), [runs]);
  // Log only where the amounts span decades; a zero sits at the axis's start
  const range = logRange(values);
  const log = offersLog(e, runs) && scale === 'log';
  const max = target ? 1 : roundMax(Math.max(1, ...values));
  const lo = log ? range![0] : 0;
  const position = (run: Run): number => (target ? targetPosition(e, run) : Math.max(lo, resultValue(run) ?? 0));

  const { rows, dots } = useMemo(() => {
    const rows: Row[] = ranked.map(r => {
      const times = r.runs.filter(run => run.success && run.ticks != null).map(run => run.ticks!);
      const m = r.medianResult ?? 0;
      return {
        r,
        spec: variantSeries(r.variant),
        bar: median(r.runs.map(position)) ?? lo,
        result: target ? (times.length ? gameTime(e, median(times)!) : `${formatInt(m)} of ${formatInt(e.target)}`) : formatAxisNumber(m),
        exact: target ? undefined : formatInt(m),
      };
    });
    const room = narrow ? 0.1 : 0.14;
    const dots: Dot[] = rows.flatMap((row, i) =>
      row.r.runs.map((run, k) => ({ run, row: i, x: position(run), y: i + (narrow ? 0.18 : 0) + spread(k, row.r.runs.length, room), filled: Boolean(run.success) || !target }))
    );
    return { rows, dots };
    // position reads e, lo and target, all in the deps through their sources
  }, [ranked, narrow, e, lo, target]);

  // Two-part ticks on a target eval: the stages, then whole hours of time to finish
  const budgetSeconds = (e.budget_ticks * e.tick_ms) / 1000;
  const timeTicks = target ? roundTicks(budgetSeconds, 'seconds', 4).filter(s => s < budgetSeconds) : [];
  const xTicks = target
    ? [...roundTicks(e.target!, 'count', 5).filter(s => s < e.target!).map(s => (STAGES * s) / e.target!), STAGES, ...timeTicks.map(s => STAGES + (1 - STAGES) * (1 - s / budgetSeconds)).reverse()]
    : roundTicks(max);
  const formatTargetTick = (v: number): string => {
    if (Math.abs(v - STAGES) < 1e-9) return 'Finished';
    if (v < STAGES) return formatInt(Math.round((v / STAGES) * e.target!));
    return formatClock((1 - (v - STAGES) / (1 - STAGES)) * budgetSeconds);
  };
  const xAxis = log
    ? logAxisProps(values, formatAxisNumber)!
    : xAxisProps({ domain: [0, max], ticks: xTicks, format: target ? formatTargetTick : formatAxisNumber });

  const labelRoom = Math.max(Y_AXIS_WIDTH, ...rows.map(r => labelWidth(r.spec.label) + extraLabelWidth(r.spec) + 8)) + TROPHY;
  const margin = { ...chartMargin(), right: narrow ? 12 : RESULT_WIDTH, left: 0 };

  return (
    <div ref={ref} className="min-w-0">
      {width > 0 && (
        <ChartFrame
          config={{}}
          rows={rows.length}
          empty={rows.length ? undefined : 'No pairing shown.'}
        >
          <ScatterChart margin={margin}>
            <CartesianGrid {...gridProps} vertical horizontal={false} />
            {/* On top: a ranking runs long, and the first screen needs the axis */}
            <XAxis {...xAxis} dataKey="x" type="number" orientation="top" padding={{ left: 8 }} />
            <YAxis
              dataKey="y"
              type="number"
              domain={[-0.5, rows.length - 0.5]}
              ticks={rows.map((_, i) => i)}
              reversed
              width={narrow ? 0 : labelRoom}
              hide={narrow}
              axisLine={false}
              tickLine={false}
              interval={0}
              tick={<LabelTick rows={rows} e={e} width={labelRoom} lit={lit} />}
            />
            <Bars rows={rows} lo={lo} finishAt={target ? STAGES : null} narrow={narrow} lit={lit} e={e} />
            <ChartTooltip
              cursor={false}
              content={
                <PointTooltip
                  rows={d => {
                    const dot = d as Dot | undefined;
                    if (!dot?.run) return null;
                    return {
                      title: <SeriesLabel series={rows[dot.row].spec} />,
                      values: [
                        ['Epoch', formatInt(dot.run.epoch)],
                        ['Result', resultText(dot.run, e)],
                        ...(target ? [['Ended', endedWord(dot.run.ended_by)] as [string, string]] : []),
                        ['Cost', formatCost(dot.run.cost)],
                      ],
                    };
                  }}
                />
              }
            />
            <Scatter
              data={dots}
              isAnimationActive={false}
              className="cursor-pointer"
              onClick={(d: { payload?: Dot }) => d.payload?.run && navigate({ to: '/runs/$runId', params: { runId: d.payload.run.id }, search: {} as never })}
              shape={(props: { cx?: number; cy?: number; payload?: Dot }) => {
                const d = props.payload;
                if (props.cx == null || props.cy == null || !d) return <g />;
                const spec = rows[d.row].spec;
                return (
                  <circle
                    cx={props.cx}
                    cy={props.cy}
                    r={d.filled ? 5 : 4}
                    fill={d.filled ? spec.color : 'var(--card)'}
                    stroke={d.filled ? 'var(--card)' : spec.color}
                    strokeWidth={d.filled ? 1 : 2}
                    opacity={faded(lit, spec.id) ? FADED_OPACITY : 1}
                    className="transition-opacity duration-150"
                    onMouseEnter={() => setHovered(spec.id)}
                    onMouseLeave={() => setHovered(undefined)}
                  />
                );
              }}
            />
            {!narrow && <Results rows={rows} lit={lit} winner={rows.length > 0 && isWinner(e, rows[0])} />}
          </ScatterChart>
        </ChartFrame>
      )}
    </div>
  );
}
