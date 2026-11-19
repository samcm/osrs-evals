/**
 * Every racing run on the world map at the playhead: its trail so far (the last stretch bold, the
 * rest faint, in its harness's dash), its character as a pin in its model's colour with its
 * vendor's mark, and the quests and deaths it has had by then.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { WorldMap, type MapOverlay, type MapPath } from '@/components/WorldMap';
import type { PathPoint } from '@/data/types';
import { brandSrc, loadTrimmedSprite, questSrc, skillSrc, uiSrc, type TrimmedSprite } from '@/lib/assets';
import { UNDERGROUND_Z, type MapView } from '@/lib/map';
import type { AgentLine } from '@/lib/series';
import { useThemeColors } from '@/lib/theme';
import type { RunCurve } from '../model';
import { positionAt } from './race';

export interface Track {
  curve: RunCurve;
  points: readonly PathPoint[];
  /** Most ticks between two recorded points while walking */
  step: number;
  /** Quests and deaths, with where they happened */
  marks: { tick: number; x: number; z: number; src: string; inferred: boolean }[];
  /** Place at the playhead, from 0 */
  rank: number;
}

const PIN = 10;
const MARK = 12;
const DASH: Record<AgentLine, number[]> = { solid: [], dashed: [7, 5], dotted: [0.5, 4.5] };

// Vendor marks, tinted for the canvas (the DOM draws them as a CSS mask)
const brandImages = new Map<string, Promise<HTMLImageElement>>();
function loadBrand(slug: string): Promise<HTMLImageElement> {
  let promise = brandImages.get(slug);
  if (!promise) {
    promise = new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = brandSrc(slug);
    });
    brandImages.set(slug, promise);
  }
  return promise;
}

const tinted = new Map<string, HTMLCanvasElement>();
function tint(img: HTMLImageElement, color: string, px: number): HTMLCanvasElement {
  const key = `${img.src}|${color}|${px}`;
  let canvas = tinted.get(key);
  if (!canvas) {
    canvas = document.createElement('canvas');
    canvas.width = px;
    canvas.height = px;
    const ctx = canvas.getContext('2d')!;
    ctx.drawImage(img, 0, 0, px, px);
    ctx.globalCompositeOperation = 'source-in';
    ctx.fillStyle = color;
    ctx.fillRect(0, 0, px, px);
    tinted.set(key, canvas);
  }
  return canvas;
}

/** Push overlapping pins apart so each stays visible; deterministic, so it doesn't flicker. */
function spread(points: [number, number][], gap: number): [number, number][] {
  const out = points.map(([x, y]) => [x, y] as [number, number]);
  for (let pass = 0; pass < 6; pass++) {
    for (let i = 0; i < out.length; i++)
      for (let j = i + 1; j < out.length; j++) {
        let dx = out[j][0] - out[i][0];
        let dy = out[j][1] - out[i][1];
        let d = Math.hypot(dx, dy);
        if (d >= gap) continue;
        if (d < 0.01) {
          const angle = (j * 2.399) % (Math.PI * 2);
          dx = Math.cos(angle);
          dy = Math.sin(angle);
          d = 1;
        }
        const push = (gap - d) / 2;
        out[i][0] -= (dx / d) * push;
        out[i][1] -= (dy / d) * push;
        out[j][0] += (dx / d) * push;
        out[j][1] += (dy / d) * push;
      }
  }
  return out;
}

