/** Chart pieces shared by the eval page's charts: x axes, labels with marks, sprites in the canvas. */

import { useEffect, useState } from 'react';
import { categoryAxis, formatAxisNumber, getChartXAxisName, valueAxis } from '@/lib/chartChrome';
import { loadTrimmedSprite } from '@/lib/assets';
import { formatClock, formatCost, formatCostTick, formatInt } from '@/lib/format';
import { niceSteps } from '@/lib/stats';
import { modelInfo, type Variant } from '@/lib/series';
import type { ThemeColors } from '@/lib/theme';
import type { XMeasure, XRange } from './model';

export const LINE_TYPE = { solid: 'solid', dashed: [6, 4], dotted: [1.5, 3] } as const;

/** Narrower than this, line-end labels give way to the legend. */
export const NARROW = 560;

/** A variant's marks for canvas labels: the vendor and the harness, or the Program sprite alone. */
export const variantSlugs = (v: Variant): string[] => (v.vendorSlug === 'program' ? ['program'] : [v.vendorSlug, v.agentSlug]);
/** A variant's text beside its marks, where the agent's mark already names the agent. */
export const variantShortText = (v: Variant): string => (v.vendorSlug === 'program' ? 'Program' : modelInfo(v.model).short);

/** A value on an x measure, for tooltips and table cells. */
export function formatX(value: number | null | undefined, x: XMeasure | 'tokens'): string {
  if (value == null) return '–';
  if (x === 'ticks') return `${formatInt(value)} ticks`;
  if (x === 'seconds') return formatClock(value);
  if (x === 'cost') return formatCost(value);
  if (x === 'tokens') return `${formatAxisNumber(Math.round(value))} tokens`;
  return `${formatInt(value)} calls`;
}

/** An axis tick on an x measure. */
export function formatXTick(value: number, x: XMeasure | 'tokens'): string {
  if (x === 'seconds') return formatClock(value);
  if (x === 'cost') return formatCostTick(value);
  if (value >= 1000) return compact.format(value);
  return formatAxisNumber(value);
}

const compact = new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 });

/** An x axis for a range: log on 1-2-5 steps, or linear from its min to its max. */
export function xAxisFor(c: ThemeColors, range: XRange, x: XMeasure | 'tokens', name?: string) {
  const base = { ...categoryAxis(c), ...(name ? { ...getChartXAxisName(c), name } : {}) };
  if (range.log) {
    const steps = niceSteps(range.min, range.max);
    return {
      type: 'log' as const,
      logBase: 10,
      min: range.min,
      max: range.max,
      ...base,
      axisLabel: { ...base.axisLabel, customValues: steps, formatter: (v: number) => formatXTick(v, x) },
      axisTick: { show: false, customValues: steps },
      splitLine: { show: false },
      minorSplitLine: { show: false },
    };
  }
  return {
    type: 'value' as const,
    min: range.min,
    max: range.max,
    ...base,
    axisLabel: { ...base.axisLabel, hideOverlap: true, formatter: (v: number) => formatXTick(v, x) },
  };
}

/** A y axis from 0, with labels formatted. */
export function yAxisFor(c: ThemeColors, max: number, formatter: (v: number) => string = formatAxisNumber) {
  return { type: 'value' as const, min: 0, max, ...valueAxis(c), axisLabel: { ...valueAxis(c).axisLabel, formatter } };
}

/** Approximate pixel width of a label: its marks, then its text. */
export const labelWidth = (marks: number, text: string): number => marks * 17 + text.length * 6.3 + 4;

const spriteUrls = new Map<string, Promise<string>>();

/** A sprite as a data URL in a `px` box at whole-number scale, never smoothed, for canvas symbols. */
function spriteImage(src: string, px: number): Promise<string> {
  const dpr = window.devicePixelRatio || 1;
  const key = `${src}|${px}|${dpr}`;
  let promise = spriteUrls.get(key);
  if (!promise) {
    promise = loadTrimmedSprite(src).then(sprite => {
      const box = Math.round(px * dpr);
      const canvas = document.createElement('canvas');
      canvas.width = box;
      canvas.height = box;
      const ctx = canvas.getContext('2d')!;
      const k = Math.max(1, Math.floor(box / Math.max(sprite.width, sprite.height)));
      const w = Math.min(box, sprite.width * k);
      const h = Math.min(box, sprite.height * k);
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(sprite.image, Math.floor((box - w) / 2), Math.floor((box - h) / 2), w, h);
      return canvas.toDataURL();
    });
    spriteUrls.set(key, promise);
  }
  return promise;
}

/** Sprites as data URLs by src, for ECharts image symbols; missing until loaded. */
export function useSpriteImages(srcs: string[], px: number): Record<string, string> {
  const [images, setImages] = useState<Record<string, string>>({});
  const key = [...new Set(srcs)].sort().join('|');
  useEffect(() => {
    let live = true;
    const wanted = key ? key.split('|') : [];
    Promise.all(
      wanted.map(src =>
        spriteImage(src, px).then(
          url => [src, url] as const,
          () => null
        )
      )
    ).then(pairs => {
      if (live) setImages(Object.fromEntries(pairs.filter(p => p != null)));
    });
    return () => {
      live = false;
    };
  }, [key, px]);
  return images;
}

export type LabelPosition = 'right' | 'left' | 'top' | 'bottom';

/**
 * Place point labels so they stay in the plot and clear each other and the points: each label
 * takes the first of right, left, top, bottom that fits, from the top point down.
 */
export function placePointLabels(
  points: { px: number; py: number; width: number }[],
  box: { width: number; height: number }
): LabelPosition[] {
  type Rect = [number, number, number, number];
  const overlaps = (a: Rect, b: Rect): boolean => a[0] < b[2] && b[0] < a[2] && a[1] < b[3] && b[1] < a[3];
  const marks: Rect[] = points.map(p => [p.px - 6, p.py - 6, p.px + 6, p.py + 6]);
  const placed: Rect[] = [];
  const out: LabelPosition[] = points.map(() => 'right');
  const order = points.map((_, i) => i).sort((a, b) => points[a].py - points[b].py || points[a].px - points[b].px);
  for (const i of order) {
    const { px, py, width: w } = points[i];
    const h = 16;
    const candidates: [LabelPosition, Rect][] = [
      ['right', [px + 9, py - h / 2, px + 9 + w, py + h / 2]],
      ['left', [px - 9 - w, py - h / 2, px - 9, py + h / 2]],
      ['top', [px - w / 2, py - 9 - h, px + w / 2, py - 9]],
      ['bottom', [px - w / 2, py + 9, px + w / 2, py + 9 + h]],
    ];
    const inside = ([, r]: [LabelPosition, Rect]): boolean => r[0] >= 0 && r[2] <= box.width && r[1] >= 0 && r[3] <= box.height;
    const fits = (cand: [LabelPosition, Rect]): boolean =>
      inside(cand) && !placed.some(o => overlaps(o, cand[1])) && !marks.some((m, j) => j !== i && overlaps(m, cand[1]));
    const choice = candidates.find(fits) ?? candidates.find(inside) ?? candidates[0];
    out[i] = choice[0];
    placed.push(choice[1]);
  }
  return out;
}
