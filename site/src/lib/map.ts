/** The world map's projection (public/assets/map/map.json), path points, and the map view as URL state. */

import { queryOptions } from '@tanstack/react-query';
import { numbers, type Param } from './search';

/** map.json: the tile at the image's left edge (x0) and top edge (z1), and pixels per tile. */
export interface MapMeta {
  x0: number;
  z1: number;
  px_per_tile: number;
  width: number;
  height: number;
  /** The plane the image shows */
  level: number;
}

// Owned here rather than src/data/queries.ts so the map ships with its component; it is static art, not run data
export const mapMetaQuery = queryOptions({
  queryKey: ['map-meta'],
  queryFn: async (): Promise<MapMeta> => {
    const response = await fetch('/assets/map/map.json');
    if (!response.ok) throw new Error(`/assets/map/map.json returned ${response.status}`);
    return (await response.json()) as MapMeta;
  },
  staleTime: Infinity,
});

export const MAP_IMAGE = '/assets/map/world.png';
/** The same map at twice the resolution, drawn when zoomed in far enough to use it (optional) */
export const MAP_IMAGE_2X = '/assets/map/world@2x.png';

/** One recorded position: game tick, tile x, tile z, plane, and 1 when it was a jump (teleport, respawn), not a walk. */
export type PathPoint = readonly [tick: number, x: number, z: number, level: number, jump?: 1];

/** Positions at z ≥ 6400 are underground (dungeons are mapped 6,400 tiles north of the surface above them). */
export const UNDERGROUND_Z = 6400;

/** Where a position is drawn on the surface map: underground under the surface above it, upper floors over the ground. */
export const surfaceZ = (z: number): number => (z >= UNDERGROUND_Z ? z - UNDERGROUND_Z : z);

/** The floor a position is on, when it is not the surface's ground floor. */
function floorName(z: number, level: number): string | null {
  if (z >= UNDERGROUND_Z) return 'Underground';
  return level > 0 ? `Floor ${level}` : null;
}

/** Path points are at most this many ticks apart while the character walks (the run detail's paths). */
const STEP_TICKS = 10;

/** Where a character was at a tick, as drawn on the surface map. */
export interface Position {
  x: number;
  z: number;
  floor: string | null;
}

/**
 * Where a character was at a tick. Paths only record changes, so between two points the character
 * stood still and then walked for at most `step` ticks; a jump (teleport, respawn, or further than
 * it could walk) is not walked.
 */
export function positionAt(points: readonly PathPoint[], tick: number, step = STEP_TICKS): Position | null {
  if (points.length === 0) return null;
  const i = Math.max(0, indexAt(points, tick));
  const p = points[i];
  const at = { x: p[1], z: surfaceZ(p[2]), floor: floorName(p[2], p[3]) };
  const q = points[i + 1];
  if (!q || tick <= p[0] || q[4] === 1) return at;
  const qz = surfaceZ(q[2]);
  if (Math.abs(q[1] - at.x) + Math.abs(qz - at.z) > step * 2 + 2) return at;
  const start = Math.max(p[0], q[0] - step);
  const f = Math.min(1, Math.max(0, (tick - start) / (q[0] - start || 1)));
  return { ...at, x: at.x + (q[1] - at.x) * f, z: at.z + (qz - at.z) * f };
}

/** A tile's centre in map-image pixels. */
export function tileToImage(meta: MapMeta, x: number, z: number): [number, number] {
  return [(x - meta.x0 + 0.5) * meta.px_per_tile, (meta.z1 - z + 0.5) * meta.px_per_tile];
}

/** Map-image pixels to tile coordinates (fractional). */
export function imageToTile(meta: MapMeta, px: number, py: number): [number, number] {
  return [px / meta.px_per_tile - 0.5 + meta.x0, meta.z1 - (py / meta.px_per_tile - 0.5)];
}

/** The index of the last point at or before a tick (−1 before the first). */
export function indexAt(points: readonly PathPoint[], tick: number): number {
  let lo = 0;
  let hi = points.length - 1;
  let found = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (points[mid][0] <= tick) {
      found = mid;
      lo = mid + 1;
    } else hi = mid - 1;
  }
  return found;
}

/** The map's view: the centre tile and the zoom in screen pixels per tile. In the URL as "x,z,zoom". */
export type MapView = readonly [x: number, z: number, zoom: number];

/** A `map` search param; absent means "fit the paths". */
export function mapViewParam(): Param<MapView | undefined> {
  const parse = numbers(3).parse;
  return { parse: raw => parse(raw) as MapView | undefined, fallback: undefined };
}

/** A view rounded for the URL. */
export const roundView = ([x, z, zoom]: MapView): MapView => [
  Math.round(x * 10) / 10,
  Math.round(z * 10) / 10,
  Math.round(zoom * 100) / 100,
];
