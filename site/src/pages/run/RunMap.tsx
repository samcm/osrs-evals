/**
 * Where the character went: the run's path on the world map, bright up to the playhead and faint
 * after it, with a dot at the playhead. The map shows the whole path; zoom and pan are the reader's
 * (`?map=`), and "Fit" returns to the whole path. Upstairs and underground positions are drawn
 * where they are on the surface (underground is 6,400 tiles north in the cache), with the floor named.
 */

import { useEffect, useMemo, useReducer, useRef } from 'react';
import { Badge } from '@/components/ui/badge';
import { WorldMap, type MapMarker, type MapPath } from '@/components/WorldMap';
import type { RunDetail, RunEvent } from '@/data/types';
import { questSrc, skillSrc, uiSrc } from '@/lib/assets';
import { indexAt, UNDERGROUND_Z, type MapView, type PathPoint } from '@/lib/map';
import { useSearchUpdate } from '@/lib/search';
import { TIME_RAMP, type Clock } from './model';
import { TRANSITION_MS, useCommitted, usePlayhead } from './playhead';
import { runSearch, type RunSearch } from './search';

/** Path points are at most this many ticks apart while the character moves */
const STEP_TICKS = 10;

type Marked = Extract<RunEvent, { kind: 'quest' | 'death' | 'level' }>;

/** A position as drawn on the surface map: upstairs over the ground floor, underground under the surface. */
const toSurface = ([t, x, z]: PathPoint): PathPoint => [t, x, z >= UNDERGROUND_Z ? z - UNDERGROUND_Z : z, 0];

/** Where the character was at a tick, between path points while it walked (not across teleports). */
function positionAt(points: readonly PathPoint[], tick: number): PathPoint | null {
  const i = indexAt(points, tick);
  if (i < 0) return points[0] ?? null;
  const a = points[i];
  const b = points[i + 1];
  if (!b || Math.abs(b[1] - a[1]) + Math.abs(b[2] - a[2]) > STEP_TICKS * 2) return [tick, a[1], a[2], a[3]];
  // Points come only while moving: a long gap means standing still, then the last few ticks' walk
  const start = Math.max(a[0], b[0] - STEP_TICKS);
  const f = Math.min(1, Math.max(0, (tick - start) / (b[0] - start || 1)));
  return [tick, a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f, a[3]];
}

/** The surface path with the position at a tick as its last point, for a dot there. */
function hoverTrail(surface: readonly PathPoint[], points: readonly PathPoint[], tick: number): PathPoint[] {
  const at = positionAt(points, tick);
  return at ? [...surface.slice(0, indexAt(surface, tick) + 1), toSurface(at)] : [];
}

function markerFor(e: Marked, point: PathPoint | undefined): MapMarker | null {
  if (!point) return null;
  const base = { id: `${e.kind}-${e.tick}`, x: point[1], z: point[2] };
  if (e.kind === 'quest')
    return { ...base, src: e.quest ? questSrc(e.quest) : uiSrc('quests'), title: e.source === 'inferred' ? `≈ ${e.name ?? 'A quest'}: guessed from the quest-points jump` : (e.name ?? 'A quest') };
  if (e.kind === 'death') return { ...base, src: skillSrc('hitpoints'), title: 'Died' };
  return { ...base, src: skillSrc(e.skill), title: `${e.skill} level ${e.level}` };
}

/** The floor at a position, when it is not the surface's ground floor. */
function floorName(point: PathPoint | null): string | null {
  if (!point) return null;
  if (point[2] >= UNDERGROUND_Z) return 'Underground';
  return point[3] > 0 ? `Floor ${point[3]}` : null;
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

export function RunMap({ run, clock, view, height, fitHeight }: { run: RunDetail; clock: Clock; view: RunSearch['map']; height: number; fitHeight?: boolean }) {
  const update = useSearchUpdate(runSearch);
  const [committed] = useCommitted(run, clock);
  const head = usePlayhead(clock, committed);
  const time = useGlide(head.at, !head.playing && head.scrub == null);
  const hover = head.scrub == null ? head.hover : null;
  const points = run.path as unknown as PathPoint[];
  const surface = useMemo(() => points.map(toSurface), [points]);

  const markers = useMemo(
    () =>
      run.events.flatMap(e => {
        if (e.kind !== 'quest') return [];
        const m = markerFor(e, surface[indexAt(surface, e.tick)]);
        return m ? [m] : [];
      }),
    [run.events, surface]
  );

  const here = positionAt(points, time);
  const paths = useMemo((): MapPath[] => {
    const end = indexAt(surface, time);
    const at = here ? toSurface(here) : null;
    const trail = at ? [...surface.slice(0, end + 1), at] : surface.slice(0, end + 1);
    return [
      // The whole path in its time colours, faint after the playhead, bright up to it
      { id: `${run.id}-all`, color: TIME_RAMP[TIME_RAMP.length - 1], ramp: TIME_RAMP, rampSpan: [0, clock.maxTicks], points: surface, width: 2, opacity: 0.6 },
      { id: `${run.id}-trail`, color: TIME_RAMP[TIME_RAMP.length - 1], ramp: TIME_RAMP, rampSpan: [0, clock.maxTicks], points: trail, width: 3 },
      ...(hover != null ? [dot(`${run.id}-hover`, hoverTrail(surface, points, hover), hover, '--muted-foreground')] : []),
      dot(`${run.id}-at`, trail, time, '--primary'),
    ];
  }, [run.id, surface, points, here?.[1], here?.[2], time, hover, clock.maxTicks]);

  const floor = floorName(here);

  if (points.length === 0) return <p className="flex items-center justify-center text-sm text-muted-foreground" style={{ height }}>No path was recorded.</p>;
  return (
    <div className="relative">
      <WorldMap
        paths={paths}
        markers={markers}
        view={view}
        onViewChange={(v: MapView | undefined) => update({ map: v })}
        height={height}
        fitHeight={fitHeight}
        fitKey={run.id}
        label="The character's path up to the playhead, and where it went after"
      />
      {floor && (
        <Badge variant="secondary" className="absolute top-2 left-2">
          {floor}
        </Badge>
      )}
    </div>
  );
}
