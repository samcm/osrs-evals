/** Tool-call categories: one name and one fixed colour each, on every page. */

import type { ToolCategory } from '@/data/types';
import type { SeriesColor } from '@/lib/series';

// Literal class names so Tailwind generates them:
// bg-data-blue border-data-blue fill-data-blue bg-data-sky border-data-sky fill-data-sky
// bg-data-indigo border-data-indigo fill-data-indigo bg-data-emerald border-data-emerald fill-data-emerald
// bg-data-lime border-data-lime fill-data-lime bg-data-amber border-data-amber fill-data-amber
// bg-data-yellow border-data-yellow fill-data-yellow bg-data-pink border-data-pink fill-data-pink
// bg-data-fuchsia border-data-fuchsia fill-data-fuchsia bg-data-green border-data-green fill-data-green
// bg-data-slate border-data-slate fill-data-slate
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

/** In the order stacks draw them. */
export const TOOL_CATEGORIES: ToolCategoryInfo[] = [
  { id: 'write+run', label: 'Write and run', color: hue('blue') },
  { id: 'run', label: 'Run', color: hue('sky') },
  { id: 'write', label: 'Write', color: hue('indigo') },
  { id: 'read', label: 'Read', color: hue('emerald') },
  { id: 'state', label: 'Game state', color: hue('lime') },
  { id: 'wait', label: 'Wait', color: hue('amber') },
  { id: 'stdin', label: 'Input', color: hue('yellow') },
  { id: 'plan', label: 'Plan', color: hue('pink') },
  { id: 'manage', label: 'Manage', color: hue('fuchsia') },
  { id: 'submit', label: 'Submit', color: hue('green') },
  { id: 'other', label: 'Other', color: hue('slate') },
];

export const TOOL_CATEGORY = Object.fromEntries(TOOL_CATEGORIES.map(c => [c.id, c])) as Record<
  ToolCategory,
  ToolCategoryInfo
>;
