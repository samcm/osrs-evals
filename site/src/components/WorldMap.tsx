import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Tip } from '@/components/bits';
import { useQuery } from '@tanstack/react-query';
import clsx from 'clsx';
import { loadTrimmedSprite, type TrimmedSprite } from '@/lib/assets';
import { imageToTile, MAP_IMAGE, MAP_IMAGE_2X, mapMetaQuery, positionAt, roundView, surfaceZ, tileToImage, type MapMeta, type MapView, type PathPoint } from '@/lib/map';
import { Button } from '@/components/ui/button';
import { useThemeColors } from '@/lib/theme';

export interface MapPath {
  id: string;
  /** A colour token ("--color-data-teal") or a resolved CSS colour */
  color: string;
  /** Colours along the path from its first tick to its last (tokens or CSS colours); overrides `color` */
  ramp?: readonly string[];
  /** The ticks the ramp runs between; default the path's first and last */
  rampSpan?: readonly [number, number];
  points: readonly PathPoint[];
  /** Line width in screen pixels; default 1.5 */
  width?: number;
  /** Default 1 */
  opacity?: number;
  /** A tick to mark with a dot at the path's position then */
  at?: number;
}

export interface MapMarker {
  id: string;
  /** Tile coordinates */
  x: number;
  z: number;
  /** A sprite path, drawn at one CSS pixel per sprite pixel */
  src: string;
  /** Shown on hover */
  title?: string;
}

/** Draws over the map in CSS pixels (the context is scaled for the device). */
export type MapOverlay = (ctx: CanvasRenderingContext2D, toScreen: (x: number, z: number) => [number, number], zoom: number) => void;

interface Camera {
  /** Centre in map-image pixels */
  cx: number;
  cy: number;
  /** Screen (CSS) pixels per map-image pixel */
  s: number;
}

/** Zoom limits in screen pixels per tile. */
const MAX_ZOOM = 32;

const mapImages = new Map<string, Promise<HTMLImageElement>>();
function loadMapImage(src: string): Promise<HTMLImageElement> {
  let promise = mapImages.get(src);
  if (!promise) {
    promise = new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => {
        mapImages.delete(src);
        reject(new Error(`${src} did not load`));
      };
      img.src = src;
    });
    mapImages.set(src, promise);
  }
  return promise;
}

interface Prepared {
  /** Image-pixel coordinates of surface points, x then y */
  xy: Float32Array;
  ticks: Float64Array;
  /** [start, end) point ranges of unbroken runs: a jump (teleport, respawn) starts a new one */
  runs: [number, number][];
}

const preparedCache = new WeakMap<readonly PathPoint[], Prepared>();

/** A path's points in image pixels, as drawn on the surface map, split at jumps; cached per points array. */
function prepare(meta: MapMeta, points: readonly PathPoint[]): Prepared {
  const cached = preparedCache.get(points);
  if (cached) return cached;
  const xy = new Float32Array(points.length * 2);
  const ticks = new Float64Array(points.length);
  const runs: [number, number][] = [];
  let start = 0;
  points.forEach(([tick, x, z, , jump], n) => {
    if (jump === 1 && n > start) runs.push([start, n]), (start = n);
    const [px, py] = tileToImage(meta, x, surfaceZ(z));
    xy[n * 2] = px;
    xy[n * 2 + 1] = py;
    ticks[n] = tick;
  });
  if (points.length > start) runs.push([start, points.length]);
  const result = { xy, ticks, runs };
  preparedCache.set(points, result);
  return result;
}

function parseRgb(color: string): [number, number, number] {
  const m = color.match(/(\d+(?:\.\d+)?)\D+(\d+(?:\.\d+)?)\D+(\d+(?:\.\d+)?)/);
  return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : [128, 128, 128];
}

function rampColor(stops: [number, number, number][], f: number): string {
  if (stops.length === 1) return `rgb(${stops[0].join(',')})`;
  const t = Math.min(1, Math.max(0, f)) * (stops.length - 1);
  const i = Math.min(stops.length - 2, Math.floor(t));
  const k = t - i;
  const c = stops[i].map((v, j) => Math.round(v + (stops[i + 1][j] - v) * k));
  return `rgb(${c.join(',')})`;
}

