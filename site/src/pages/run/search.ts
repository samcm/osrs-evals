/** The run page's URL state. */

import type { ToolCategory } from '@/data/types';
import { TOOL_CATEGORIES as TOOLS } from '@/lib/tools';
import { mapViewParam } from '@/lib/map';
import { defineSearch, int, legendParams, list, num, oneOf, text, useSearchUpdate } from '@/lib/search';
import { setMoment } from './model';
import { pause } from './playhead';

export const TOOL_CATEGORIES: readonly ToolCategory[] = TOOLS.map(c => c.id);

/** The timeline's lanes, in their order; the first four show unless `lanes` names others */
export const LANE_IDS = ['progress', 'calls', 'sdk', 'activity', 'spend', 'context', 'xp'] as const;
export type LaneId = (typeof LANE_IDS)[number];
export const DEFAULT_LANES: readonly LaneId[] = ['progress', 'calls', 'sdk', 'activity'];

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
  /** Playback speed, as a multiple of the game's 20 ticks a second */
  speed: oneOf(['1', '4', '16', '64'], '4'),
  /** The lanes shown, when not the default ones */
  lanes: list(LANE_IDS),
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
