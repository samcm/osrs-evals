/**
 * Every racing run on the world map at the playhead: its trail so far (the last stretch bold, the
 * rest faint, in its harness's dash), its character as a pin in its model's colour with its
 * vendor's mark, and the quests it has done by then. The map holds still: it is fitted once to where
 * every run of the eval went (`bounds`), so it never reshuffles as the race plays. The reader can pan
 * and zoom; "Fit" goes back to it.
 */

import { useCallback, useEffect, useMemo, useState, type JSX, type RefObject } from 'react';
import { WorldMap, type MapOverlay, type MapPath } from '@/components/WorldMap';
import type { PathPoint } from '@/data/types';
import { brandSrc, loadTrimmedSprite, type TrimmedSprite } from '@/lib/assets';
import { positionAt, surfaceZ, type MapView } from '@/lib/map';
import { levelName, modelInfo, type AgentLine } from '@/lib/series';
import { useThemeColors } from '@/lib/theme';
import { PIN, type Bounds, type PlacedPin, type PointedPin, type Track } from '@/pages/eval/centerpiece/mapData';

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
      const src = brandSrc(slug);
      if (src) img.src = src;
      else reject(new Error(`no mark for ${slug}`));
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
  bounds,
  tick,
  trail,
  view,
  onViewChange,
  height,
  minHeight,
  lit,
  placedRef,
  pointed,
}: {
  tracks: Track[];
  /** What the view is fitted to: where every run of the eval went */
  bounds: Bounds | null;
  tick: number;
  /** The pairing lit by a hover or focus; the others fade */
  lit: string | null;
  /** Filled with where each pin was drawn */
  placedRef: RefObject<PlacedPin[]>;
  /** The pin under the pointer, which a lit run's label sits on */
  pointed: PointedPin | null;
  /** Ticks of trail drawn bold behind each pin */
  trail: number;
  view: MapView | undefined;
  onViewChange: (view: MapView | undefined) => void;
  height: number;
  /** The least the fitted map shrinks to: its neighbour's height */
  minHeight?: number;
}): JSX.Element {
  const colors = useThemeColors();
  const [images, setImages] = useState<Map<string, HTMLImageElement | TrimmedSprite>>(() => new Map());

  const srcKey = [...new Set(tracks.flatMap(t => [`brand:${t.curve.variant.vendorSlug}`, ...t.marks.map(m => m.src)]))]
    .sort()
    .join('|');
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

  // The bounds as an undrawn path from corner to corner: the one thing the map fits to
  const fitPaths = useMemo<MapPath[]>(
    () =>
      bounds
        ? [
            {
              id: 'bounds',
              color: '',
              opacity: 0,
              points: [
                [0, bounds.x0, bounds.z0, 0],
                [1, bounds.x1, bounds.z1, 0],
              ],
            },
          ]
        : [],
    [bounds]
  );

  const overlay = useCallback<MapOverlay>(
    (ctx, toScreen) => {
      const dpr = window.devicePixelRatio || 1;
      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';

      const dim = (t: Track): number => (lit != null && t.curve.variant.key !== lit ? 0.2 : 1);
      // Lit tracks draw last, over the faded ones
      const layered = lit
        ? [...tracks.filter(t => t.curve.variant.key !== lit), ...tracks.filter(t => t.curve.variant.key === lit)]
        : tracks;

      // Trails: faint up to the last stretch, then bold to the pin
      for (const t of layered) {
        const color = colors.resolve(t.curve.variant.color.token);
        const faint = new Path2D();
        const bold = new Path2D();
        for (const points of [t.points, ...t.others.map(o => o.points)]) {
          let last: PathPoint | null = null;
          for (const p of points) {
            if (p[0] > tick) break;
            if (last && p[4] !== 1) {
              const target = p[0] >= tick - trail ? bold : faint;
              target.moveTo(...toScreen(last[1], surfaceZ(last[2])));
              target.lineTo(...toScreen(p[1], surfaceZ(p[2])));
            }
            last = p;
          }
          const head = positionAt(points, tick, t.step);
          if (last && head) {
            bold.moveTo(...toScreen(last[1], surfaceZ(last[2])));
            bold.lineTo(...toScreen(head.x, head.z));
          }
        }
        ctx.strokeStyle = color;
        ctx.setLineDash(DASH[t.curve.variant.line]);
        ctx.globalAlpha = 0.3 * dim(t);
        ctx.lineWidth = 1.5;
        ctx.stroke(faint);
        ctx.globalAlpha = 0.95 * dim(t);
        ctx.lineWidth = 2.5;
        ctx.stroke(bold);
      }
      ctx.setLineDash([]);
      ctx.globalAlpha = 1;

      // Quests so far, as their icons
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
      // One pin per account: a team's run has one for each of its accounts
      const at = tracks.flatMap(t =>
        [{ name: t.others.length ? t.curve.run.account : null, points: t.points }, ...t.others].map(a => {
          const p = positionAt(a.points, tick, t.step);
          return p ? { t, account: a.name, p, xy: toScreen(p.x, p.z) } : null;
        })
      );
      const drawn = at.filter(a => a != null);
      const spot = spread(
        drawn.map(a => a.xy),
        PIN * 2 + 2
      );
      const isLit = (t: Track): number => (lit != null && t.curve.variant.key === lit ? 1 : 0);
      const order = drawn
        .map((a, i) => ({ ...a, s: spot[i] }))
        .sort((a, b) => isLit(a.t) - isLit(b.t) || b.t.rank - a.t.rank);
      placedRef.current = order.map(({ t, s, account }) => ({
        x: s[0],
        y: s[1],
        key: t.curve.variant.key,
        run: t.curve.run.id,
        account,
      }));
      for (const { t, xy, s } of order) {
        const color = colors.resolve(t.curve.variant.color.token);
        ctx.globalAlpha = dim(t) < 1 ? 0.35 : 1;
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

      // The lit pairing's runs say whose they are, as a tooltip would: one label a run, at the pin under
      // the pointer (naming its account in a team's run) or else at its first account's pin
      if (lit != null) {
        const font = getComputedStyle(document.body).fontFamily;
        ctx.textBaseline = 'middle';
        const labelled = order.filter(
          (o, i) =>
            o.t.curve.variant.key === lit &&
            (pointed?.run === o.t.curve.run.id
              ? o.account === pointed.account
              : order.findIndex(p => p.t === o.t) === i)
        );
        for (const { t, s, account: pinAccount } of labelled) {
          const account = pointed?.run === t.curve.run.id ? pinAccount : null;
          const v = t.curve.variant;
          const text = `${modelInfo(v.model).short} ${levelName(v.thinking)}`;
          ctx.font = `500 12px ${font}`;
          const nameWidth = ctx.measureText(text).width;
          ctx.font = `400 12px ${font}`;
          const accountWidth = account ? ctx.measureText(account).width : 0;
          const w = Math.max(nameWidth, accountWidth) + 16;
          const h = account ? 40 : 24;
          // To the pin's right, or its left near the map's right edge
          const right = s[0] + PIN + 4 + w <= ctx.canvas.width / dpr;
          const x = right ? s[0] + PIN + 4 : s[0] - PIN - 4 - w;
          const y = s[1] - h / 2;
          ctx.beginPath();
          ctx.roundRect(x, y, w, h, 4);
          ctx.fillStyle = colors.surface;
          ctx.fill();
          ctx.lineWidth = 1;
          ctx.strokeStyle = colors.border;
          ctx.stroke();
          ctx.font = `500 12px ${font}`;
          ctx.fillStyle = colors.foreground;
          ctx.fillText(text, x + 8, account ? y + 12 : s[1]);
          if (account) {
            ctx.font = `400 12px ${font}`;
            ctx.fillStyle = colors.muted;
            ctx.fillText(account, x + 8, y + 28);
          }
        }
      }
    },
    [colors, images, lit, placedRef, pointed, tick, trail, tracks]
  );

  return (
    <WorldMap
      paths={fitPaths}
      fitKey={bounds ? `${bounds.x0},${bounds.z0},${bounds.x1},${bounds.z1}` : ''}
      view={view}
      onViewChange={onViewChange}
      height={height}
      minHeight={minHeight}
      fitHeight
      overlay={overlay}
      className="rounded-none"
      label="Every run on the world map at the playhead, each a pin in its model's colour with its trail"
    />
  );
}
