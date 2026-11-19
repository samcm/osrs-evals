/** Chart helpers beyond the chrome: line-end labels that never collide, and brand marks inside the canvas. */

import { useEffect, useState } from 'react';
import { brandSrc } from './assets';

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

const tinted = new Map<string, Promise<string>>();

/**
 * A brand mark as a data URL in one colour, for canvas text (ECharts rich labels, tooltips):
 * the SVG mask filled with `color`; `program` stays the game sprite. Cached per slug, colour, size.
 */
export function brandImage(slug: string, color: string, px: number): Promise<string> {
  const key = `${slug}|${color}|${px}`;
  let promise = tinted.get(key);
  if (!promise) {
    promise = new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        const scale = Math.ceil(window.devicePixelRatio || 1) * 2;
        const canvas = document.createElement('canvas');
        canvas.width = px * scale;
        canvas.height = px * scale;
        const ctx = canvas.getContext('2d')!;
        if (slug === 'program') {
          ctx.imageSmoothingEnabled = false;
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        } else {
          const ratio = Math.min(canvas.width / (img.naturalWidth || canvas.width), canvas.height / (img.naturalHeight || canvas.height));
          const w = (img.naturalWidth || canvas.width) * ratio;
          const h = (img.naturalHeight || canvas.height) * ratio;
          ctx.drawImage(img, (canvas.width - w) / 2, (canvas.height - h) / 2, w, h);
          ctx.globalCompositeOperation = 'source-in';
          ctx.fillStyle = color;
          ctx.fillRect(0, 0, canvas.width, canvas.height);
        }
        resolve(canvas.toDataURL());
      };
      img.onerror = () => {
        tinted.delete(key);
        reject(new Error(`${slug} mark did not load`));
      };
      img.src = brandSrc(slug);
    });
    tinted.set(key, promise);
  }
  return promise;
}

/** Brand marks as data URLs for a chart, by slug; missing until loaded (then the chart re-renders). */
export function useBrandImages(slugs: string[], color: string, px = 14): Record<string, string> {
  const [images, setImages] = useState<Record<string, string>>({});
  const key = [...new Set(slugs)].sort().join(',');
  useEffect(() => {
    let live = true;
    const wanted = key ? key.split(',') : [];
    Promise.all(wanted.map(slug => brandImage(slug, color, px).then(url => [slug, url] as const, () => null))).then(pairs => {
      if (live) setImages(Object.fromEntries(pairs.filter(p => p != null)));
    });
    return () => {
      live = false;
    };
  }, [key, color, px]);
  return images;
}

/** The rich-text style name for a mark: ECharts allows only word characters. */
export const markStyle = (slug: string): string => `m_${slug.replace(/\W/g, '_')}`;

/** Rich-text styles that draw each loaded mark, for a label's `rich`. */
export function markRich(images: Record<string, string>, px = 14): Record<string, object> {
  return Object.fromEntries(
    Object.entries(images).map(([slug, url]) => [markStyle(slug), { width: px, height: px, backgroundColor: { image: url } }])
  );
}

/** Label text: the marks (those loaded), then the text: "{m_anthropic|} {m_bash|} Haiku 5.5". */
export function markText(images: Record<string, string>, slugs: string[], text: string): string {
  const marks = slugs.filter(s => images[s]).map(s => `{${markStyle(s)}|}`);
  return [...marks, text].join(' ');
}
