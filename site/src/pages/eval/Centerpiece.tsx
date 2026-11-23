/**
 * The eval's centrepiece at the top of the race: every run together in the game on one playhead,
 * and the eval's one ranked list beside it. The standings (five of twelve columns, four from 1800px) rank the pairings
 * by the eval's score from the first frame, each row racing its run (the pairing's median or best
 * run, or every run, from the page's `agg`) along its track as the playhead moves; the world map
 * (seven columns, eight from 1800px, fitted to the runs' shape) holds a pin and trail per racing run in a view fitted
 * once to where all the eval's runs went. On a phone the standings come first, the map under them.
 */

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type JSX,
} from 'react';
import { useQueries, type UseQueryResult } from '@tanstack/react-query';
import { useRouter } from '@tanstack/react-router';
import { PauseIcon, PlayIcon } from '@heroicons/react/20/solid';
import { Tip } from '@/components/bits';
import { Button } from '@/components/Elements/Button';
import { RangeInput } from '@/components/Forms/RangeInput/RangeInput';
import { Card } from '@/components/Layout/Card';
import { LoadingContainer } from '@/components/Layout/LoadingContainer';
import { ScrollArea } from '@/components/Layout/ScrollArea';
import { runQuery, runSummaryQuery } from '@/data/queries';
import type { Eval, EvalRuns, PathPoint, Run } from '@/data/types';
import { formatInt } from '@/lib/format';
import { useIsMobile } from '@/hooks/use-mobile';
import { setHovered } from '@/lib/hover';
import type { LegendState } from '@/lib/legend';
import type { MapView } from '@/lib/map';
import { useSearchUpdate } from '@/lib/search';
import { useHeight, useWidth } from '@/lib/useWidth';
import { useLit } from '@/pages/eval/lit';
import { niceMax, rankVariants, valueAt, type Agg, type RunCurve } from '@/pages/eval/model';
import { pause, play, seek, useEvalPlayhead } from '@/pages/eval/playhead';
import { raceRows } from '@/pages/eval/centerpiece/race';
import { gameTime, laneMarks, laneStages, statusAt } from '@/pages/eval/centerpiece/lanes';
import { marksOf, pathBounds, PIN, type PlacedPin, type Track } from '@/pages/eval/centerpiece/mapData';
import { RaceMap } from '@/pages/eval/centerpiece/RaceMap';
import { Standings, type Lane } from '@/pages/eval/centerpiece/Standings';

/** Runs whose detail (fine path, events, turns) is loaded; past this the eval's coarse paths do. */
const DETAILED = 24;
/** The race card's least height beside the map; it grows to fill the screen under it */
const RACE_HEIGHT = 420;
/** Kept free under the race card, so the eval's progress chart starts on the first screen */
const BELOW = 96;
/** Side by side from Tailwind's lg, as the card's grid */
const BESIDE_QUERY = '(min-width: 64rem)';

/** Whether the window is lg or wider, kept current as it resizes. */
function subscribeBeside(onChange: () => void): () => void {
  const mql = window.matchMedia(BESIDE_QUERY);
  mql.addEventListener('change', onChange);
  return () => mql.removeEventListener('change', onChange);
}
const besideNow = (): boolean => window.matchMedia(BESIDE_QUERY).matches;

