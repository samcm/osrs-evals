/** Tool-call categories: one name and one fixed colour each, on every page. */

import type { ToolCategory } from '@/data/types';
import type { SeriesColor } from '@/lib/series';

// Literal class names so Tailwind generates them:
// bg-data-blue border-data-blue fill-data-blue bg-data-cyan border-data-cyan fill-data-cyan
// bg-data-purple border-data-purple fill-data-purple bg-data-emerald border-data-emerald fill-data-emerald
// bg-data-pink border-data-pink fill-data-pink bg-data-amber border-data-amber fill-data-amber
// bg-data-rose border-data-rose fill-data-rose bg-data-slate border-data-slate fill-data-slate
const hue = (name: string): SeriesColor => ({
  token: `--color-data-${name}`,
  swatchClassName: `bg-data-${name}`,
  borderClassName: `border-data-${name}`,
  fillClassName: `fill-data-${name}`,
});

export interface ToolCategoryInfo {
  id: ToolCategory;
  label: string;
  color: SeriesColor;
}

/** In the order stacks draw them; no two neighbours share a hue family, so a stack reads apart. */
export const TOOL_CATEGORIES: ToolCategoryInfo[] = [
  { id: 'write+run', label: 'Write and run', color: hue('blue') },
  { id: 'run', label: 'Run', color: hue('cyan') },
  { id: 'write', label: 'Write', color: hue('purple') },
  { id: 'read', label: 'Read', color: hue('emerald') },
  { id: 'state', label: 'Game state', color: hue('pink') },
  { id: 'wait', label: 'Wait', color: hue('amber') },
  { id: 'submit', label: 'Submit', color: hue('rose') },
  { id: 'other', label: 'Other', color: hue('slate') },
];

export const TOOL_CATEGORY = Object.fromEntries(TOOL_CATEGORIES.map(c => [c.id, c])) as Record<
  ToolCategory,
  ToolCategoryInfo
>;
