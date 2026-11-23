/**
 * Game sprites over an XYChart: quest icons where a quest was done, the hitpoints heart for a death,
 * a check where a run finished. Each sits on its data point (no y puts it on the plot's bottom edge),
 * pixelated on whole pixels, with its name in a tooltip. An inferred event (`source: 'inferred'`) gets
 * a faint dashed ring, and its tooltip starts with "≈" and says why. XYChart draws them from its
 * `markers` prop.
 */

import type { JSX, ReactNode } from 'react';
import clsx from 'clsx';
import { Sprite } from '@/components/marks';
import { Tooltip } from '@/components/Overlays/Tooltip';
import type { Plot } from './plot';

export interface SpriteMarker {
  /** Unique on the chart */
  id: string;
  x: number;
  /** Omit to sit the sprite on the plot's bottom edge (an event without a value) */
  y?: number;
  src: string;
  /** Said on hover */
  title?: ReactNode;
  /** Guessed rather than read from the game: a dashed ring, and the title says why */
  inferred?: boolean;
  /** The series it belongs to, so it fades with its line under the page's hover */
  seriesId?: string;
}

/** CSS pixels; sprites are 32px, so 16 and 32 keep whole-pixel scaling at device scale 2 */
export type SpriteMarkerSize = 16 | 24 | 32;

const BOX: Record<SpriteMarkerSize, string> = { 16: 'size-4', 24: 'size-6', 32: 'size-8' };
const RING: Record<SpriteMarkerSize, string> = { 16: 'size-5', 24: 'size-7', 32: 'size-9' };

export function SpriteMarkers({
  markers,
  plot,
  size = 16,
  opacity,
}: {
  markers: SpriteMarker[];
  plot: Plot;
  size?: SpriteMarkerSize;
  /** A marker's strength under the page's hover */
  opacity: (seriesId: string | undefined) => number;
}): JSX.Element {
  return (
    <>
      {markers.map(m => {
        const cx = plot.x(m.x);
        const cy = m.y == null ? plot.top + plot.height - size / 2 : plot.y(m.y);
        if (!Number.isFinite(cx) || !Number.isFinite(cy) || cx < plot.left - 1 || cx > plot.left + plot.width + 1)
          return null;
        return (
          <Tooltip key={m.id} content={m.title}>
            <div
              className={clsx('absolute flex items-center justify-center transition-opacity', BOX[size])}
              style={{ left: Math.round(cx - size / 2), top: Math.round(cy - size / 2), opacity: opacity(m.seriesId) }}
            >
              {m.inferred && (
                <span
                  aria-hidden
                  className={clsx('absolute shrink-0 rounded-full border border-dashed border-muted', RING[size])}
                />
              )}
              <Sprite src={m.src} size={size} alt="" />
            </div>
          </Tooltip>
        );
      })}
    </>
  );
}