/**
 * The 2004scape world map with run paths, markers and time dots. Pan by dragging, zoom with
 * ctrl/⌘ + wheel, a trackpad or two-finger pinch, double-click, or the buttons. With no `view` it
 * fits the paths; `onViewChange` reports the view when a gesture ends (undefined after "Fit"), so a
 * page can keep it in the URL. Underground and upstairs positions are drawn where they are on the
 * surface; a jump (teleport, respawn) breaks the line.
 */
export function WorldMap({
  paths,
  markers = [],
  view,
  onViewChange,
  height = 360,
  fitHeight = false,
  minHeight = 200,
  fitKey,
  padding = 24,
  label,
  className,
  overlay,
  follow,
  followZoom = 6,
  onFollowZoom,
  dim = 0,
}: {
  paths: MapPath[];
  markers?: MapMarker[];
  /** Centre tile and zoom; undefined fits the paths */
  view?: MapView;
  onViewChange?: (view: MapView | undefined) => void;
  /** CSS pixels */
  height?: number;
  /** Shrink the frame to the paths' shape at its width, up to `height`, so the map fills it */
  fitHeight?: boolean;
  /** The least a fitted frame shrinks to, as when it must match a neighbour's height */
  minHeight?: number;
  /** What the fitted view depends on, when not every path's length (a trail that grows with time) */
  fitKey?: string;
  /** Space around the paths when fitting, in CSS pixels */
  padding?: number;
  /** Accessible description of what the map shows */
  label?: string;
  className?: string;
  /** Draws over everything else on each draw, in CSS pixels; `toScreen` places a tile, `zoom` is
   * screen pixels per tile. A new function redraws the map, so animate by passing a new one. */
  overlay?: MapOverlay;
  /** Tiles to keep in view while there is no `view` (characters at the playhead): the map centres on
   * them, as close as `followZoom`. Dragging stops following (reported as a view); "Follow" starts
   * it again. */
  follow?: readonly { x: number; z: number }[] | null;
  /** Screen pixels per tile while following, at the most */
  followZoom?: number;
  /** Zooming while following reports the new zoom here, and keeps following; without it a zoom stops following */
  onFollowZoom?: (zoom: number) => void;
  /** Fade the map image toward the page colour by this much (0–1), so an overlay reads over it */
  dim?: number;
}) {
  const { data: meta, isError: metaFailed } = useQuery(mapMetaQuery);
  const [image, setImage] = useState<HTMLImageElement | null>(null);
  const [image2x, setImage2x] = useState<HTMLImageElement | null>(null);
  const [imageFailed, setImageFailed] = useState(false);
  const [sprites, setSprites] = useState<Map<string, TrimmedSprite>>(new Map());
  const [size, setSize] = useState({ w: 0, h: height });
  const colors = useThemeColors();
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const camera = useRef<Camera | null>(null);
  const frame = useRef(0);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const moved = useRef(false);
  const wheelTimer = useRef(0);

  useEffect(() => {
    let live = true;
    loadMapImage(MAP_IMAGE).then(
      img => live && setImage(img),
      () => live && setImageFailed(true)
    );
    loadMapImage(MAP_IMAGE_2X).then(
      img => live && setImage2x(img),
      () => undefined
    );
    return () => {
      live = false;
    };
  }, []);

  const markerKey = markers.map(m => m.src).join('|');
  useEffect(() => {
    let live = true;
    const srcs = [...new Set(markerKey ? markerKey.split('|') : [])];
    Promise.all(srcs.map(src => loadTrimmedSprite(src).then(s => [src, s] as const, () => null))).then(pairs => {
      if (live) setSprites(new Map(pairs.filter(p => p != null)));
    });
    return () => {
      live = false;
    };
  }, [markerKey]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => setSize({ w: entry.contentRect.width, h: entry.contentRect.height }));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const prepared = useMemo(() => (meta ? paths.map(path => ({ path, ...prepare(meta, path.points) })) : []), [meta, paths]);
  // What the fitted view depends on: which paths and markers, not their time dots or styles
  const geometryKey = fitKey ?? `${paths.map(p => `${p.id}:${p.points.length}`).join('|')}#${markers.map(m => `${m.x},${m.z}`).join('|')}`;

  /** The frame's height: the fitted paths' shape at the frame's width, so the map fills it; `height` is the most. */
  const frameHeight = useMemo(() => {
    if (!fitHeight || !meta || size.w === 0) return height;
    let y0 = Infinity;
    let y1 = -Infinity;
    let x0 = Infinity;
    let x1 = -Infinity;
    for (const p of prepared)
      for (const [a, b] of p.runs)
        for (let i = a; i < b; i++) {
          x0 = Math.min(x0, p.xy[i * 2]);
          x1 = Math.max(x1, p.xy[i * 2]);
          y0 = Math.min(y0, p.xy[i * 2 + 1]);
          y1 = Math.max(y1, p.xy[i * 2 + 1]);
        }
    if (x0 === Infinity) return height;
    // At least ~50 tiles across, so a run that stays in one building still shows where it is
    const minSpan = 48 * meta.px_per_tile;
    const aspect = Math.max(y1 - y0, minSpan) / Math.max(x1 - x0, minSpan);
    return Math.round(Math.min(height, Math.max(minHeight, (size.w - 2 * padding) * aspect + 2 * padding)));
  }, [fitHeight, height, minHeight, meta, padding, prepared, size.w]);

  /** The camera that fits every path and marker (or the whole map) with padding. */
  const fit = useCallback((): Camera | null => {
    if (!meta || size.w === 0) return null;
    let x0 = Infinity;
    let y0 = Infinity;
    let x1 = -Infinity;
    let y1 = -Infinity;
    const add = (x: number, y: number): void => {
      x0 = Math.min(x0, x);
      y0 = Math.min(y0, y);
      x1 = Math.max(x1, x);
      y1 = Math.max(y1, y);
    };
    for (const p of prepared) for (const [a, b] of p.runs) for (let i = a; i < b; i++) add(p.xy[i * 2], p.xy[i * 2 + 1]);
    for (const m of markers) add(...tileToImage(meta, m.x, m.z));
    if (x0 === Infinity) {
      x0 = 0;
      y0 = 0;
      x1 = meta.width;
      y1 = meta.height;
    }
    // At least ~50 tiles across, so a run that stays in one building still shows where it is
    const minSpan = 48 * meta.px_per_tile;
    const w = Math.max(x1 - x0, minSpan);
    const h = Math.max(y1 - y0, minSpan);
    // clampScale stops at the map filling the frame: paths at the map's edge give up their padding
    const s = clampScale(meta, size, Math.min((size.w - 2 * padding) / w, (size.h - 2 * padding) / h));
    return clampCentre(meta, { cx: (x0 + x1) / 2, cy: (y0 + y1) / 2, s }, size);
  }, [meta, markers, padding, prepared, size]);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    const cam = camera.current;
    if (!canvas || !cam || !meta || !image) return;
    const dpr = window.devicePixelRatio || 1;
    // The backing store follows the container here, so a resize never leaves a cleared canvas
    const bw = Math.round(size.w * dpr);
    const bh = Math.round(size.h * dpr);
    if (canvas.width !== bw || canvas.height !== bh) {
      canvas.width = bw;
      canvas.height = bh;
    }
    const ctx = canvas.getContext('2d')!;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = 1;
    ctx.fillStyle = colors.background;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const ox = size.w / 2 - cam.cx * cam.s;
    const oy = size.h / 2 - cam.cy * cam.s;
    ctx.setTransform(cam.s * dpr, 0, 0, cam.s * dpr, ox * dpr, oy * dpr);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(image2x && cam.s * dpr > 1 ? image2x : image, 0, 0, meta.width, meta.height);
    if (dim > 0) {
      ctx.globalAlpha = dim;
      ctx.fillRect(0, 0, meta.width, meta.height);
      ctx.globalAlpha = 1;
    }

    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    const resolve = (color: string): string => (color.startsWith('--') ? colors.resolve(color) : color);
    for (const { path, xy, ticks, runs } of prepared) {
      ctx.globalAlpha = path.opacity ?? 1;
      ctx.lineWidth = (path.width ?? 1.5) / cam.s;
      if (path.ramp?.length) {
        const stops = path.ramp.map(c => parseRgb(resolve(c)));
        const n = runs.length ? runs[runs.length - 1][1] : 0;
        const t0 = path.rampSpan?.[0] ?? ticks[0];
        const span = path.rampSpan ? path.rampSpan[1] - t0 || 1 : n ? ticks[n - 1] - t0 || 1 : 1;
        const chunk = Math.max(2, Math.ceil(n / 48));
        for (const [a, b] of runs) {
          for (let i = a; i < b - 1; i += chunk) {
            const end = Math.min(b - 1, i + chunk);
            ctx.strokeStyle = rampColor(stops, (ticks[i] - t0) / span);
            ctx.beginPath();
            ctx.moveTo(xy[i * 2], xy[i * 2 + 1]);
            for (let j = i + 1; j <= end; j++) ctx.lineTo(xy[j * 2], xy[j * 2 + 1]);
            ctx.stroke();
          }
        }
      } else {
        ctx.strokeStyle = resolve(path.color);
        ctx.beginPath();
        for (const [a, b] of runs) {
          ctx.moveTo(xy[a * 2], xy[a * 2 + 1]);
          // A single point still shows as a dot (round caps)
          if (b - a === 1) ctx.lineTo(xy[a * 2] + 0.01, xy[a * 2 + 1]);
          for (let i = a + 1; i < b; i++) ctx.lineTo(xy[i * 2], xy[i * 2 + 1]);
        }
        ctx.stroke();
      }
    }

    // Screen-space marks: time dots and sprites
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.globalAlpha = 1;
    const toScreen = (x: number, z: number): [number, number] => {
      const [px, py] = tileToImage(meta, x, z);
      return [ox + px * cam.s, oy + py * cam.s];
    };
    ctx.imageSmoothingEnabled = false;
    const k = Math.max(1, Math.floor(dpr));
    for (const m of markers) {
      const sprite = sprites.get(m.src);
      if (!sprite) continue;
      const [sx, sy] = toScreen(m.x, m.z);
      const w = (sprite.width * k) / dpr;
      const h = (sprite.height * k) / dpr;
      ctx.drawImage(sprite.image, Math.round((sx - w / 2) * dpr) / dpr, Math.round((sy - h / 2) * dpr) / dpr, w, h);
    }
    // Time dots over the markers: where each path is now matters most
    for (const { path } of prepared) {
      if (path.at == null) continue;
      const at = positionAt(path.points, path.at);
      if (!at) continue;
      const [sx, sy] = toScreen(at.x, at.z);
      ctx.beginPath();
      ctx.arc(sx, sy, 4.5, 0, Math.PI * 2);
      ctx.fillStyle = resolve(path.ramp?.length ? path.ramp[path.ramp.length - 1] : path.color);
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = colors.surface;
      ctx.stroke();
    }
    if (overlay) {
      ctx.save();
      overlay(ctx, toScreen, cam.s * meta.px_per_tile);
      ctx.restore();
    }
  }, [colors, dim, image, image2x, markers, meta, overlay, prepared, size, sprites]);

  // One draw per frame, of the latest state. A request while one is pending joins it rather than
  // replacing it: during playback the page re-renders every frame, and cancelling the pending draw
  // each time would put it off forever.
  const drawRef = useRef(draw);
  drawRef.current = draw;
  const requestDraw = useCallback(() => {
    if (frame.current) return;
    frame.current = requestAnimationFrame(() => {
      frame.current = 0;
      drawRef.current();
    });
  }, []);

  // The camera follows `view`, or fits the paths when there is none (not on every time-dot change)
  const fitRef = useRef(fit);
  fitRef.current = fit;
  const viewKey = view?.join(',');
  const canFollow = follow !== undefined;
  const following = canFollow && !view;
  const followKey = following && follow ? `${follow.map(f => `${f.x.toFixed(2)},${f.z.toFixed(2)}`).join(';')}@${followZoom}` : '';
  useEffect(() => {
    if (!meta || size.w === 0) return;
    if (view) {
      const [cx, cy] = tileToImage(meta, view[0], view[1]);
      camera.current = clampCentre(meta, { cx, cy, s: clampScale(meta, size, view[2] / meta.px_per_tile) }, size);
    } else if (following && follow?.length) {
      const xs = follow.map(f => tileToImage(meta, f.x, f.z));
      const [x0, x1] = [Math.min(...xs.map(p => p[0])), Math.max(...xs.map(p => p[0]))];
      const [y0, y1] = [Math.min(...xs.map(p => p[1])), Math.max(...xs.map(p => p[1]))];
      // Close to one character, far enough out for a pack: room for the pins at the edges
      const room = 3 * padding;
      const s = Math.min(followZoom / meta.px_per_tile, (size.w - 2 * room) / Math.max(1, x1 - x0), (size.h - 2 * room) / Math.max(1, y1 - y0));
      camera.current = clampCentre(meta, { cx: (x0 + x1) / 2, cy: (y0 + y1) / 2, s: clampScale(meta, size, s) }, size);
    } else if (!following) {
      camera.current = fitRef.current();
    }
    requestDraw();
    // view, geometry and the followed tile are compared by value, not by array identity
  }, [meta, size, viewKey, geometryKey, followKey]);

  useEffect(() => requestDraw(), [draw, requestDraw]);
  // A draw cancelled on unmount must not block the next one (StrictMode mounts twice)
  useEffect(
    () => () => {
      cancelAnimationFrame(frame.current);
      frame.current = 0;
    },
    []
  );

  /** Reports the camera when a gesture ends: a zoom while following keeps following, anything else is a view. */
  const commit = useCallback(
    (gesture: 'pan' | 'zoom' = 'pan') => {
      const cam = camera.current;
      if (!cam || !meta) return;
      if (following && gesture === 'zoom' && onFollowZoom) return onFollowZoom(Math.round(cam.s * meta.px_per_tile * 100) / 100);
      const [x, z] = imageToTile(meta, cam.cx, cam.cy);
      onViewChange?.(roundView([x, z, cam.s * meta.px_per_tile]));
    },
    [following, meta, onFollowZoom, onViewChange]
  );

  /** Zoom by a factor keeping the image point under (px, py) fixed. */
  const zoomAt = useCallback(
    (px: number, py: number, factor: number) => {
      const cam = camera.current;
      if (!cam || !meta) return;
      // Following (and staying so), the followed tiles stay centred whatever is under the pointer
      if (following && onFollowZoom) [px, py] = [size.w / 2, size.h / 2];
      const ix = cam.cx + (px - size.w / 2) / cam.s;
      const iy = cam.cy + (py - size.h / 2) / cam.s;
      const s = clampScale(meta, size, cam.s * factor);
      camera.current = clampCentre(meta, { cx: ix - (px - size.w / 2) / s, cy: iy - (py - size.h / 2) / s, s }, size);
      requestDraw();
    },
    [following, meta, onFollowZoom, requestDraw, size]
  );

  // Ctrl/⌘ + wheel (and trackpad pinch, which arrives as ctrl + wheel) zooms; a plain wheel scrolls the page
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const onWheel = (event: WheelEvent): void => {
      if (!event.ctrlKey && !event.metaKey) return;
      event.preventDefault();
      const rect = canvas.getBoundingClientRect();
      const delta = event.deltaMode === 1 ? event.deltaY * 16 : event.deltaY;
      zoomAt(event.clientX - rect.left, event.clientY - rect.top, Math.exp(-delta * 0.01));
      window.clearTimeout(wheelTimer.current);
      wheelTimer.current = window.setTimeout(() => commit('zoom'), 250);
    };
    canvas.addEventListener('wheel', onWheel, { passive: false });
    return () => canvas.removeEventListener('wheel', onWheel);
  }, [commit, zoomAt]);

  const local = (event: React.PointerEvent | React.MouseEvent): [number, number] => {
    const rect = event.currentTarget.getBoundingClientRect();
    return [event.clientX - rect.left, event.clientY - rect.top];
  };

  const onPointerDown = (event: React.PointerEvent<HTMLCanvasElement>): void => {
    event.currentTarget.setPointerCapture(event.pointerId);
    const [x, y] = local(event);
    pointers.current.set(event.pointerId, { x, y });
    moved.current = false;
  };

  const onPointerMove = (event: React.PointerEvent<HTMLCanvasElement>): void => {
    const [x, y] = local(event);
    const active = pointers.current;
    const previous = active.get(event.pointerId);
    const cam = camera.current;
    if (!previous || !cam) {
      // Hover: a marker's title as the canvas tooltip
      const hit = meta && cam ? markers.find(m => markerHit(meta, cam, size, m, sprites.get(m.src), x, y)) : undefined;
      event.currentTarget.title = hit?.title ?? '';
      return;
    }
    if (active.size === 1) {
      camera.current = clampCentre(meta, { ...cam, cx: cam.cx - (x - previous.x) / cam.s, cy: cam.cy - (y - previous.y) / cam.s }, size);
      active.set(event.pointerId, { x, y });
      moved.current = true;
      requestDraw();
    } else if (active.size === 2) {
      const [a, b] = [...active.entries()];
      const other = a[0] === event.pointerId ? b[1] : a[1];
      const before = Math.hypot(previous.x - other.x, previous.y - other.y) || 1;
      const after = Math.hypot(x - other.x, y - other.y) || 1;
      active.set(event.pointerId, { x, y });
      // Pan by the midpoint's move, then zoom about the new midpoint
      const mx = (x + other.x) / 2;
      const my = (y + other.y) / 2;
      const px = (previous.x + other.x) / 2;
      const py = (previous.y + other.y) / 2;
      camera.current = clampCentre(meta, { ...cam, cx: cam.cx - (mx - px) / cam.s, cy: cam.cy - (my - py) / cam.s }, size);
      moved.current = true;
      zoomAt(mx, my, after / before);
    }
  };

  const onPointerUp = (event: React.PointerEvent<HTMLCanvasElement>): void => {
    pointers.current.delete(event.pointerId);
    if (pointers.current.size === 0 && moved.current) commit('pan');
  };

  const button = (text: string, title: string, onClick: () => void) => (
    <Tip content={title}>
      <Button type="button" variant="outline" size="sm" aria-label={title} onClick={onClick}>
        {text}
      </Button>
    </Tip>
  );

  const failed = metaFailed || imageFailed;
  return (
    <div ref={containerRef} className={clsx('relative w-full min-w-0 overflow-hidden rounded-sm bg-background', className)} style={{ height: frameHeight }}>
      <canvas
        ref={canvasRef}
        role="img"
        aria-label={label ?? `World map with ${paths.length === 1 ? 'one path' : `${paths.length} paths`}`}
        className="block size-full cursor-grab touch-pan-y active:cursor-grabbing"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onDoubleClick={event => {
          const [x, y] = local(event);
          zoomAt(x, y, 2);
          commit('zoom');
        }}
      />
      {failed ? (
        <p className="absolute inset-0 flex items-center justify-center text-sm text-muted-foreground">The map could not be loaded.</p>
      ) : (
        <div className="absolute top-2 right-2 flex gap-1">
          {button('+', 'Zoom in', () => {
            zoomAt(size.w / 2, size.h / 2, 2);
            commit('zoom');
          })}
          {button('−', 'Zoom out', () => {
            zoomAt(size.w / 2, size.h / 2, 0.5);
            commit('zoom');
          })}
          {canFollow && !following && button('Follow', 'Keep the character in the middle', () => onViewChange?.(undefined))}
          {button('Fit', canFollow ? 'Show the whole path' : 'Fit the paths', () => {
            camera.current = fit();
            requestDraw();
            // A map that follows has no view while following, so the fitted view is kept as one
            if (canFollow) commit('pan');
            else onViewChange?.(undefined);
          })}
        </div>
      )}
    </div>
  );
}

