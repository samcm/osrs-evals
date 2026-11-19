/** The run page's URL state. */

import type { ToolCategory } from '@/data/types';
import { TOOL_CATEGORIES as TOOLS } from '@/lib/tools';
import { mapViewParam } from '@/lib/map';
import { defineSearch, int, legendParams, list, oneOf } from '@/lib/search';

export const TOOL_CATEGORIES: readonly ToolCategory[] = TOOLS.map(c => c.id);

export const runSearch = defineSearch({
  /** The lanes' x measure and the transcript's clock */
  x: oneOf(['ticks', 'seconds'], 'ticks'),
  /** The selected model call, from 1 */
  turn: int(undefined, { min: 1 }),
  /** The map's time, in game ticks */
  t: int(undefined, { min: 0 }),
  map: mapViewParam(),
  /** The map shows the whole path rather than following the character */
  overview: oneOf(['1'], undefined),
  /** Playback speed, as a multiple of the game's 20 ticks a second */
  speed: oneOf(['1', '4', '16', '64'], '16'),
  /** Transcript filters: tool categories, and only turns with an error */
  tools: list(TOOL_CATEGORIES),
  errors: oneOf(['1'], undefined),
  /** Lane cuts */
  cost: oneOf(['usd', 'tokens'], 'usd'),
  sdk: oneOf(['outcome', 'function'], 'outcome'),
  act: oneOf(['moving', 'animations'], 'moving'),
  ...legendParams,
});

export type RunSearch = typeof runSearch.defaults;
