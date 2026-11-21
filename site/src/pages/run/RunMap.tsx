/**
 * Where the character went: the map follows the character at the playhead, with its path bright up
 * to the playhead and faint after it. Dragging the map stops following and keeps the view (`?map=`);
 * "Follow" goes back, "Fit" shows the whole path, and zooming while following keeps following
 * (`?mz=`). Upstairs and underground positions are drawn where they are on the surface, with the
 * floor named. In a team's run the map follows the account the game does (`?acct=`); the others'
 * paths are drawn fainter, each with a dot where it is, named on hover.
 */

import { useCallback, useEffect, useMemo, useReducer, useRef } from 'react';
import { Badge } from '@/components/ui/badge';
import { WorldMap, type MapMarker, type MapOverlay, type MapPath } from '@/components/WorldMap';
import type { RunDetail, RunEvent } from '@/data/types';
import { questSrc, uiSrc } from '@/lib/assets';
import { indexAt, positionAt, type MapView, type PathPoint } from '@/lib/map';
import { useSearchUpdate } from '@/lib/search';
import { TIME_RAMP, type Clock } from './model';
import { TRANSITION_MS, useCommitted, usePlayhead } from './playhead';
import { runSearch, type RunSearch } from './search';

type Quest = Extract<RunEvent, { kind: 'quest' }>;

/** The path up to a tick, ending where the character was then. */
function trailTo(points: readonly PathPoint[], tick: number): PathPoint[] {
  const at = positionAt(points, tick);
  const upto = points.slice(0, indexAt(points, tick) + 1);
  return at ? [...upto, [tick, at.x, at.z, 0]] : upto;
}

function questMarker(e: Quest, points: readonly PathPoint[]): MapMarker | null {
  const at = positionAt(points, e.tick);
  if (!at) return null;
  const title = e.source === 'inferred' ? `≈ ${e.name ?? 'A quest'}: guessed from the quest-points jump` : (e.name ?? 'A quest');
  return { id: `quest-${e.tick}`, x: at.x, z: at.z, src: e.quest ? questSrc(e.quest) : uiSrc('quests'), title };
}

/** A playhead that glides to where it jumps over TRANSITION_MS, and follows drags and playing as they go. */
function useGlide(target: number, glide: boolean): number {
  const shown = useRef(target);
  const [, redraw] = useReducer((n: number) => n + 1, 0);
  useEffect(() => {
    if (!glide || shown.current === target) {
      shown.current = target;
      return;
    }
    const from = shown.current;
    const start = performance.now();
    let frame = requestAnimationFrame(function step(now) {
      const f = Math.min(1, (now - start) / TRANSITION_MS);
      shown.current = from + (target - from) * (1 - (1 - f) ** 3);
      redraw();
      if (f < 1) frame = requestAnimationFrame(step);
    });
    return () => cancelAnimationFrame(frame);
  }, [target, glide]);
  return glide ? shown.current : target;
}

/** A dot with no line: the playhead (primary, like every other playhead on the page) or the hover. */
const dot = (id: string, points: readonly PathPoint[], at: number, color: string): MapPath => ({ id, color, points, opacity: 0, at });

export function RunMap({
  run,
  account,
  clock,
  view,
  zoom,
  height,
}: {
  run: RunDetail;
  /** The account followed */
  account: string;
  clock: Clock;
  view: RunSearch['map'];
  zoom: number | undefined;
  height: number;
}) {
  const update = useSearchUpdate(runSearch);
  const [committed] = useCommitted(run, clock);
  const head = usePlayhead(clock, committed);
  const time = useGlide(head.at, !head.playing && head.scrub == null);
  const hover = head.scrub == null ? head.hover : null;
  const all = useMemo(() => ({ [run.account]: run.path, ...run.paths }) as Record<string, PathPoint[]>, [run]);
  const points = all[account] ?? (run.path as unknown as PathPoint[]);
  const others = useMemo(() => Object.entries(all).filter(([name]) => name !== account), [all, account]);
  /** Where each other account's dot was last drawn, for naming it on hover */
  const placed = useRef<{ name: string; x: number; y: number }[]>([]);

  const markers = useMemo(
    () => run.events.flatMap(e => (e.kind === 'quest' ? [questMarker(e, points)].filter(m => m != null) : [])),
    [run.events, points]
  );

  const here = positionAt(points, time);
  const paths = useMemo((): MapPath[] => {
    const trail = trailTo(points, time);
    return [
      // The other accounts' paths, fainter, with a dot where each is
      ...others.flatMap(([name, other]): MapPath[] => [
        { id: `${run.id}-${name}`, color: TIME_RAMP[TIME_RAMP.length - 1], ramp: TIME_RAMP, rampSpan: [0, clock.maxTicks], points: trailTo(other, time), width: 1.5, opacity: 0.45 },
        dot(`${run.id}-${name}-at`, other, time, '--muted-foreground'),
      ]),
      // The whole path in its time colours, faint after the playhead, bright up to it
      { id: `${run.id}-all`, color: TIME_RAMP[TIME_RAMP.length - 1], ramp: TIME_RAMP, rampSpan: [0, clock.maxTicks], points, width: 2, opacity: 0.6 },
      { id: `${run.id}-trail`, color: TIME_RAMP[TIME_RAMP.length - 1], ramp: TIME_RAMP, rampSpan: [0, clock.maxTicks], points: trail, width: 3 },
      ...(hover != null ? [dot(`${run.id}-hover`, trailTo(points, hover), hover, '--muted-foreground')] : []),
      dot(`${run.id}-at`, trail, time, '--primary'),
    ];
  }, [run.id, points, others, here?.x, here?.z, time, hover, clock.maxTicks]);

  const overlay = useCallback<MapOverlay>(
    (_ctx, toScreen) => {
      placed.current = others.flatMap(([name, other]) => {
        const at = positionAt(other, time);
        if (!at) return [];
        const [x, y] = toScreen(at.x, at.z);
        return [{ name, x, y }];
      });
    },
    [others, time]
  );
  /** The other account under the pointer names itself, as the canvas's tooltip. */
  const onPointerMove = (event: React.PointerEvent<HTMLDivElement>): void => {
    const rect = event.currentTarget.getBoundingClientRect();
    const hit = placed.current.find(p => Math.hypot(p.x - (event.clientX - rect.left), p.y - (event.clientY - rect.top)) <= 8);
    event.currentTarget.title = hit ? hit.name : '';
  };

  if (points.length === 0) return <p className="flex items-center justify-center text-sm text-muted-foreground" style={{ height }}>No path was recorded.</p>;
  return (
    <div className="relative" onPointerMove={others.length ? onPointerMove : undefined}>
      <WorldMap
        paths={paths}
        markers={markers}
        view={view}
        onViewChange={(v: MapView | undefined) => update({ map: v })}
        follow={here ? [here] : null}
        followZoom={zoom}
        onFollowZoom={mz => update({ mz })}
        height={height}
        fitKey={`${run.id}-${account}`}
        overlay={others.length ? overlay : undefined}
        label="The character's path, centred on where it is at the playhead"
      />
      {here?.floor && (
        <Badge variant="secondary" className="absolute top-2 left-2">
          {here.floor}
        </Badge>
      )}
    </div>
  );
}
