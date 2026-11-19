/** For quest-point evals: which quests each run completed and when, on the progress chart's x and crosshair. */

import { useMemo } from 'react';
import { LineChart, ReferenceLine, Scatter, XAxis, YAxis } from 'recharts';
import { ChartContainer } from '@/components/ui/chart';
import { BrandMark, Sprite } from '@/components/marks';
import { SpriteMarkers, crosshairCursor, xAxisProps } from '@/components/charts';
import type { QuestDone } from '@/data/types';
import { questSrc, uiSrc } from '@/lib/assets';
import { dashArray, variantSeries } from '@/lib/chartSeries';
import { formatX } from './chartBits';
import { xAtTick, type RunCurve, type XMeasure } from './model';
import { Y_AXIS_WIDTH, type ProgressFrame } from './Progress';

const ROW = 28;

const WHY: Record<QuestDone['source'], string> = {
  varp: '',
  inferred: ': inferred from a quest-point jump, where the account was and whom it last faced',
};

/** A row's label: the run's line key, its vendor's mark and its epoch. */
function RowTick({ x, y, payload, curves }: { x?: number; y?: number; payload?: { value: number }; curves: RunCurve[] }) {
  const cv = curves[payload?.value ?? -1];
  if (!cv || x == null || y == null) return null;
  const spec = variantSeries(cv.variant);
  return (
    <foreignObject x={x - Y_AXIS_WIDTH + 4} y={y - 10} width={Y_AXIS_WIDTH - 8} height={20}>
      <div
        className="flex h-full items-center justify-end gap-1.5 text-xs text-muted-foreground"
        title={`${spec.name}, epoch ${cv.run.epoch}`}
      >
        <svg aria-hidden width="12" height="4" className="shrink-0">
          <line x1="0" y1="2" x2="12" y2="2" stroke={spec.color} strokeWidth="2" strokeDasharray={dashArray(spec.line)} />
        </svg>
        {spec.sprite ? <Sprite src={spec.sprite} size={14} alt="" /> : spec.vendor && <BrandMark slug={spec.vendor} size={14} />}
        <span className="tabular-nums">{cv.run.epoch}</span>
      </div>
    </foreignObject>
  );
}

export function QuestStrip({ curves, x, frame }: { curves: RunCurve[]; x: XMeasure; frame: ProgressFrame }) {
  const markers = useMemo(
    () =>
      curves.flatMap((cv, row) =>
        cv.run.metrics.quests.flatMap((q, i) => {
          const at = xAtTick(cv, q.tick, x);
          if (at == null) return [];
          const name = q.name ?? 'A quest we could not name';
          return [
            {
              id: `${cv.run.id}-${i}`,
              x: Math.min(frame.range.max, Math.max(frame.range.min, at)),
              y: row,
              src: q.quest ? questSrc(q.quest) : uiSrc('quests'),
              title: `${q.source === 'inferred' ? '≈ ' : ''}${name}${WHY[q.source]}. ${formatX(at, x)}.`,
              inferred: q.source === 'inferred',
            },
          ];
        })
      ),
    [curves, frame.range, x]
  );
  if (curves.length === 0) return null;
  const xAxis = frame.range.log
    ? { dataKey: 'x', type: 'number' as const, scale: 'log' as const, domain: [frame.range.min, frame.range.max], allowDataOverflow: true }
    : xAxisProps({ dataKey: 'x', domain: [frame.range.min, frame.range.max], ticks: frame.ticks });
  return (
    <ChartContainer config={{}} className="aspect-auto w-full" style={{ height: curves.length * ROW + 8 }}>
      <LineChart margin={{ top: 4, right: frame.right, bottom: 4, left: 0 }}>
        <XAxis {...xAxis} hide />
        <YAxis
          dataKey="y"
          type="number"
          domain={[-0.5, curves.length - 0.5]}
          ticks={curves.map((_, i) => i)}
          reversed
          width={Y_AXIS_WIDTH}
          axisLine={false}
          tickLine={false}
          interval={0}
          tick={<RowTick curves={curves} />}
        />
        {frame.hover != null && <ReferenceLine x={frame.hover} {...crosshairCursor} stroke="var(--border)" />}
        {/* Binds the axes to the markers; the sprites draw them */}
        <Scatter data={markers} dataKey="y" fill="transparent" isAnimationActive={false} />
        <SpriteMarkers markers={markers} size={16} />
      </LineChart>
    </ChartContainer>
  );
}
