/** Where the character went: the run's path on the world map coloured by time, a dot at the chosen moment, and a scrubber to move it. */

import { useEffect, useMemo, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { WorldMap, type MapMarker } from '@/components/WorldMap';
import type { RunDetail, RunEvent } from '@/data/types';
import { questSrc, skillSrc, uiSrc } from '@/lib/assets';
import { formatClock, formatInt } from '@/lib/format';
import { indexAt, UNDERGROUND_Z, type MapView, type PathPoint } from '@/lib/map';
import { useSearchUpdate } from '@/lib/search';
import { getMoment, setMoment, TIME_RAMP, useMoment, type Clock, type XMeasure } from './model';
import { runSearch, type RunSearch } from './search';

/** Seconds a full run takes to play. */
const PLAY_SECONDS = 24;

type Marked = Extract<RunEvent, { kind: 'quest' | 'death' | 'level' }>;

function markerFor(e: Marked, point: readonly number[] | undefined): MapMarker | null {
  if (!point || point[2] >= UNDERGROUND_Z || point[3] !== 0) return null;
  const base = { id: `${e.kind}-${e.tick}`, x: point[1], z: point[2] };
  if (e.kind === 'quest')
    return { ...base, src: e.quest ? questSrc(e.quest) : uiSrc('quests'), title: `${e.name ?? 'A quest'}${e.source === 'inferred' ? ' (inferred from the quest-points jump)' : ''}` };
  if (e.kind === 'death') return { ...base, src: skillSrc('hitpoints'), title: 'Died' };
  return { ...base, src: skillSrc(e.skill), title: `${e.skill} level ${e.level}` };
}

/** The moment the map shows: dragging or playing, else the crosshair, else the URL's time or selected call, else the end. */
export function useMapTime(clock: Clock, selected: number | null): number {
  const { hover, scrub } = useMoment();
  return scrub ?? hover ?? selected ?? clock.maxTicks;
}

export function RunMap({ run, clock, selected, view, height, fitHeight }: { run: RunDetail; clock: Clock; selected: number | null; view: RunSearch['map']; height: number; fitHeight?: boolean }) {
  const update = useSearchUpdate(runSearch);
  const time = useMapTime(clock, selected);
  const points = run.path as unknown as PathPoint[];

  const markers = useMemo(
    () =>
      run.events.flatMap(e => {
        if (e.kind !== 'quest' && e.kind !== 'death' && e.kind !== 'level') return [];
        const m = markerFor(e, points[indexAt(points, e.tick)]);
        return m ? [m] : [];
      }),
    [run.events, points]
  );
  const paths = useMemo(() => [{ id: run.id, color: TIME_RAMP[TIME_RAMP.length - 1], ramp: TIME_RAMP, points, width: 2, at: time }], [run.id, points, time]);

  if (points.length === 0) return <p className="flex items-center justify-center text-sm text-muted-foreground" style={{ height }}>No path was recorded.</p>;
  return (
    <WorldMap
      paths={paths}
      markers={markers}
      view={view}
      onViewChange={(v: MapView | undefined) => update({ map: v })}
      height={height}
      fitHeight={fitHeight}
      label="The character's path, coloured from the start of the run to its end"
    />
  );
}

/** Play, a slider over the run, and the moment it shows. */
export function Scrubber({ clock, selected, measure }: { clock: Clock; selected: number | null; measure: XMeasure }) {
  const update = useSearchUpdate(runSearch);
  const time = useMapTime(clock, selected);
  const frame = useRef(0);
  const [playing, setPlaying] = useState(false);
  const max = clock.maxTicks;

  const commit = (tick: number): void => {
    update({ t: Math.round(Math.min(max, Math.max(0, tick))) });
    setMoment({ scrub: null });
  };

  useEffect(() => {
    if (!playing) return;
    let previous = performance.now();
    let value = getMoment().scrub ?? (time >= max ? 0 : time);
    const step = (now: number): void => {
      value = Math.min(max, value + ((now - previous) / 1000) * (max / PLAY_SECONDS));
      previous = now;
      setMoment({ scrub: value });
      if (value >= max) {
        setPlaying(false);
        commit(value);
        return;
      }
      frame.current = requestAnimationFrame(step);
    };
    frame.current = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame.current);
    // Starts from the moment shown when play was pressed
  }, [playing]);

  useEffect(() => () => setMoment({ scrub: null }), []);

  const toggle = (): void => {
    if (playing) {
      setPlaying(false);
      commit(getMoment().scrub ?? time);
    } else setPlaying(true);
  };

  const label = measure === 'ticks' ? formatInt(Math.round(time)) : formatClock(clock.toSeconds(time));
  return (
    <div className="flex h-8 items-center gap-3">
      <Button variant="outline" size="icon-sm" onClick={toggle} aria-label={playing ? 'Pause' : 'Play'} title={playing ? 'Pause' : 'Play'}>
        <svg aria-hidden viewBox="0 0 10 10" className="fill-current">
          {playing ? <path d="M1.5 1h2.5v8H1.5zM6 1h2.5v8H6z" /> : <path d="M2 1l7 4-7 4z" />}
        </svg>
      </Button>
      <Slider
        aria-label="Map time"
        min={0}
        max={max}
        step={1}
        value={[Math.min(max, Math.round(time))]}
        onValueChange={([v]) => {
          setPlaying(false);
          setMoment({ scrub: v });
        }}
        onValueCommit={([v]) => commit(v)}
        className="min-w-0 flex-1"
      />
      <span className="w-14 shrink-0 text-right text-xs text-muted-foreground tabular-nums">{label}</span>
    </div>
  );
}
