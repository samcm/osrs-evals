/** Line-end labels that never collide: the layout, shared by the chart kit's EndLabels and the old ECharts charts. */

export interface EndLabelInput {
  id: string;
  /** The series' last y value, in data units */
  value: number;
  /** Higher keeps its label when there is no room for all */
  priority?: number;
}

/**
 * Place line-end labels so none overlap: each label starts at its line's end and is nudged up or
 * down by the least that clears its neighbours; labels that still don't fit inside the plot are
 * dropped (lowest priority first). Returns each id's vertical offset in pixels (for
 * `endLabel.offset: [0, dy]`), or null for a dropped label.
 */
export function layoutEndLabels(
  items: EndLabelInput[],
  axis: { min: number; max: number; height: number; log?: boolean; lineHeight?: number }
): Map<string, number | null> {
  const lineHeight = axis.lineHeight ?? 14;
  const f = (v: number): number => (axis.log ? Math.log10(Math.max(v, Number.MIN_VALUE)) : v);
  const lo = f(axis.min);
  const span = f(axis.max) - lo || 1;
  const toPx = (v: number): number => axis.height * (1 - (f(v) - lo) / span);
  const capacity = Math.max(1, Math.floor(axis.height / lineHeight) + 1);
  const kept = [...items].sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0)).slice(0, capacity);
  const result = new Map<string, number | null>(items.map(i => [i.id, null]));

  // Top to bottom by where each line ends; push each label below the previous one, then pull the
  // stack back up from the bottom edge if it ran out of the plot.
  const placed = kept.map(i => ({ id: i.id, want: toPx(i.value), y: toPx(i.value) })).sort((a, b) => a.want - b.want);
  for (let i = 0; i < placed.length; i++) {
    placed[i].y = Math.max(placed[i].want, i ? placed[i - 1].y + lineHeight : 0);
  }
  for (let i = placed.length - 1; i >= 0; i--) {
    const limit = i === placed.length - 1 ? axis.height : placed[i + 1].y - lineHeight;
    placed[i].y = Math.min(placed[i].y, limit);
  }
  for (const p of placed) result.set(p.id, Math.round(p.y - p.want));
  return result;
}
