/**
 * Tooltip content for ECharts' tooltip, in lab's chrome (`getChartTooltipChrome`): a muted title, then
 * a row per series with its colour, its marks (vendor mark or sprite, short name, thinking level, as
 * SeriesLabel draws them) and its value. ECharts takes HTML, so the marks are written as HTML here.
 */

import { brandSrc } from '@/lib/assets';
import type { SeriesSpec } from '@/lib/chartSeries';
import { levelName } from '@/lib/series';

export interface TooltipRow {
  /** The series the row is about: its colour and marks */
  series?: SeriesSpec;
  /** A label for a row without a series ("Every model's median") */
  label?: string;
  /** The value, formatted */
  value: string;
}

export interface TooltipContent {
  /** The x value or the point's name, formatted */
  title?: string;
  rows: TooltipRow[];
  /** One muted line under the rows (≈ and why, for an inferred value) */
  note?: string;
}

const ESCAPES: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
const escapeHtml = (text: string): string => text.replace(/[&<>"']/g, c => ESCAPES[c]);

/** A mark as the BrandMark draws it: the logo as a mask in the text colour. */
function markHtml(slug: string): string {
  const src = brandSrc(slug);
  if (slug === 'program' && src) return spriteHtml(src);
  if (!src) return '';
  const mask = `url(${src}) center / contain no-repeat`;
  return `<span aria-hidden="true" class="inline-block size-3.5 shrink-0 bg-foreground" style="mask:${mask};-webkit-mask:${mask}"></span>`;
}

const spriteHtml = (src: string): string =>
  `<img src="${escapeHtml(src)}" alt="" class="size-3.5 shrink-0 object-contain" style="image-rendering:pixelated">`;

/** A series' marks and name, as SeriesLabel draws them. */
function seriesLabelHtml(series: SeriesSpec): string {
  const mark = series.sprite
    ? spriteHtml(series.sprite)
    : series.vendor
      ? markHtml(series.vendor)
      : series.harness
        ? markHtml(series.harness.slug)
        : '';
  const level = series.thinking
    ? `<span class="shrink-0 text-muted">${escapeHtml(levelName(series.thinking))}</span>`
    : '';
  return `<span class="inline-flex min-w-0 items-center gap-1.5 whitespace-nowrap">${mark}<span class="truncate">${escapeHtml(series.label)}</span>${level}</span>`;
}

/** Rows a tooltip lists before it counts the rest, so it never outgrows the screen. */
const MAX_ROWS = 12;

/**
 * The tooltip's HTML; `color` resolves a series colour for its swatch. The lit series' row is
 * emphasised and always listed; past MAX_ROWS the rest are counted.
 */
export function tooltipHtml(
  content: TooltipContent,
  color: (css: string) => string,
  lit?: ReadonlySet<string> | null
): string {
  const isLit = (row: TooltipRow): boolean => lit != null && row.series != null && lit.has(row.series.id);
  let shown = content.rows;
  if (shown.length > MAX_ROWS) {
    const kept = new Set(shown.slice(0, MAX_ROWS - 1));
    for (const row of shown) if (isLit(row)) kept.add(row);
    shown = shown.filter(row => kept.has(row));
  }
  const more = content.rows.length - shown.length;
  const rows = shown
    .map(row => {
      const swatch = row.series
        ? `<span aria-hidden="true" class="size-2.5 shrink-0 rounded-xs" style="background:${color(row.series.color)}"></span>`
        : '<span aria-hidden="true" class="size-2.5 shrink-0"></span>';
      const name = row.series
        ? seriesLabelHtml(row.series)
        : `<span class="text-muted">${escapeHtml(row.label ?? '')}</span>`;
      return `<div class="flex items-center gap-2${isLit(row) ? ' font-semibold' : ''}">${swatch}${name}<span class="ml-auto pl-4 font-mono tabular-nums">${escapeHtml(row.value)}</span></div>`;
    })
    .join('');
  const rest = more > 0 ? `<div class="pl-4.5 text-muted">${more} more</div>` : '';
  const title = content.title ? `<div class="text-muted">${escapeHtml(content.title)}</div>` : '';
  const note = content.note
    ? `<div class="max-w-64 whitespace-normal text-muted">${escapeHtml(content.note)}</div>`
    : '';
  return `<div class="flex min-w-40 flex-col gap-1 text-xs">${title}${rows}${rest}${note}</div>`;
}
