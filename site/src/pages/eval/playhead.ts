/**
 * The eval page's one playhead: the game tick at which every run is shown together. Anything on the
 * page can read it; the centrepiece runs it.
 *
 *   committed  `?t=` in the URL: where the page opens and what a link shares; absent means the end
 *   scrub      while dragging or playing: the moving playhead, kept out of the URL until it settles
 *
 *   const head = useEvalPlayhead(committed, span, commit)   // once, in the component that plays
 *   seek(tick)   move without touching the URL (drag)
 *   play() / pause()
 *   useEvalTick(committed, span)                            // anywhere else: the tick to show
 */

import { useEffect, useEffectEvent, useSyncExternalStore } from 'react';

/** Real seconds the whole race takes to play. */
export const PLAY_SECONDS = 30;

interface State {
  scrub: number | null;
  playing: boolean;
}

let state: State = { scrub: null, playing: false };
const listeners = new Set<() => void>();

function set(patch: Partial<State>): void {
  const next = { ...state, ...patch };
  if (next.scrub === state.scrub && next.playing === state.playing) return;
  state = next;
  for (const l of listeners) l();
}

function useStore(): State {
  return useSyncExternalStore(
    l => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => state
  );
}

export const seek = (tick: number): void => set({ scrub: tick });
export const play = (): void => set({ playing: true });
export const pause = (): void => set({ playing: false });

/** The tick to show: the moving playhead, else `?t=`, else the end. */
export function useEvalTick(committed: number | undefined, span: number): number {
  const { scrub } = useStore();
  return Math.min(span, scrub ?? committed ?? span);
}

/** The tick to mark: the moving playhead, else `?t=`; null when neither is set (nothing to mark). */
export function usePlayheadMark(committed: number | undefined): number | null {
  const { scrub } = useStore();
  return scrub ?? committed ?? null;
}

export interface EvalPlayhead {
  tick: number;
  playing: boolean;
  /** Settle the playhead at a tick and write it to the URL (the end clears `?t=`) */
  settle: (tick: number) => void;
}

/**
 * Runs playback over 0…span in PLAY_SECONDS, starting from the tick shown (from 0 at the end).
 * `commit` writes `?t=`; undefined means the end.
 */
export function useEvalPlayhead(
  committed: number | undefined,
  span: number,
  commit: (tick: number | undefined) => void
): EvalPlayhead {
  const { scrub, playing } = useStore();
  const tick = Math.min(span, scrub ?? committed ?? span);

  const settle = (at: number): void => {
    const t = Math.round(Math.min(span, Math.max(0, at)));
    commit(t >= span ? undefined : t);
    set({ scrub: null });
  };

  // Play starts from the moment shown when it was pressed (from 0 at the end)
  const startAt = useEffectEvent((): number => {
    const value = state.scrub ?? committed ?? span;
    return value >= span ? 0 : value;
  });
  // Paused, or at the end, the playhead settles where it stopped. A drag that paused it settles it
  // itself (the scrub has moved on), and leaving the page mid-play settles nothing: the page that
  // follows has its own URL
  const stopAt = useEffectEvent((value: number): void => {
    if (!state.playing && state.scrub === value) settle(value);
  });

  useEffect(() => {
    if (!playing) return;
    let previous = performance.now();
    let value = startAt();
    set({ scrub: value });
    const speed = span / PLAY_SECONDS;
    let frame = requestAnimationFrame(function step(now) {
      value = Math.min(span, value + ((now - previous) / 1000) * speed);
      previous = now;
      set({ scrub: value });
      if (value >= span) {
        set({ playing: false });
        return;
      }
      frame = requestAnimationFrame(step);
    });
    return () => {
      cancelAnimationFrame(frame);
      stopAt(value);
    };
  }, [playing, span]);

  // Leaving the page stops playback and forgets the moving playhead
  useEffect(() => () => set({ scrub: null, playing: false }), []);

  return { tick, playing, settle };
}
