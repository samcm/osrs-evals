/**
 * The eval's centrepiece: every run together in the game on one playhead. Each racing run is a pin
 * on the world map with its trail, and a lane below that shows how far along it is, so you watch
 * them diverge as you play or scrub. One run per model + harness pairing (its median or best run),
 * or every run.
 */

import { useMemo } from 'react';
import { getRouteApi } from '@tanstack/react-router';
import { useQueries } from '@tanstack/react-query';
import { Segmented } from '@/components/bits';
import { SeriesLegend } from '@/components/charts';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Slider } from '@/components/ui/slider';
import { runQuery } from '@/data/queries';
import type { EvalRuns, PathPoint } from '@/data/types';
import { variantSeries } from '@/lib/chartSeries';
import { formatInt } from '@/lib/format';
import type { LegendState } from '@/lib/legend';
import type { MapView } from '@/lib/map';
import { useSearchUpdate } from '@/lib/search';
import { niceMax, type RunCurve } from './model';
import { pause, play, seek, useEvalPlayhead } from './playhead';
import { finalOrder, pickRunners, standings, type Pick } from './centerpiece/race';
import { marksOf, RaceMap, type Track } from './centerpiece/RaceMap';
import { Standings } from './centerpiece/Standings';

const route = getRouteApi('/evals/$evalId');

/** Runs whose detail (fine path, quests) is loaded; past this the eval's coarse paths do. */
const DETAILED = 16;

const PICKS: { value: Pick; label: string; title: string }[] = [
  { value: 'median', label: 'Median', title: "Each pairing's median run" },
  { value: 'best', label: 'Best', title: "Each pairing's best run" },
  { value: 'all', label: 'All', title: 'Every run' },
];

export function Centerpiece({
  curves,
  grid,
  legend,
  view,
  t,
  maxTick,
}: {
  curves: RunCurve[];
  grid: EvalRuns | undefined;
  legend: LegendState;
  view: MapView | undefined;
  t: number | undefined;
  maxTick: number;
}) {
  const { pick } = route.useSearch();
  const update = useSearchUpdate();

  const shown = useMemo(() => curves.filter(cv => legend.visible(cv.variant.key)), [curves, legend]);
  const runners = useMemo(() => pickRunners(shown, pick), [shown, pick]);
  const order = useMemo(() => finalOrder(runners), [runners]);
  const span = Math.max(1, Math.min(maxTick, Math.max(0, ...runners.map(cv => cv.points[cv.points.length - 1]?.tick ?? 0))));
  const head = useEvalPlayhead(t, span, tick => update({ t: tick }));

  const details = useQueries({ queries: runners.slice(0, DETAILED).map(cv => runQuery(cv.run.id)) });
  const loadedKey = details.map(d => (d.data ? '1' : '0')).join('');
  const base = useMemo(
    () =>
      runners.map((curve, i) => {
        const detail = details[i]?.data;
        const points = (detail?.path ?? grid?.runs[curve.run.id]?.path ?? []) as readonly PathPoint[];
        const step = detail ? 10 : (grid?.path_every ?? 50);
        return { curve, points, step, marks: marksOf(detail?.events, points, step) };
      }),
    // details is a new array every render; what is loaded is what matters
    [runners, grid, loadedKey]
  );

  const rows = useMemo(() => standings(runners, head.tick, order), [runners, head.tick, order]);
  const tracks = useMemo<Track[]>(() => base.map((b, i) => ({ ...b, rank: rows[i].rank })), [base, rows]);
  const target = runners[0]?.run.target ?? null;
  const top = target ?? niceMax(Math.max(1, ...runners.map(cv => Math.max(...cv.points.map(p => p.value)))));
  const variants = useMemo(() => [...new Map(curves.map(cv => [cv.variant.key, variantSeries(cv.run)])).values()].sort((a, b) => a.name.localeCompare(b.name)), [curves]);

  const toggle = (): void => (head.playing ? pause() : play());

  return (
    <Card>
      <CardContent className="flex flex-col gap-4">
        <RaceMap tracks={tracks} tick={head.tick} trail={span * 0.03} view={view} onViewChange={v => update({ map: v })} height={480} />
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <Button variant="outline" size="icon-sm" onClick={toggle} aria-label={head.playing ? 'Pause' : 'Play'} title={head.playing ? 'Pause' : 'Play'}>
            <svg aria-hidden viewBox="0 0 10 10" className="fill-current">
              {head.playing ? <path d="M1.5 1h2.5v8H1.5zM6 1h2.5v8H6z" /> : <path d="M2 1l7 4-7 4z" />}
            </svg>
          </Button>
          <Slider
            aria-label="Game tick"
            min={0}
            max={span}
            step={1}
            value={[Math.round(head.tick)]}
            onValueChange={([v]) => {
              pause();
              seek(v);
            }}
            onValueCommit={([v]) => head.settle(v)}
            className="min-w-0 flex-1"
          />
          <span className="w-14 shrink-0 text-right text-xs text-muted-foreground tabular-nums" title="Game ticks">
            {formatInt(Math.round(head.tick))}
          </span>
          <Segmented label="Runs shown" value={pick} options={PICKS} onChange={v => update({ pick: v })} />
        </div>
        <Standings rows={rows} max={top} tick={head.tick} showEpoch={pick === 'all'} />
        <SeriesLegend series={variants} legend={legend} />
      </CardContent>
    </Card>
  );
}
