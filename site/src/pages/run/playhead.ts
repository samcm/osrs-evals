/**
 * The run page's one playhead: the moment in game ticks that the game player, the map, the lanes'
 * marker and the transcript all show. Every part of the debugger reads it here and changes it here,
 * so they never drift apart.
 *
 *   committed  `?t=` in the URL: where the page opens and what a link shares
 *   scrub      while dragging or playing: the moving playhead, not written to the URL every frame
 *   hover      the lanes' crosshair: a preview, shown over the committed moment while hovering
 *
 *   const head = usePlayhead(clock, committedTick)   // { tick, playing, speed, hover, scrub }
 *   seek(tick)          move the playhead without touching the URL (drag, play)
 *   commit(tick)        settle it and write `?t=` (click, pause, end of drag)
 *   play() / pause()    playback at `speed` game ticks per real second (20 = the game's own pace)
 *
 * `tick` is what to show: scrub, then hover, then the committed tick, then the run's end.
 */

import { useEffect, useSyncExternalStore } from 'react';
import { getMoment, setMoment, useMoment, type Clock } from './model';

/** The game's own pace: 20 ticks a second at 50 ms a tick. */
export const REAL_TIME = 20;

interface Playback {
  playing: boolean;
  /** Game ticks per real second */
  speed: number;
}

let playback: Playback = { playing: false, speed: REAL_TIME * 8 };
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

export function seek(tick: number): void {
  setMoment({ scrub: tick });
}

export const play = (): void => setPlayback({ playing: true });
export const pause = (): void => setPlayback({ playing: false });
export const setSpeed = (speed: number): void => setPlayback({ speed });

export interface Playhead {
  /** What to show now, in game ticks */
  tick: number;
  hover: number | null;
  scrub: number | null;
  playing: boolean;
  speed: number;
}

/**
 * Reads the playhead and runs playback. Call it once per page (in the page component) with a
 * `commit` that writes `?t=`; other components read it with `usePlayhead` too, which is cheap.
 */
export function usePlayhead(clock: Clock, committed: number | null, commit?: (tick: number) => void): Playhead {
  const { hover, scrub } = useMoment();
  const { playing, speed } = usePlayback();
  const max = clock.maxTicks;

  useEffect(() => {
    if (!playing || !commit) return;
    let previous = performance.now();
    let value = getMoment().scrub ?? committed ?? 0;
    if (value >= max) value = 0;
    let frame = 0;
    const step = (now: number): void => {
      value = Math.min(max, value + ((now - previous) / 1000) * playback.speed);
      previous = now;
      setMoment({ scrub: value });
      if (value >= max) {
        pause();
        commit(Math.round(value));
        setMoment({ scrub: null });
        return;
      }
      frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => {
      cancelAnimationFrame(frame);
      const at = getMoment().scrub;
      if (at != null) {
        commit(Math.round(at));
        setMoment({ scrub: null });
      }
    };
    // Starts from the moment shown when play was pressed
  }, [playing, max]);

  return { tick: scrub ?? hover ?? committed ?? max, hover, scrub, playing, speed };
}
