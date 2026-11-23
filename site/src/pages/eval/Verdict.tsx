/**
 * The eval page's first view: the answer, then the one chart that explains it. On an eval with a
 * target, how many runs finished and the pairing ranked first (most finished, then the fastest
 * median finish), how far ahead of the next; on an open-ended eval, the best result and who got it.
 * Under it every run's result against its cost, finished runs apart from the rest, the winner ringed.
 */

import { useMemo } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { ReferenceArea, Scatter, ScatterChart, CartesianGrid, Symbols, XAxis, YAxis, usePlotArea, useXAxisScale, useYAxisScale } from 'recharts';
import { TrophyIcon } from 'lucide-react';
import { ChartTooltip } from '@/components/ui/chart';
import { ChartFrame, chartMargin, logAxisProps, SeriesLabel, yAxisProps } from '@/components/charts';
import { PageSection } from '@/components/page';
import { ParamSegmented } from '@/components/bits';
import type { Eval, Run } from '@/data/types';
import { extraLabelWidth, scatterShape, variantSeries, type SeriesSpec } from '@/lib/chartSeries';
import { variantKey } from '@/lib/series';
import { formatClock, formatCost, formatDuration, formatInt } from '@/lib/format';
import { FADED_OPACITY, setHovered } from '@/lib/hover';
import type { LegendState } from '@/lib/legend';
import { useWidth } from '@/lib/useWidth';
import { cn } from '@/lib/utils';
import { formatTick, labelWidth, placePointLabels, roundMax, roundTicks } from './chartBits';
import { PointTooltip } from './Cuts';
import { faded, useLit } from './lit';
import { rankVariants, resultValue, type RankedVariant } from './model';

export type VerdictY = 'value' | 'share';

const Y_OPTIONS = [
  { value: 'value' as const, label: 'Value' },
  { value: 'share' as const, label: 'Of best', title: 'As a share of the best run' },
];

interface Point {
  run: Run;
  spec: SeriesSpec;
  x: number;
  y: number;
  done: boolean;
  /** The winner's runs are ringed */
  role: 'winner' | 'runner' | null;
  /** Each pairing's best run is labelled: the winner's and runner-up's always, the rest where they fit */
  label: 'always' | 'fits' | null;
}

/** What the view leads with: the winning pairing, its result, and the one it beat. */
interface Answer {
  winner: RankedVariant;
  runner: RankedVariant | null;
  /** The winner's result, as the eval scores it */
  result: string;
  /** How far ahead of the runner-up, in words, before the runner-up's label */
  ahead: string | null;
  /** The run each of them is labelled at */
  winnerRun: Run;
  runnerRun: Run | null;
}

const secondsOf = (e: Eval, ticks: number): number => (ticks * e.tick_ms) / 1000;
const bestRun = (runs: Run[]): Run => runs.reduce((a, b) => ((resultValue(b) ?? -Infinity) > (resultValue(a) ?? -Infinity) ? b : a));
const fastestRun = (runs: Run[]): Run => {
  const done = runs.filter(r => r.success && r.ticks != null);
  return done.length ? done.reduce((a, b) => (b.ticks! < a.ticks! ? b : a)) : bestRun(runs);
};

function answer(e: Eval, ranked: RankedVariant[]): Answer | null {
  if (ranked.length === 0) return null;
  if (e.target != null) {
    // The eval's own ranking, as every leaderboard on the site: most finished, then fastest median finish
    const [winner, runner = null] = ranked;
    const rate = (r: RankedVariant) => r.finished / r.runs.length;
    const result = winner.finished > 0 ? formatClock(secondsOf(e, winner.toFinish!)) : `${formatInt(winner.medianResult)} of ${formatInt(e.target)}`;
    let ahead: string | null = null;
    if (runner) {
      if (winner.finished > 0 && runner.finished > 0 && rate(runner) === rate(winner)) ahead = `${formatDuration(secondsOf(e, runner.toFinish! - winner.toFinish!))} ahead of`;
      else if (rate(runner) < rate(winner)) ahead = runner.finished > 0 ? `ahead of ${runner.finished} of ${runner.runs.length} for` : 'ahead of';
      else ahead = 'ahead of';
    }
    return { winner, runner, result, ahead, winnerRun: fastestRun(winner.runs), runnerRun: runner ? fastestRun(runner.runs) : null };
  }
  // Open-ended: the best result any run reached, and who reached it
  const best = (r: RankedVariant) => r.bestResult ?? -Infinity;
  const byBest = [...ranked].sort((a, b) => best(b) - best(a));
  const [winner, runner = null] = byBest;
  const margin = runner ? best(winner) - best(runner) : null;
  return {
    winner,
    runner,
    result: formatInt(winner.bestResult),
    ahead: margin != null ? (margin > 0 ? `${formatInt(margin)} more than` : 'level with') : null,
    winnerRun: bestRun(winner.runs),
    runnerRun: runner ? bestRun(runner.runs) : null,
  };
}

