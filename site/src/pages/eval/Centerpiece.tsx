/**
 * The eval's centrepiece at the top of the race: every run together in the game on one playhead,
 * and the eval's one ranked list beside it. The standings (five of twelve columns, four on a wide screen) rank the pairings
 * by the eval's score from the first frame, each row racing its run (the pairing's median or best
 * run, or every run, from the page's `agg`) along its track as the playhead moves; the world map
 * (seven columns, eight on a wide screen, fitted to the runs' shape) holds a pin and trail per racing run in a view fitted
 * once to where all the eval's runs went. On a phone the standings come first, the map under them.
 */

import { ScrollArea } from '@/components/ui/scroll-area';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useQueries } from '@tanstack/react-query';
import { PauseIcon, PlayIcon } from 'lucide-react';
import { Tip } from '@/components/bits';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Slider } from '@/components/ui/slider';
import { runQuery, runSummaryQuery } from '@/data/queries';
import type { Eval, EvalRuns, PathPoint, Run } from '@/data/types';
import { formatInt } from '@/lib/format';
import { useIsMobile } from '@/hooks/use-mobile';
import { setHovered } from '@/lib/hover';
import { useLit } from './lit';
import type { LegendState } from '@/lib/legend';
import type { MapView } from '@/lib/map';
import { useSearchUpdate } from '@/lib/search';
import { useHeight, useWidth } from '@/lib/useWidth';
import { niceMax, rankVariants, valueAt, type Agg, type RunCurve } from './model';
import { pause, play, seek, useEvalPlayhead } from './playhead';
import { raceRows } from './centerpiece/race';
import { laneMarks, laneStages, statusAt } from './centerpiece/lanes';
import { marksOf, pathBounds, PIN, RaceMap, type PlacedPin, type Track } from './centerpiece/RaceMap';
import { gameTime, Standings, type Lane } from './centerpiece/Standings';

/** Runs whose detail (fine path, events, turns) is loaded; past this the eval's coarse paths do. */
const DETAILED = 24;
/** The race card's least height beside the map; it grows to fill the screen under it */
const RACE_HEIGHT = 420;
/** Kept free under the race card, so the eval's progress chart starts on the first screen */
const BELOW = 96;

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
  const [standingsRef, standingsHeight] = useHeight();
  // Side by side from Tailwind's lg, as the card's grid (re-read as the card's width changes)
  const beside = width > 0 && window.matchMedia('(min-width: 1024px)').matches;

  // Opened at no moment in particular (`?t=` absent), the race plays from the start at its normal pace
  // once the map has its runs, as a run page does; a link to a moment opens paused there
  const evalKey = runners[0]?.run.eval;
  // Under reduced motion it opens at the end instead, the answer already drawn
  const autoplay = useMemo(() => t == null && !matchMedia('(prefers-reduced-motion: reduce)').matches, [evalKey]);
  const played = useRef<string | undefined>(undefined);
  useEffect(() => {
    if (!autoplay || played.current === evalKey || !grid || width === 0 || !evalKey) return;
    played.current = evalKey;
    seek(0);
    play();
  }, [autoplay, grid, width, evalKey]);

  const ordered = useMemo(() => rows.map(r => r.curve), [rows]);
  const details = useQueries({ queries: ordered.slice(0, DETAILED).map(cv => runQuery(cv.run.id)) });
  // Each raced run's chapters (site/summarize.py): the standings show the one at the playhead
  const told = useQueries({ queries: ordered.map(cv => ({ ...runSummaryQuery(cv.run.id), enabled: Boolean(cv.run.summary) })) });
  const toldKey = told.map(q => (q.data ? '1' : '0')).join('');
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
      base.map((b, i) => ({
        ...b.row,
        value: valueAt(b.curve, 'ticks', head.tick) ?? 0,
        mark: b.events.filter(m => m.tick <= head.tick).at(-1) ?? null,
        status: statusAt(b.detail, head.tick),
        chapter: told[i]?.data?.chapters.findLast(c => c.from_tick <= head.tick) ?? null,
      })),
    // told is a new array every render; what is loaded is what matters
    [base, head.tick, toldKey]
  );
  const target = e.target;
  const top = target ?? niceMax(Math.max(1, ...runners.map(cv => Math.max(...cv.points.map(p => p.value)))));
  // Beside the standings the card fills the screen below its top, never less than RACE_HEIGHT
  const [cardTop, setCardTop] = useState(0);
  const [viewport, setViewport] = useState(() => window.innerHeight);
  useEffect(() => {
    const onResize = () => setViewport(window.innerHeight);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);
  const tall = Math.max(RACE_HEIGHT, viewport - cardTop - BELOW);
  const height = mobile ? Math.min(RACE_HEIGHT, Math.max(240, Math.round(width * 0.75))) : tall;

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
    // map, the standings take the height they need, up to the card's, and scroll inside it past that;
    // the map, fitted to the runs' shape, is never shorter than they are
    <Card
      ref={node => {
        ref(node);
        if (node) setCardTop(node.getBoundingClientRect().top + window.scrollY);
      }}
      className="gap-0 overflow-hidden py-0 lg:grid lg:grid-cols-12"
      aria-label="Every run in the game"
    >
      <div ref={standingsRef} className="relative flex min-w-0 flex-col gap-2 py-4 lg:col-span-5 lg:self-start 3xl:col-span-4" style={beside ? { maxHeight: height } : undefined}>
        <CardContent className="flex shrink-0 items-center gap-3">
          <Tip content={head.playing ? 'Pause' : 'Play'}>
            <Button variant="outline" size="icon-sm" onClick={() => (head.playing ? pause() : play())} aria-label={head.playing ? 'Pause' : 'Play'}>
              {head.playing ? <PauseIcon className="fill-current" /> : <PlayIcon className="fill-current" />}
            </Button>
          </Tip>
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
          <Tip content={`Tick ${formatInt(Math.round(head.tick))}`}>
            <span className="shrink-0 text-right text-sm text-muted-foreground tabular-nums">{gameTime(e, head.tick)}</span>
          </Tip>
        </CardContent>
        <ScrollArea className="min-h-0 flex-1">
          <CardContent>
            <Standings e={e} rows={lanes} max={top} perRun={agg === 'runs'} lit={lit} stages={target != null ? stages : []} />
          </CardContent>
        </ScrollArea>
      </div>
      <div className="relative min-w-0 border-t lg:col-span-7 lg:border-t-0 3xl:col-span-8 lg:border-l" onPointerMove={onPointerMove} onPointerLeave={() => setHovered(undefined)}>
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
            minHeight={beside ? standingsHeight : undefined}
          />
        )}
      </div>
    </Card>
  );
}