/** Keep the zoom between a little wider than the whole map and MAX_ZOOM pixels per tile. */
function clampScale(meta: MapMeta, size: { w: number; h: number }, s: number): number {
  // Zoomed out no further than the map filling the frame, so the frame never shows past the map
  const min = Math.max(size.w / meta.width, size.h / meta.height);
  return Math.min(MAX_ZOOM / meta.px_per_tile, Math.max(min, s));
}

/** Keep the frame on the map image, so panning never shows past its edges. */
function clampCentre(meta: MapMeta | undefined, cam: Camera, size: { w: number; h: number }): Camera {
  if (!meta) return cam;
  const within = (c: number, half: number, extent: number): number =>
    half * 2 >= extent ? extent / 2 : Math.min(extent - half, Math.max(half, c));
  return { ...cam, cx: within(cam.cx, size.w / 2 / cam.s, meta.width), cy: within(cam.cy, size.h / 2 / cam.s, meta.height) };
}

function markerHit(meta: MapMeta, cam: Camera, size: { w: number; h: number }, m: MapMarker, sprite: TrimmedSprite | undefined, x: number, y: number): boolean {
  const [px, py] = tileToImage(meta, m.x, m.z);
  const sx = size.w / 2 + (px - cam.cx) * cam.s;
  const sy = size.h / 2 + (py - cam.cy) * cam.s;
  const half = Math.max(8, (sprite ? Math.max(sprite.width, sprite.height) : 16) / 2);
  return Math.abs(x - sx) <= half && Math.abs(y - sy) <= half;
}
