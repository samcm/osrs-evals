/** Game sprites as data URLs for chart symbols: cropped, drawn at whole device pixels so the canvas never blurs them. */

import { useEffect, useState } from 'react';
import { loadTrimmedSprite } from '@/lib/assets';

export interface SpriteImage {
  url: string;
  /** CSS pixels: one per sprite pixel, halved for sprites larger than `max` */
  width: number;
  height: number;
}

const cache = new Map<string, Promise<SpriteImage>>();

function spriteImage(src: string, max: number): Promise<SpriteImage> {
  const dpr = Math.max(1, Math.round(window.devicePixelRatio || 1));
  const key = `${src}|${max}|${dpr}`;
  let promise = cache.get(key);
  if (!promise) {
    promise = loadTrimmedSprite(src).then(sprite => {
      // One CSS pixel per sprite pixel; a sprite larger than the box is drawn at half (one device pixel per sprite pixel on a 2x screen)
      const half = Math.max(sprite.width, sprite.height) > max && dpr >= 2;
      const width = half ? sprite.width / 2 : sprite.width;
      const height = half ? sprite.height / 2 : sprite.height;
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      const ctx = canvas.getContext('2d')!;
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(sprite.image, 0, 0, canvas.width, canvas.height);
      return { url: canvas.toDataURL(), width, height };
    });
    promise.catch(() => cache.delete(key));
    cache.set(key, promise);
  }
  return promise;
}

/** Sprites by src, ready for `symbol: 'image://' + url`; missing until loaded. */
export function useSpriteImages(srcs: string[], max = 24): Record<string, SpriteImage> {
  const [images, setImages] = useState<Record<string, SpriteImage>>({});
  const key = [...new Set(srcs)].sort().join('|');
  useEffect(() => {
    let live = true;
    const wanted = key ? key.split('|') : [];
    Promise.all(wanted.map(src => spriteImage(src, max).then(img => [src, img] as const, () => null))).then(pairs => {
      if (live) setImages(Object.fromEntries(pairs.filter(p => p != null)));
    });
    return () => {
      live = false;
    };
  }, [key, max]);
  return images;
}
