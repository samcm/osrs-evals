/** Where the runs went: every run's coarse path on the world map, coloured by model. */

import { useMemo } from 'react';
import { Card } from '@/components/Card';
import { ChartLegend } from '@/components/ChartLegend';
import { WorldMap, type MapPath } from '@/components/WorldMap';
import { BrandMark } from '@/components/marks';
import type { EvalRuns } from '@/data/types';
import { formatInt } from '@/lib/format';
import type { LegendState } from '@/lib/legend';
import type { MapView } from '@/lib/map';
import { useSearchUpdate } from '@/lib/search';
import { modelInfo } from '@/lib/series';
import type { RunCurve } from './model';

export function WhereCard({
  curves,
  grid,
  legend,
  view,
  t,
  maxTick,
}: {
  curves: RunCurve[];
  grid: EvalRuns | undefined;
  legend: LegendState;
  view: MapView | undefined;
  t: number | undefined;
  maxTick: number;
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
  const models = [...new Map(shown.map(cv => [cv.run.model, modelInfo(cv.run.model)])).entries()];
  const step = grid?.path_every ?? 50;

  return (
    <Card title="Where they went" className="flex flex-col">
      <WorldMap
        paths={paths}
        view={view}
        onViewChange={v => update({ map: v })}
        height={360}
        fitHeight
        label="Paths of the runs on the world map, coloured by model"
        className="rounded-sm"
      />
      <div className="mt-3 flex flex-wrap items-center justify-between gap-x-6 gap-y-2">
        <ChartLegend
          items={models.map(([, m]) => ({
            label: m.short,
            mark: <BrandMark slug={m.vendor.slug} size={14} />,
            color: m.color,
            line: 'solid' as const,
          }))}
        />
        <label className="flex min-w-0 flex-1 basis-56 items-center gap-3 text-xs text-muted sm:max-w-80">
          <input
            type="range"
            min={0}
            max={maxTick}
            step={step}
            value={t ?? maxTick}
            aria-label="Tick at which each run is marked"
            onChange={event => update({ t: Number(event.target.value) >= maxTick ? undefined : Number(event.target.value) })}
            className="min-w-0 flex-1 accent-primary"
          />
          <span className="w-24 text-right whitespace-nowrap text-foreground tabular-nums">
            {t == null ? 'End' : `${formatInt(t)} ticks`}
          </span>
        </label>
      </div>
    </Card>
  );
}