/** Labels beside each pairing's best run, clear of each other and the plot's edges. */
function PointLabels({ points, lit }: { points: Point[]; lit: string | null }) {
  const plot = usePlotArea();
  const x = useXAxisScale();
  const y = useYAxisScale();
  if (!plot || !x || !y) return null;
  const at = (p: Point) => ({ px: Number(x(p.x)), py: Number(y(p.y)) });
  const placed = points.filter(p => p.label).map(p => ({ p, ...at(p), width: labelWidth(p.spec.label) + extraLabelWidth(p.spec), optional: p.label === 'fits' }));
  const positions = placePointLabels(
    placed,
    { x: plot.x, y: plot.y, width: plot.width, height: plot.height },
    points.filter(p => !p.label).map(at)
  );
  return (
    <g className="pointer-events-none">
      {placed.map((q, i) => {
        const at = positions[i];
        if (!at) return null;
        const [pos, [left, top]] = at;
        return (
          <foreignObject key={q.p.run.id} x={pos.endsWith('left') ? left - 8 : left} y={top} width={q.width + 8} height={20} opacity={faded(lit, q.p.spec.id) ? FADED_OPACITY : 1}>
            <div className={cn('flex h-full items-center text-xs', q.p.role === 'winner' ? 'font-medium text-foreground' : 'text-muted-foreground', pos.endsWith('left') && 'justify-end')}>
              <SeriesLabel series={q.p.spec} size={14} />
            </div>
          </foreignObject>
        );
      })}
    </g>
  );
}

