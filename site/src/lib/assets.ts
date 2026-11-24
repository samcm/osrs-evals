/** Paths of the static art under public/assets and public/data, per the asset contract. */

import { providerLogo } from './series';

/** Harness marks: one-colour SVGs, drawn as masks by BrandMark. Makers' and inference providers'
 * logos come with the data (models.dev, saved by export.py), by their models.dev id. */
const BRAND_SLUGS = ['claude-code', 'codex', 'opencode', 'amp', 'bash', 'omp'] as const;

/** A mark's file: a harness's from the site, a maker's or provider's from the data; null when there is none. */
export function brandSrc(slug: string): string | null {
  if (slug === 'program') return '/assets/brands/program.png';
  return (BRAND_SLUGS as readonly string[]).includes(slug) ? `/assets/brands/${slug}.svg` : providerLogo(slug);
}
/** An item sprite by cache id ("995", "995-10000" for a stack). */
export const itemSrc = (id: string | number): string => `/assets/items/${id}.png`;
/** A skill icon by lowercase skill name ("cooking"). */
export const skillSrc = (skill: string): string => `/assets/skills/${skill}.png`;
/** A quest icon (its reward item) by quest id ("cooks_assistant"). */
export const questSrc = (questId: string): string => `/assets/quests/${questId}.png`;
/** An interface side icon ("quests", "stats", "inventory"). */
export const uiSrc = (name: string): string => `/assets/ui/${name}.png`;

export interface TrimmedSprite {
  /** The sprite cropped to its opaque pixels */
  image: HTMLCanvasElement;
  width: number;
  height: number;
}

const trimmed = new Map<string, Promise<TrimmedSprite>>();

/** Load a sprite and crop its transparent margin (cached per src); rejects when it fails to load. */
export function loadTrimmedSprite(src: string): Promise<TrimmedSprite> {
  let promise = trimmed.get(src);
  if (!promise) {
    promise = new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        const w = img.naturalWidth;
        const h = img.naturalHeight;
        const full = document.createElement('canvas');
        full.width = w;
        full.height = h;
        const ctx = full.getContext('2d', { willReadFrequently: true })!;
        ctx.drawImage(img, 0, 0);
        const data = ctx.getImageData(0, 0, w, h).data;
        let x0 = w;
        let y0 = h;
        let x1 = -1;
        let y1 = -1;
        for (let y = 0; y < h; y++) {
          for (let x = 0; x < w; x++) {
            if (data[(y * w + x) * 4 + 3] > 0) {
              if (x < x0) x0 = x;
              if (x > x1) x1 = x;
              if (y < y0) y0 = y;
              if (y > y1) y1 = y;
            }
          }
        }
        if (x1 < 0) return resolve({ image: full, width: w, height: h });
        const image = document.createElement('canvas');
        image.width = x1 - x0 + 1;
        image.height = y1 - y0 + 1;
        image.getContext('2d')!.drawImage(full, x0, y0, image.width, image.height, 0, 0, image.width, image.height);
        resolve({ image, width: image.width, height: image.height });
      };
      img.onerror = () => {
        trimmed.delete(src);
        reject(new Error(`${src} did not load`));
      };
      img.src = src;
    });
    trimmed.set(src, promise);
  }
  return promise;
}
