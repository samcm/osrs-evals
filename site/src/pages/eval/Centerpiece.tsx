/**
 * The eval's centrepiece at the top of the overview: every run together in the game on one
 * playhead. The world map takes most of the width, each racing run a pin with its trail, in a view
 * fitted once to where all the eval's runs went; beside it (under it on a phone) the playback bar
 * and a lane per run with how far along it is, the eval's events it has had and what it was doing,
 * so you watch them diverge as you play or scrub. One run per pairing (its median or best run) or
 * every run, from the page's `agg`.
 */

import { useMemo, useRef } from 'react';
import { useQueries } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
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
import { laneMarks, laneStages, statusAt } from './centerpiece/lanes';
import { marksOf, pathBounds, PIN, RaceMap, type PlacedPin, type Track } from './centerpiece/RaceMap';
import { Standings, type Lane } from './centerpiece/Standings';

/** Runs whose detail (fine path, events, turns) is loaded; past this the eval's coarse paths do. */
const DETAILED = 24;
/** Width at which the map and the lanes sit side by side (Tailwind's lg) */
const SIDE_BY_SIDE = 1024;

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
  /** Every run of the eval: the map is fitted to where they all went */
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
        // A team's run: every other account's path too, from the same source as the first's
        const others = Object.entries((detail ? detail.paths : grid?.runs[curve.run.id]?.paths) ?? {}).map(([name, path]) => ({ name, points: path as readonly PathPoint[] }));
        const step = detail ? 10 : (grid?.path_every ?? 50);
        return { curve, detail, points, others, step, marks: marksOf(detail?.events, points, step), events: laneMarks(detail?.events) };
      }),
    // details is a new array every render; what is loaded is what matters
    [runners, grid, loadedKey]
  );
  const stages = useMemo(() => laneStages(base.map(b => b.detail)), [base]);
  // Fitted to every run of the eval, whichever are racing, so the view never moves
  const bounds = useMemo(() => pathBounds(Object.values(grid?.runs ?? {}).map(r => r.path)), [grid]);

  const rows = useMemo(() => standings(runners, head.tick, order), [runners, head.tick, order]);
  const tracks = useMemo<Track[]>(() => base.map((b, i) => ({ ...b, rank: rows[i].rank })), [base, rows]);
  const lanes = useMemo<Lane[]>(
    () => rows.map((row, i) => ({ ...row, marks: base[i].events.filter(m => m.tick <= head.tick), status: statusAt(base[i].detail, head.tick) })),
    [rows, base, head.tick]
  );
  const target = runners[0]?.run.target ?? null;
  const top = target ?? niceMax(Math.max(1, ...runners.map(cv => Math.max(...cv.points.map(p => p.value)))));

  // Side by side, the map takes eight of twelve columns and the lanes' column its height
  const wide = width >= SIDE_BY_SIDE;
  const mapWidth = wide ? (width * 8) / 12 : width;
  const height = Math.round(wide ? Math.min(640, Math.max(440, mapWidth * 0.7)) : Math.min(420, Math.max(280, mapWidth * 0.75)));

  /** The pin under the pointer lights its pairing everywhere. */
  const onPointerMove = (event: React.PointerEvent<HTMLDivElement>): void => {
    if (event.buttons) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    const hit = placed.current.findLast(p => Math.hypot(p.x - x, p.y - y) <= PIN + 2);
    setHovered(hit?.key);
    // A team's pins name their account
    event.currentTarget.title = hit?.account ?? '';
  };

  return (
    // A media card: the map runs to the card's edges, as an image-first shadcn card does
    <Card ref={ref} className="gap-0 overflow-hidden py-0 lg:grid lg:grid-cols-12" aria-label="Every run in the game">
      <div className="relative min-w-0 lg:col-span-8" onPointerMove={onPointerMove} onPointerLeave={() => setHovered(undefined)}>
        {width === 0 || !grid ? (
          <Skeleton className="w-full rounded-none" style={{ height: width ? height : 360 }} />
        ) : (
          <RaceMap
            tracks={tracks}
            bounds={bounds}
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
      <div className="flex min-w-0 flex-col gap-3 border-t py-4 lg:col-span-4 lg:border-t-0 lg:border-l" style={wide ? { height } : undefined}>
        <CardContent className="flex shrink-0 items-center gap-3">
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
          <span className="w-14 shrink-0 text-right text-xs text-muted-foreground tabular-nums" title="Game tick">
            {formatInt(Math.round(head.tick))}
          </span>
        </CardContent>
        {/* The lanes scroll inside the column when there are more than its height holds */}
        <CardContent className="min-h-0 flex-1 overflow-y-auto">
          <Standings rows={lanes} max={top} showEpoch={agg === 'runs'} lit={lit} stages={target != null ? stages : []} />
        </CardContent>
      </div>
    </Card>
  );
}
