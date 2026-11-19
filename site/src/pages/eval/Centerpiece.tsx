/**
 * The eval's centrepiece, full width at the top of the overview: every run together in the game on
 * one playhead. Each racing run is a pin on the world map with its trail, and a lane under the
 * playback bar shows how far along it is, so you watch them diverge as you play or scrub. One run
 * per model + harness pairing (its median or best run) or every run, from the page's `agg`.
 */

import { useMemo, useRef } from 'react';
import { useQueries } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Slider } from '@/components/ui/slider';
import { runQuery } from '@/data/queries';
import type { EvalRuns, PathPoint } from '@/data/types';
import { formatInt } from '@/lib/format';
import { setHovered } from '@/lib/hover';
import { useLit } from './lit';
import type { LegendState } from '@/lib/legend';
import type { MapView } from '@/lib/map';
import { useSearchUpdate } from '@/lib/search';
import { useWidth } from '@/lib/useWidth';
import { niceMax, type Agg, type RunCurve } from './model';
import { pause, play, seek, useEvalPlayhead } from './playhead';
import { finalOrder, standings } from './centerpiece/race';
import { marksOf, PIN, RaceMap, type PlacedPin, type Track } from './centerpiece/RaceMap';
import { Standings } from './centerpiece/Standings';

/** Runs whose detail (fine path, quests) is loaded; past this the eval's coarse paths do. */
const DETAILED = 16;

export function Centerpiece({
  curves,
  grid,
  legend,
  view,
  t,
  maxTick,
  agg,
}: {
  /** The runs to race, picked by the page */
  curves: RunCurve[];
  grid: EvalRuns | undefined;
  legend: LegendState;
  view: MapView | undefined;
  t: number | undefined;
  maxTick: number;
  agg: Agg;
}) {
  const update = useSearchUpdate();
  const [ref, width] = useWidth();
  const lit = useLit(legend.focus);
  const placed = useRef<PlacedPin[]>([]);

  // The page picks the runs (every run, or each pairing's median or best)
  const runners = curves;
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
  // The map takes half its width in height, within what a screen can show beside the rest
  const height = Math.round(Math.min(520, Math.max(300, width * 0.48)));

  /** The pin under the pointer lights its pairing everywhere. */
  const onPointerMove = (event: React.PointerEvent<HTMLDivElement>): void => {
    if (event.buttons) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    const hit = placed.current.findLast(p => Math.hypot(p.x - x, p.y - y) <= PIN + 2);
    setHovered(hit?.key);
  };

  return (
    <section className="flex flex-col gap-stack" aria-label="Every run in the game">
      <div ref={ref} className="relative" onPointerMove={onPointerMove} onPointerLeave={() => setHovered(undefined)}>
        {width === 0 || !grid ? (
          <Skeleton className="w-full rounded-sm" style={{ height: width ? height : 360 }} />
        ) : (
          <RaceMap
            tracks={tracks}
            tick={head.tick}
            trail={span * 0.03}
            lit={lit}
            placed={placed}
            view={view}
            onViewChange={v => update({ map: v })}
            height={height}
          />
        )}
      </div>
      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          size="icon-sm"
          onClick={() => (head.playing ? pause() : play())}
          aria-label={head.playing ? 'Pause' : 'Play'}
          title={head.playing ? 'Pause' : 'Play'}
        >
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
      </div>
      <Standings rows={rows} max={top} tick={head.tick} showEpoch={agg === 'runs'} lit={lit} />
    </section>
  );
}
