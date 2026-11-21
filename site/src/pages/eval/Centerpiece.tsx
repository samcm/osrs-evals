/**
 * The eval's centrepiece at the top of the race: every run together in the game on one playhead,
 * and the eval's one ranked list beside it. The standings (five of twelve columns) rank the pairings
 * by the eval's score from the first frame, each row racing its run (the pairing's median or best
 * run, or every run, from the page's `agg`) along its track as the playhead moves; the world map
 * (seven columns, fitted to the runs' shape) holds a pin and trail per racing run in a view fitted
 * once to where all the eval's runs went. On a phone the standings come first, the map under them.
 */

import { useEffect, useMemo, useRef } from 'react';
import { useQueries } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Slider } from '@/components/ui/slider';
import { runQuery } from '@/data/queries';
import type { Eval, EvalRuns, PathPoint, Run } from '@/data/types';
import { formatInt } from '@/lib/format';
import { useIsMobile } from '@/hooks/use-mobile';
import { setHovered } from '@/lib/hover';
import { useLit } from './lit';
import type { LegendState } from '@/lib/legend';
import type { MapView } from '@/lib/map';
import { useSearchUpdate } from '@/lib/search';
import { useWidth } from '@/lib/useWidth';
import { niceMax, rankVariants, valueAt, type Agg, type RunCurve } from './model';
import { pause, play, seek, useEvalPlayhead } from './playhead';
import { raceRows } from './centerpiece/race';
import { laneMarks, laneStages, statusAt } from './centerpiece/lanes';
import { marksOf, pathBounds, PIN, RaceMap, type PlacedPin, type Track } from './centerpiece/RaceMap';
import { gameTime, Standings, type Lane } from './centerpiece/Standings';

/** Runs whose detail (fine path, events, turns) is loaded; past this the eval's coarse paths do. */
const DETAILED = 24;
/** The race card's height beside the map: the map fits the runs' shape up to it */
const RACE_HEIGHT = 420;

export function Centerpiece({
  e,
  runs,
  curves,
  grid,
  legend,
  view,
  t,
  maxTick,
  agg,
}: {
  e: Eval;
  /** Every run the page shows: the standings' results and ranking */
  runs: Run[];
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
  // The eval's ranking, as the leaderboard everywhere: by its score over game ticks
  const ranked = useMemo(() => rankVariants(e, runs, 'ticks'), [e, runs]);
  const rows = useMemo(() => raceRows(runners, ranked), [runners, ranked]);
  const span = Math.max(1, Math.min(maxTick, Math.max(0, ...runners.map(cv => cv.points[cv.points.length - 1]?.tick ?? 0))));
  const head = useEvalPlayhead(t, span, tick => update({ t: tick }));
  const mobile = useIsMobile();

  // Opened at no moment in particular (`?t=` absent), the race plays from the start at its normal pace
  // once the map has its runs, as a run page does; a link to a moment opens paused there
  const evalKey = runners[0]?.run.eval;
  const autoplay = useMemo(() => t == null, [evalKey]);
  const played = useRef<string | undefined>(undefined);
  useEffect(() => {
    if (!autoplay || played.current === evalKey || !grid || width === 0 || !evalKey) return;
    played.current = evalKey;
    seek(0);
    play();
  }, [autoplay, grid, width, evalKey]);

  const ordered = useMemo(() => rows.map(r => r.curve), [rows]);
  const details = useQueries({ queries: ordered.slice(0, DETAILED).map(cv => runQuery(cv.run.id)) });
  const loadedKey = details.map(d => (d.data ? '1' : '0')).join('');
  const base = useMemo(
    () =>
      rows.map((row, i) => {
        const curve = row.curve;
        const detail = details[i]?.data;
        const points = (detail?.path ?? grid?.runs[curve.run.id]?.path ?? []) as readonly PathPoint[];
        // A team's run: every other account's path too, from the same source as the first's
        const others = Object.entries((detail ? detail.paths : grid?.runs[curve.run.id]?.paths) ?? {}).map(([name, path]) => ({ name, points: path as readonly PathPoint[] }));
        const step = detail ? 10 : (grid?.path_every ?? 50);
        return { row, curve, detail, points, others, step, marks: marksOf(detail?.events, points, step), events: laneMarks(detail?.events) };
      }),
    // details is a new array every render; what is loaded is what matters
    [rows, grid, loadedKey]
  );
  const stages = useMemo(() => laneStages(base.map(b => b.detail)), [base]);
  // Fitted to every run of the eval, whichever are racing, so the view never moves
  const bounds = useMemo(() => pathBounds(Object.values(grid?.runs ?? {}).map(r => r.path)), [grid]);

  const tracks = useMemo<Track[]>(() => base.map(b => ({ ...b, rank: b.row.place - 1 })), [base]);
  const lanes = useMemo<Lane[]>(
    () =>
      base.map(b => ({
        ...b.row,
        value: valueAt(b.curve, 'ticks', head.tick) ?? 0,
        mark: b.events.filter(m => m.tick <= head.tick).at(-1) ?? null,
        status: statusAt(b.detail, head.tick),
      })),
    [base, head.tick]
  );
  const target = e.target;
  const top = target ?? niceMax(Math.max(1, ...runners.map(cv => Math.max(...cv.points.map(p => p.value)))));
  const height = mobile ? Math.min(RACE_HEIGHT, Math.max(240, Math.round(width * 0.75))) : RACE_HEIGHT;

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
    // A media card: the map runs to the card's edges, as an image-first shadcn card does. Beside the
    // map, the standings take its height and scroll inside it when there are more rows than fit
    <Card ref={ref} className="gap-0 overflow-hidden py-0 lg:grid lg:grid-cols-12" aria-label="Every run in the game">
      <div className="relative flex min-w-0 flex-col gap-2 py-4 lg:col-span-5 lg:border-r">
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
            aria-label="Game time"
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
          <span className="shrink-0 text-right text-sm text-muted-foreground tabular-nums" title={`Tick ${formatInt(Math.round(head.tick))}`}>
            {gameTime(e, head.tick)}
          </span>
        </CardContent>
        <div className="min-h-0 flex-1 lg:relative">
          <CardContent className="lg:absolute lg:inset-0 lg:overflow-y-auto">
            <Standings e={e} rows={lanes} max={top} perRun={agg === 'runs'} lit={lit} stages={target != null ? stages : []} />
          </CardContent>
        </div>
      </div>
      <div className="relative min-w-0 border-t lg:col-span-7 lg:border-t-0" onPointerMove={onPointerMove} onPointerLeave={() => setHovered(undefined)}>
        {width === 0 || !grid ? (
          <Skeleton className="w-full rounded-none" style={{ height }} />
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
    </Card>
  );
}