export function RaceMap({
  tracks,
  tick,
  trail,
  view,
  onViewChange,
  height,
}: {
  tracks: Track[];
  tick: number;
  /** Ticks of trail drawn bold behind each pin */
  trail: number;
  view: MapView | undefined;
  onViewChange: (view: MapView | undefined) => void;
  height: number;
}) {
  const colors = useThemeColors();
  const [images, setImages] = useState<Map<string, HTMLImageElement | TrimmedSprite>>(new Map());

  const srcKey = [...new Set(tracks.flatMap(t => [`brand:${t.curve.variant.vendorSlug}`, ...t.marks.map(m => m.src)]))].sort().join('|');
  useEffect(() => {
    let live = true;
    const keys = srcKey ? srcKey.split('|') : [];
    Promise.all(
      keys.map(key =>
        (key.startsWith('brand:') ? loadBrand(key.slice(6)) : loadTrimmedSprite(key)).then(
          img => [key, img] as const,
          () => null
        )
      )
    ).then(pairs => live && setImages(new Map(pairs.filter(p => p != null))));
    return () => {
      live = false;
    };
  }, [srcKey]);

  // The whole of each path, undrawn, so the map fits where the runs go rather than where they are
  const fitPaths = useMemo<MapPath[]>(
    () => tracks.map(t => ({ id: t.curve.run.id, color: t.curve.variant.color.token, points: t.points as unknown as MapPath["points"], opacity: 0 })),
    [tracks]
  );

  const overlay = useCallback<MapOverlay>(
    (ctx, toScreen) => {
      const dpr = window.devicePixelRatio || 1;
      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';
      const surface = (p: PathPoint): boolean => p[2] < UNDERGROUND_Z && p[3] === 0;

      // Trails: faint up to the last stretch, then bold to the pin
      for (const t of tracks) {
        const color = colors.resolve(t.curve.variant.color.token);
        const faint = new Path2D();
        const bold = new Path2D();
        let last: PathPoint | null = null;
        for (const p of t.points) {
          if (p[0] > tick) break;
          if (last && p[4] !== 1 && surface(last) && surface(p)) {
            const target = p[0] >= tick - trail ? bold : faint;
            target.moveTo(...toScreen(last[1], last[2]));
            target.lineTo(...toScreen(p[1], p[2]));
          }
          last = p;
        }
        const head = positionAt(t.points, tick, t.step);
        if (last && head?.surface && surface(last)) {
          bold.moveTo(...toScreen(last[1], last[2]));
          bold.lineTo(...toScreen(head.x, head.z));
        }
        ctx.strokeStyle = color;
        ctx.setLineDash(DASH[t.curve.variant.line]);
        ctx.globalAlpha = 0.3;
        ctx.lineWidth = 1.5;
        ctx.stroke(faint);
        ctx.globalAlpha = 0.95;
        ctx.lineWidth = 2.5;
        ctx.stroke(bold);
      }
      ctx.setLineDash([]);
      ctx.globalAlpha = 1;

      // Quests and deaths so far, as their sprites
      const k = Math.max(1, Math.floor(dpr));
      ctx.imageSmoothingEnabled = false;
      for (const t of tracks)
        for (const m of t.marks) {
          const sprite = images.get(m.src) as TrimmedSprite | undefined;
          if (m.tick > tick || !sprite) continue;
          const [sx, sy] = toScreen(m.x, m.z);
          const scale = Math.min(k, Math.max(1, Math.floor((MARK * 2 * dpr) / Math.max(sprite.width, sprite.height))));
          const w = (sprite.width * scale) / dpr;
          const h = (sprite.height * scale) / dpr;
          if (m.inferred) {
            ctx.beginPath();
            ctx.arc(sx, sy, Math.max(w, h) / 2 + 3, 0, Math.PI * 2);
            ctx.setLineDash([2, 2]);
            ctx.lineWidth = 1;
            ctx.strokeStyle = colors.muted;
            ctx.stroke();
            ctx.setLineDash([]);
          }
          ctx.drawImage(sprite.image, Math.round((sx - w / 2) * dpr) / dpr, Math.round((sy - h / 2) * dpr) / dpr, w, h);
        }

      // Pins, the leader drawn last so it sits on top
      const at = tracks.map(t => {
        const p = positionAt(t.points, tick, t.step);
        return p ? { t, p, xy: toScreen(p.x, p.z) } : null;
      });
      const placed = at.filter(a => a != null);
      const spot = spread(
        placed.map(a => a.xy),
        PIN * 2 + 2
      );
      const order = placed.map((a, i) => ({ ...a, s: spot[i] })).sort((a, b) => b.t.rank - a.t.rank);
      for (const { t, p, xy, s } of order) {
        const color = colors.resolve(t.curve.variant.color.token);
        ctx.globalAlpha = p.surface ? 1 : 0.45;
        if (Math.hypot(s[0] - xy[0], s[1] - xy[1]) > PIN * 0.6) {
          ctx.beginPath();
          ctx.moveTo(xy[0], xy[1]);
          ctx.lineTo(s[0], s[1]);
          ctx.lineWidth = 1.5;
          ctx.strokeStyle = color;
          ctx.stroke();
          ctx.beginPath();
          ctx.arc(xy[0], xy[1], 2.5, 0, Math.PI * 2);
          ctx.fillStyle = color;
          ctx.fill();
        }
        ctx.beginPath();
        ctx.arc(s[0], s[1], PIN, 0, Math.PI * 2);
        ctx.fillStyle = color;
        ctx.fill();
        ctx.lineWidth = 2;
        ctx.strokeStyle = colors.surface;
        ctx.stroke();
        const brand = images.get(`brand:${t.curve.variant.vendorSlug}`) as HTMLImageElement | undefined;
        if (brand) {
          const size = 12;
          const px = Math.round(size * dpr);
          ctx.drawImage(tint(brand, colors.surface, px), s[0] - size / 2, s[1] - size / 2, size, size);
        }
      }
      ctx.globalAlpha = 1;
    },
    [colors, images, tick, trail, tracks]
  );

  return (
    <WorldMap
      paths={fitPaths}
      view={view}
      onViewChange={onViewChange}
      height={height}
      fitHeight
      overlay={overlay}
      label="Every run on the world map at the playhead, each a pin in its model's colour with its trail"
    />
  );
}

/** A run's quests and deaths as map marks, placed where it was at the time. */
export function marksOf(
  events: { kind: string; tick: number; quest?: string | null; source?: string }[] | undefined,
  points: readonly PathPoint[],
  step: number
): Track['marks'] {
  if (!events) return [];
  return events.flatMap(e => {
    if (e.kind !== 'quest' && e.kind !== 'death') return [];
    const p = positionAt(points, e.tick, step);
    if (!p?.surface) return [];
    const src = e.kind === 'death' ? skillSrc('hitpoints') : e.quest ? questSrc(e.quest) : uiSrc('quests');
    return [{ tick: e.tick, x: p.x, z: p.z, src, inferred: e.kind === 'quest' && e.source === 'inferred' }];
  });
}
