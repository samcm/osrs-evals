/** The run page's URL state. */

import { mapViewParam } from '@/lib/map';
import { defineSearch, int, legendParams, list, num, oneOf, text, useSearchUpdate } from '@/lib/search';
import { setMoment } from './model';
import { pause } from './playhead';

/** The timeline's lanes, in their order; every one shows unless `lanes` names some */
export const LANE_IDS = ['progress', 'wealth', 'calls', 'sdk', 'activity', 'spend', 'context', 'xp'] as const;
export type LaneId = (typeof LANE_IDS)[number];

export const runSearch = defineSearch({
  /** The lanes' x measure and the transcript's clock */
  x: oneOf(['ticks', 'seconds'], 'ticks'),
  /** The model call picked in the transcript, from 1: the current call when `t` is its tick */
  turn: int(undefined, { min: 1 }),
  /** The playhead, in game ticks; absent is the run's start */
  t: int(undefined, { min: 0 }),
  /** The account the game and the map follow, in a team's run; absent is the run's first */
  acct: text(),
  /** The map's view once the reader moves it; without one the map follows the character */
  map: mapViewParam(),
  /** The map's zoom while it follows, in screen pixels per tile */
  mz: num(undefined),
  /** Playback speed, as a multiple of the game's 20 ticks a second; absent, the one that plays the run in about two minutes */
  speed: oneOf(['1', '4', '16', '64'], undefined),
  /** The lanes shown, when not the default ones */
  lanes: list(LANE_IDS),
  /** The side panel's tab beside the game; absent, the eval's own (skills for total level, else the inventory) */
  panel: oneOf(['inv', 'worn', 'bank', 'skills'], undefined),
  /** The transcript's every call under its chapters; absent, the chapters alone */
  calls: oneOf(['1'], undefined),
  /** Lane cuts */
  cost: oneOf(['usd', 'tokens'], 'usd'),
  sdk: oneOf(['outcome', 'function'], 'outcome'),
  act: oneOf(['moving', 'animations'], 'moving'),
  ...legendParams,
});

export type RunSearch = typeof runSearch.defaults;

/**
 * Settles the playhead at a tick and writes it to the URL (`?t=`, and `?turn=` when a call was
 * picked): stops playback first, without letting it commit where it was.
 */
export function useSettle(): (tick: number, turn?: number) => void {
  const update = useSearchUpdate(runSearch);
  return (tick, turn) => {
    pause();
    setMoment({ scrub: null });
    update({ t: Math.max(0, Math.round(tick)) || undefined, turn });
  };
}