/** The loaded data of each query, in order; the same array while nothing new loads. */
const dataOf = <T,>(results: UseQueryResult<T>[]): (T | undefined)[] => results.map(r => r.data);

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
}): JSX.Element {
  const update = useSearchUpdate();
  const [widthRef, width] = useWidth();
  const boxRef = useRef<HTMLElement | null>(null);
  const lit = useLit(legend.focus);
  const placedRef = useRef<PlacedPin[]>([]);

  const runners = curves;
  // The eval's ranking, as the leaderboard everywhere: by its score over game ticks
  const ranked = useMemo(() => rankVariants(e, runs, 'ticks'), [e, runs]);
  const rows = useMemo(() => raceRows(runners, ranked), [runners, ranked]);
  const span = Math.max(
    1,
    Math.min(maxTick, Math.max(0, ...runners.map(cv => cv.points[cv.points.length - 1]?.tick ?? 0)))
  );
  // `?t=` belongs to the page the race is on: written only while that page is the current one
  const router = useRouter();
  const [ownPath] = useState(() => router.latestLocation.pathname);
  const head = useEvalPlayhead(t, span, tick => {
    if (router.latestLocation.pathname === ownPath) update({ t: tick });
  });
  const mobile = useIsMobile();
  const [standingsRef, standingsHeight] = useHeight();
  const beside = useSyncExternalStore(subscribeBeside, besideNow);

  // Opened at no moment in particular (`?t=` absent), the race plays from the start at its normal pace
  // once the map has its runs, as a run page does; a link to a moment opens paused there. Under
  // reduced motion it opens at the end instead, the answer already drawn. The page keys this
  // component by eval, so this is decided once per eval
  const [autoplay] = useState(() => t == null && !window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  const playedRef = useRef(false);
  const ready = grid != null && width > 0 && runners.length > 0;
  useEffect(() => {
    if (!autoplay || playedRef.current || !ready) return;
    playedRef.current = true;
    seek(0);
    play();
  }, [autoplay, ready]);

  const ordered = useMemo(() => rows.map(r => r.curve), [rows]);
  const details = useQueries({
    queries: ordered.slice(0, DETAILED).map(cv => runQuery(cv.run.id)),
    combine: dataOf,
  });
  // Each raced run's chapters (site/summarize.py): the standings show the one at the playhead
  const told = useQueries({
    queries: ordered.map(cv => ({ ...runSummaryQuery(cv.run.id), enabled: Boolean(cv.run.summary) })),
    combine: dataOf,
  });
  const base = useMemo(
    () =>
      rows.map((row, i) => {
        const curve = row.curve;
        const detail = details[i];
        const points = (detail?.path ?? grid?.runs[curve.run.id]?.path ?? []) as readonly PathPoint[];
        // A team's run: every other account's path too, from the same source as the first's
        const others = Object.entries((detail ? detail.paths : grid?.runs[curve.run.id]?.paths) ?? {}).map(
          ([name, path]) => ({ name, points: path as readonly PathPoint[] })
        );
        const step = detail ? 10 : (grid?.path_every ?? 50);
        return {
          row,
          curve,
          detail,
          points,
          others,
          step,
          marks: marksOf(detail?.events, points, step),
          events: laneMarks(detail?.events),
        };
      }),
    [rows, grid, details]
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
        chapter: told[i]?.chapters.findLast(c => c.from_tick <= head.tick) ?? null,
      })),
    [base, head.tick, told]
  );
  const target = e.target;
  const top = target ?? niceMax(Math.max(1, ...runners.map(cv => Math.max(...cv.points.map(p => p.value)))));

  // Beside the standings the card fills the screen below its top, never less than RACE_HEIGHT. Its top
  // moves when the page above it does (the header's Setup opening), so it is re-read as the page resizes
  const [room, setRoom] = useState(() => window.innerHeight);
  useLayoutEffect(() => {
    const measure = (): void => {
      const node = boxRef.current;
      if (node) setRoom(window.innerHeight - (node.getBoundingClientRect().top + window.scrollY));
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(document.documentElement);
    window.addEventListener('resize', measure);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', measure);
    };
  }, []);
  const tall = Math.max(RACE_HEIGHT, room - BELOW);
  const height = mobile ? Math.min(RACE_HEIGHT, Math.max(240, Math.round(width * 0.75))) : tall;

  const boxCallback = useCallback(
    (node: HTMLElement | null) => {
      boxRef.current = node;
      widthRef(node);
    },
    [widthRef]
  );

  /** The pin under the pointer lights its pairing everywhere; a team's lit pins name their accounts. */
  const onPointerMove = (event: React.PointerEvent<HTMLDivElement>): void => {
    if (event.buttons) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    const hit = placedRef.current.findLast(p => Math.hypot(p.x - x, p.y - y) <= PIN + 2);
    setHovered(hit?.key);
  };

  return (
    // A media card: the map runs to the card's edges. Beside the map, the standings take the height
    // they need, up to the card's, and scroll inside it past that; the map, fitted to the runs' shape,
    // is never shorter than they are
    <Card>
      <section
        ref={boxCallback}
        aria-label="Every run in the game"
        className="mx-card-bleed my-card-bleed lg:grid lg:grid-cols-12"
      >
        <div
          ref={standingsRef}
          className="relative flex min-w-0 flex-col gap-2 py-4 lg:col-span-race-standings lg:self-start"
          style={beside ? { maxHeight: height } : undefined}
        >
          <div className="flex shrink-0 items-center gap-3 px-card-inset">
            <Tip content={head.playing ? 'Pause' : 'Play'}>
              <Button
                variant="outline"
                size="sm"
                iconOnly
                leadingIcon={head.playing ? <PauseIcon /> : <PlayIcon />}
                onClick={() => (head.playing ? pause() : play())}
                aria-label={head.playing ? 'Pause' : 'Play'}
              />
            </Tip>
            {/* Dragging moves the playhead; letting go writes it to the URL */}
            <div
              className="min-w-0 flex-1"
              onPointerUp={() => head.settle(head.tick)}
              onKeyUp={() => head.settle(head.tick)}
            >
              <RangeInput
                id="race-playhead"
                label="Game time"
                hideLabel
                min={0}
                max={span}
                step={1}
                value={Math.round(head.tick)}
                onChange={v => {
                  pause();
                  seek(v);
                }}
              />
            </div>
            <Tip content={`Tick ${formatInt(Math.round(head.tick))}`}>
              <span className="shrink-0 text-right text-sm text-muted tabular-nums">{gameTime(e, head.tick)}</span>
            </Tip>
          </div>
          <ScrollArea className="min-h-0 flex-1">
            <div className="px-card-inset">
              <Standings
                e={e}
                rows={lanes}
                max={top}
                perRun={agg === 'runs'}
                lit={lit}
                stages={target != null ? stages : []}
              />
            </div>
          </ScrollArea>
        </div>
        <div
          className="relative min-w-0 border-t border-border lg:col-span-race-map lg:border-t-0 lg:border-l"
          onPointerMove={onPointerMove}
          onPointerLeave={() => setHovered(undefined)}
        >
          {width === 0 || !grid ? (
            <div style={{ height }}>
              <LoadingContainer className="size-full rounded-none" />
            </div>
          ) : (
            <RaceMap
              tracks={tracks}
              bounds={bounds}
              tick={head.tick}
              trail={span * 0.03}
              lit={lit}
              placedRef={placedRef}
              view={view}
              onViewChange={v => update({ map: v })}
              height={height}
              minHeight={beside ? standingsHeight : undefined}
            />
          )}
        </div>
      </section>
    </Card>
  );
}
