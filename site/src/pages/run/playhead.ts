/**
 * The run page's one playhead: the moment in game ticks that the game player, the map, the lanes'
 * marker and the transcript all show. Every part of the debugger reads it here and changes it here,
 * so they never drift apart.
 *
 *   committed  `?t=` in the URL (or the selected call's tick): where the page opens, what a link shares
 *   scrub      while dragging or playing: the moving playhead, not written to the URL every frame
 *   hover      the lanes' crosshair: a preview, shown over the committed moment while hovering
 *
 *   const [committed, write] = useCommitted(run, clock)  // read `?t=`/`?turn=`, write `?t=`
 *   const head = usePlayhead(clock, committed, write)   // { tick, playing, speed, hover, scrub }
 *   seek(tick)          move the playhead without touching the URL (drag)
 *   commit(tick)        settle it and write `?t=` (click, end of drag)
 *   play() / pause()    playback at `speed` game ticks per real second (20 = the game's own pace);
 *                       pausing commits where it stopped
 *   setSpeed(speed)
 *
 * `tick` is what to show: scrub, then hover, then the committed tick, then the run's end; `at` is the
 * same without the hover. Moves the eye follows (a jump, not a drag or playing) take TRANSITION_MS. Playback
 * runs once per page however many components read the playhead; the latest `usePlayhead` given a
 * `write` is the one that commits.
 */

import { useCallback, useEffect, useSyncExternalStore } from 'react';
import { getRouteApi } from '@tanstack/react-router';
import type { RunDetail } from '@/data/types';
import { useSearchUpdate } from '@/lib/search';
import { getMoment, setMoment, turnTick, useMoment, type Clock } from './model';
import { runSearch } from './search';

/** The game's own pace: 20 ticks a second at 50 ms a tick. */
export const REAL_TIME = 20;

/** How long the page takes to show a jump of the playhead: the map's glide, the game's crossfade */
export const TRANSITION_MS = 150;

/** Playback speeds, as multiples of the game's own pace */
export const SPEEDS = [1, 4, 16, 64] as const;

interface Playback {
  playing: boolean;
  /** Game ticks per real second */
  speed: number;
  /** A tick just committed, shown until the URL has it */
  pending: number | null;
}

let playback: Playback = { playing: false, speed: REAL_TIME * 4, pending: null };
const listeners = new Set<() => void>();
const emit = (): void => listeners.forEach(l => l());

function setPlayback(patch: Partial<Playback>): void {
  playback = { ...playback, ...patch };
  emit();
}

function usePlayback(): Playback {
  return useSyncExternalStore(
    l => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => playback
  );
}

/** What playback needs from the page: where the run ends, where it is committed, how to write `?t=` */
let driver: { max: number; committed: number | null; write?: (tick: number) => void } = { max: 0, committed: null };
let frame = 0;

export function seek(tick: number): void {
  setMoment({ scrub: Math.min(driver.max, Math.max(0, tick)) });
}

export function commit(tick: number): void {
  const t = Math.round(Math.min(driver.max, Math.max(0, tick)));
  setPlayback({ pending: t });
  setMoment({ scrub: null });
  driver.write?.(t);
}

export function play(): void {
  if (playback.playing) return;
  let value = getMoment().scrub ?? playback.pending ?? driver.committed ?? 0;
  if (value >= driver.max) value = 0;
  let previous = performance.now();
  setPlayback({ playing: true });
  setMoment({ scrub: value });
  const step = (now: number): void => {
    value = Math.min(driver.max, value + ((now - previous) / 1000) * playback.speed);
    previous = now;
    setMoment({ scrub: value });
    if (value >= driver.max) return pause();
    frame = requestAnimationFrame(step);
  };
  frame = requestAnimationFrame(step);
}

export function pause(): void {
  if (!playback.playing) return;
  cancelAnimationFrame(frame);
  setPlayback({ playing: false });
  const at = getMoment().scrub;
  if (at != null) commit(at);
}

export const toggle = (): void => (playback.playing ? pause() : play());

export const setSpeed = (speed: number): void => setPlayback({ speed });

export interface Playhead {
  /** What to show now, in game ticks */
  tick: number;
  /** The playhead itself, without the hover preview */
  at: number;
  hover: number | null;
  scrub: number | null;
  playing: boolean;
  speed: number;
}

/** The committed moment, `?t=` or else the selected call's tick, and a writer for `?t=`. */
export function useCommitted(run: RunDetail, clock: Clock): [number | null, (tick: number) => void] {
  const search = getRouteApi('/runs/$runId').useSearch();
  const update = useSearchUpdate(runSearch);
  const turn = search.turn != null ? run.turns[search.turn - 1] : undefined;
  const committed = search.t ?? (turn ? turnTick(turn, clock) : null);
  const write = useCallback((tick: number) => update({ t: tick }), [update]);
  return [committed, write];
}

/** Reads the playhead. With `write`, this component's page is the one playback commits to. */
export function usePlayhead(clock: Clock, committed: number | null, write?: (tick: number) => void): Playhead {
  const { hover, scrub } = useMoment();
  const { playing, speed, pending } = usePlayback();
  const max = clock.maxTicks;

  useEffect(() => {
    if (!write) return;
    driver = { max, committed, write };
  }, [max, committed, write]);

  // The URL caught up with (or moved on from) the tick just committed
  useEffect(() => {
    if (playback.pending != null) setPlayback({ pending: null });
  }, [committed]);

  // Leaving the page stops playback
  const drives = write != null;
  useEffect(() => {
    if (!drives) return;
    return () => {
      cancelAnimationFrame(frame);
      setPlayback({ playing: false, pending: null });
      setMoment({ scrub: null });
    };
  }, [drives]);

  const at = scrub ?? pending ?? committed ?? max;
  return { tick: scrub ?? hover ?? at, at, hover, scrub, playing, speed };
}
