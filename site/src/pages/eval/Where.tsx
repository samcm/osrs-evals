/** Where the runs went: every run's coarse path on the world map, coloured by model. */

import { useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Slider } from '@/components/ui/slider';
import { WorldMap, type MapPath } from '@/components/WorldMap';
import { SeriesLegend } from '@/components/charts';
import type { EvalRuns } from '@/data/types';
import { modelSeries } from '@/lib/chartSeries';
import { formatInt } from '@/lib/format';
import type { LegendState } from '@/lib/legend';
import type { MapView } from '@/lib/map';
import { useSearchUpdate } from '@/lib/search';
import type { RunCurve } from './model';

export function WhereCard({
  curves,
  grid,
  legend,
  view,
  t,
  maxTick,
  height,
}: {
  curves: RunCurve[];
  grid: EvalRuns | undefined;
  legend: LegendState;
  view: MapView | undefined;
  t: number | undefined;
  maxTick: number;
  /** The most the map may take; it takes the paths' shape up to that */
  height?: number;
}) {
  const update = useSearchUpdate();
  const shown = curves.filter(cv => legend.visible(cv.variant.key) && grid?.runs[cv.run.id]?.path.length);
  const paths = useMemo<MapPath[]>(
    () =>
      shown.map(cv => ({
        id: cv.run.id,
        color: cv.variant.color.token,
        points: grid!.runs[cv.run.id].path as unknown as MapPath['points'],
        width: 1.5,
        opacity: 0.75,
        // Without a chosen tick, each dot marks where its run ended
        at: t ?? maxTick,
      })),
    [grid, maxTick, shown, t]
  );
  const models = [...new Set(shown.map(cv => cv.run.model))].sort().map(modelSeries);
  const step = grid?.path_every ?? 50;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Where they went</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-1 flex-col gap-4">
        <WorldMap
          paths={paths}
          view={view}
          onViewChange={v => update({ map: v })}
          height={height ?? 440}
          fitHeight
          label="Paths of the runs on the world map, coloured by model"
        />
        <div className="flex items-center gap-4 text-sm">
          <Slider
            min={0}
            max={maxTick}
            step={step}
            value={[t ?? maxTick]}
            aria-label="Tick at which each run is marked"
            onValueChange={([v]) => update({ t: v >= maxTick ? undefined : v })}
          />
          <span className="w-24 shrink-0 text-right whitespace-nowrap tabular-nums">{t == null ? 'End' : `${formatInt(t)} ticks`}</span>
        </div>
        <SeriesLegend series={models} />
      </CardContent>
    </Card>
  );
}