export function Verdict({ e, runs, y: yCut, legend }: { e: Eval; runs: Run[]; y: VerdictY; legend: LegendState }) {
  const navigate = useNavigate();
  const lit = useLit(legend.focus);
  const target = e.target != null;
  const ranked = useMemo(() => rankVariants(e, runs, 'ticks'), [e, runs]);
  const verdict = useMemo(() => answer(e, ranked), [e, ranked]);
  const finished = runs.filter(r => r.success).length;
  const share = !target && yCut === 'share';
  const [ref, width] = useWidth();
  const narrow = width > 0 && width < 640;

  const budget = secondsOf(e, e.budget_ticks * Math.max(1, e.attempts));
  // Runs that didn't finish sit in a band past the budget, so finished runs stand apart from them
  const band = budget * 0.22;
  const bestValue = Math.max(1, ...runs.map(r => resultValue(r) ?? 0));

  const points = useMemo<Point[]>(() => {
    if (!verdict) return [];
    // Each pairing's best run carries its label: on an eval with a target only a finished one, else the top few
    const best = new Map<string, Run>();
    for (const r of ranked) {
      const run = target ? fastestRun(r.runs) : bestRun(r.runs);
      if (!target || run.success) best.set(r.variant.key, run);
    }
    const top = new Set(
      [...best.entries()]
        .sort((a, b) => (resultValue(b[1]) ?? 0) - (resultValue(a[1]) ?? 0))
        .slice(0, 8)
        .map(([key]) => key)
    );
    return runs
      .filter(r => r.cost != null && r.cost > 0 && legend.visible(variantKey(r)))
      .map(run => {
        const done = target && !!run.success && run.ticks != null;
        const key = variantKey(run);
        const role = key === verdict.winner.variant.key ? 'winner' : key === verdict.runner?.variant.key ? 'runner' : null;
        const value = resultValue(run) ?? 0;
        return {
          run,
          spec: variantSeries(run),
          x: run.cost!,
          y: target ? (done ? secondsOf(e, run.ticks!) : budget + band * 0.62) : share ? value / bestValue : value,
          done: !target || done,
          role,
          label: run === verdict.winnerRun ? 'always' : best.get(key) === run && (target || top.has(key)) ? 'fits' : null,
        } satisfies Point;
      });
  }, [runs, ranked, legend, verdict, target, e, budget, band, share, bestValue]);
  const unpriced = runs.filter(r => !(r.cost != null && r.cost > 0)).length;

  if (!verdict) return null;
  const winnerSpec = variantSeries(verdict.winner.variant);
  const runnerSpec = verdict.runner ? variantSeries(verdict.runner.variant) : null;

  const xAxis = logAxisProps(
    points.map(p => p.x),
    v => formatTick(v, 'cost')
  );
  const yMax = target ? budget + band : share ? 1.08 : roundMax(bestValue);
  const yAxis = target
    ? yAxisProps({ domain: [0, yMax], ticks: roundTicks(budget, 'seconds', 4), format: v => (v ? formatDuration(v) : '0'), clamp: true })
    : yAxisProps({ domain: [0, yMax], ticks: share ? [0, 0.25, 0.5, 0.75, 1] : roundTicks(yMax), format: v => formatTick(v, share ? 'share' : 'count') });
  const config = Object.fromEntries(points.map(p => [p.spec.key, { label: p.spec.label, color: p.spec.color }]));
  const groups = [...points.reduce((m, p) => m.set(p.spec.key, [...(m.get(p.spec.key) ?? []), p]), new Map<string, Point[]>()).values()];

  return (
    <PageSection
      title={target ? (finished ? `${formatInt(finished)} of ${formatInt(runs.length)} runs finished` : 'No run finished') : e.measure}
      actions={!target && <ParamSegmented param="y" value={yCut} label="Scale" options={Y_OPTIONS} />}
    >
      {/* The answer: who won, by what, and over whom */}
      <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
        <TrophyIcon aria-hidden className="size-4 shrink-0 text-muted-foreground" />
        <SeriesLabel series={winnerSpec} size={16} className="font-medium" />
        <span className="text-base font-semibold tabular-nums" title={target ? (verdict.winner.finished ? 'Median time to finish' : 'Median stage reached') : 'Best run'}>
          {verdict.result}
        </span>
        {target && <span className="text-muted-foreground">{formatInt(verdict.winner.finished)} of {formatInt(verdict.winner.runs.length)} finished</span>}
        {verdict.ahead && runnerSpec && (
          <>
            <span className="text-muted-foreground">{verdict.ahead}</span>
            <SeriesLabel series={runnerSpec} size={16} className="text-muted-foreground" />
          </>
        )}
      </p>
      <div ref={ref} className="flex min-w-0 flex-col">
        <ChartFrame
          config={config}
          height="lead"
          empty={points.length && xAxis ? undefined : 'No run here has a cost.'}
        >
          <ScatterChart margin={chartMargin()}>
            <CartesianGrid vertical={false} />
            {target && (
              <ReferenceArea
                y1={budget}
                y2={yMax}
                fill="var(--muted)"
                fillOpacity={0.6}
                stroke="none"
                ifOverflow="hidden"
                label={{ value: "Didn't finish", position: 'insideTopLeft', className: 'fill-muted-foreground text-xs' }}
              />
            )}
            <XAxis {...xAxis!} dataKey="x" />
            <YAxis {...yAxis} dataKey="y" reversed={target} interval={0} />
            <ChartTooltip
              cursor={false}
              content={
                <PointTooltip
                  rows={d => {
                    const p = d as Point | undefined;
                    if (!p?.run) return null;
                    const value = resultValue(p.run);
                    return {
                      title: <SeriesLabel series={p.spec} />,
                      values: [
                        target
                          ? p.done
                            ? ['Finished in', formatClock(p.y)]
                            : ['Reached', `${formatInt(value)} of ${formatInt(e.target)}`]
                          : [e.measure, formatInt(value)],
                        ['Cost', formatCost(p.x)],
                      ],
                    };
                  }}
                />
              }
            />
            {groups.map(group => {
              const spec = group[0].spec;
              const dim = faded(lit, spec.id);
              return (
                <Scatter
                  key={spec.key}
                  data={group}
                  isAnimationActive={false}
                  className="cursor-pointer"
                  onMouseEnter={() => setHovered(spec.id)}
                  onMouseLeave={() => setHovered(undefined)}
                  onClick={(d: { payload?: Point }) => d.payload && navigate({ to: '/runs/$runId', params: { runId: d.payload.run.id }, search: {} as never })}
                  shape={(props: { cx?: number; cy?: number; payload?: Point }) => {
                    const p = props.payload;
                    if (!p || props.cx == null || props.cy == null) return <g />;
                    return (
                      <g opacity={dim ? FADED_OPACITY : 1}>
                        {p.role === 'winner' && <circle cx={props.cx} cy={props.cy} r={9} fill="none" stroke="var(--foreground)" strokeWidth={1.5} />}
                        <Symbols
                          cx={props.cx}
                          cy={props.cy}
                          type={scatterShape(spec.symbol)}
                          size={64}
                          fill={p.done ? spec.color : 'var(--card)'}
                          stroke={spec.color}
                          strokeWidth={1.5}
                        />
                      </g>
                    );
                  }}
                />
              );
            })}
            {!narrow && <PointLabels points={points} lit={lit} />}
          </ScatterChart>
        </ChartFrame>
        {unpriced > 0 && <p className="text-xs text-muted-foreground">No cost for {formatInt(unpriced)} runs.</p>}
      </div>
    </PageSection>
  );
}
