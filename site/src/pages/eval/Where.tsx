/**
 * Where the runs spent their time: every shown run's game time summed over the map in small squares
 * darker where more ticks were spent. The centrepiece shows movement; this shows where they stood.
 */

import { useCallback, useMemo } from 'react';
import { WorldMap, type MapOverlay, type MapPath } from '@/components/WorldMap';
import { KeyLegend } from '@/components/charts';
import type { EvalRuns } from '@/data/types';
import type { LegendState } from '@/lib/legend';
import { surfaceZ, type MapView } from '@/lib/map';
import { useSearchUpdate } from '@/lib/search';
import { useThemeColors } from '@/lib/theme';
import type { RunCurve } from './model';

/** The heat's one hue: red reads as heat over the map's greens and browns */
const HEAT = '--color-data-red';

/** Screen pixels a square takes at the least: one tile zoomed in, several zoomed out */
const MIN_CELL = 8;

export function WhereMap({ curves, grid, legend, view, height = 480 }: { curves: RunCurve[]; grid: EvalRuns | undefined; legend: LegendState; view: MapView | undefined; height?: number }) {
  const update = useSearchUpdate();
  const colors = useThemeColors();
  const shown = curves.filter(cv => legend.visible(cv.variant.key) && grid?.runs[cv.run.id]?.path.length);

  // Where each run stood and for how long: a point holds until the next one
  const { stays, paths } = useMemo(() => {
    const stays: { x: number; z: number; ticks: number }[] = [];
    const paths: MapPath[] = [];
    for (const cv of shown) {
      const points = grid!.runs[cv.run.id].path;
      const end = cv.points[cv.points.length - 1]?.tick ?? points[points.length - 1][0];
      paths.push({ id: cv.run.id, color: cv.variant.color.token, points: points as unknown as MapPath['points'], opacity: 0 });
      // Underground and upstairs count where they are on the surface map
      points.forEach((p, i) => stays.push({ x: p[1], z: surfaceZ(p[2]), ticks: Math.max(0, (points[i + 1]?.[0] ?? end) - p[0]) }));
    }
    return { stays, paths };
  }, [grid, shown]);

  const overlay = useCallback<MapOverlay>(
    (ctx, toScreen, zoom) => {
      // Squares of whole tiles at least MIN_CELL screen pixels wide, so the heat stays visible zoomed out
      const cell = Math.max(1, Math.ceil(MIN_CELL / zoom));
      const cells = new Map<string, { x: number; z: number; ticks: number }>();
      for (const s of stays) {
        const x = Math.floor(s.x / cell) * cell;
        const z = Math.floor(s.z / cell) * cell;
        const key = `${x},${z}`;
        const c = cells.get(key) ?? { x, z, ticks: 0 };
        c.ticks += s.ticks;
        cells.set(key, c);
      }
      const most = Math.max(1, ...[...cells.values()].map(c => c.ticks));
      ctx.fillStyle = colors.resolve(HEAT);
      for (const c of cells.values()) {
        const [x0, y0] = toScreen(c.x - 0.5, c.z + cell - 0.5);
        const [x1, y1] = toScreen(c.x + cell - 0.5, c.z - 0.5);
        // Log scale, so a few long waits don't wash out everywhere else; squared, so ground only
        // walked over stays faint and the places they stayed stand out
        ctx.globalAlpha = 0.04 + 0.86 * (Math.log1p(c.ticks) / Math.log1p(most)) ** 2;
        ctx.fillRect(x0, y0, x1 - x0, y1 - y0);
      }
      ctx.globalAlpha = 1;
    },
    [stays, colors]
  );

  return (
    <div className="flex flex-col">
        <WorldMap
          paths={paths}
          overlay={overlay}
          view={view}
          onViewChange={v => update({ heat: v })}
          height={height}
          fitHeight
          dim={0.55}
          label="Game time spent on each part of the map, summed over the runs"
        />
        <KeyLegend items={[{ label: 'Less time', swatchClassName: 'bg-data-red/20' }, { label: 'More', swatchClassName: 'bg-data-red/85' }]} />
    </div>
  );
}
