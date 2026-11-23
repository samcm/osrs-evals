/**
 * Game sprites on a chart: quest icons where a quest was done, the hitpoints heart for a death, skill
 * icons for level-ups. Each sits at its data point (x, y in data units; no y puts it on the plot's
 * bottom edge), pixelated, on whole pixels; an inferred event gets a faint dashed ring, and its
 * title says why.
 *
 *   <LineChart …>
 *     <Line … />
 *     <SpriteMarkers markers={quests.map(q => ({ id: q.quest, x: q.tick, y: q.points, src: questSrc(q.quest),
 *       title: q.source === 'inferred' ? `≈ ${q.name}: guessed from a quest-points jump` : q.name, inferred: q.source === 'inferred' }))} />
 *   </LineChart>
 */

import { usePlotArea, useXAxisScale, useYAxisScale } from 'recharts';

export interface SpriteMarker {
  id: string;
  x: number;
  /** Omit to sit the sprite on the plot's bottom edge (an event without a value) */
  y?: number;
  src: string;
  /** Hover text */
  title?: string;
  inferred?: boolean;
}

export function SpriteMarkers({
  markers,
  size = 16,
  xAxisId,
  yAxisId,
}: {
  markers: SpriteMarker[];
  /** CSS pixels; sprites are 32px, so 16 and 32 keep whole-pixel scaling at device scale 2 */
  size?: 16 | 24 | 32;
  xAxisId?: string | number;
  yAxisId?: string | number;
}) {
  const plot = usePlotArea();
  const x = useXAxisScale(xAxisId);
  const y = useYAxisScale(yAxisId);
  if (!plot || !x || !y) return null;
  return (
    <g className="recharts-sprite-markers">
      {markers.map(m => {
        const cx = Number(x(m.x));
        const cy = m.y == null ? plot.y + plot.height - size / 2 : Number(y(m.y));
        if (!Number.isFinite(cx) || !Number.isFinite(cy) || cx < plot.x - 1 || cx > plot.x + plot.width + 1)
          return null;
        const left = Math.round(cx - size / 2);
        const top = Math.round(cy - size / 2);
        return (
          <g key={m.id}>
            {m.title && <title>{m.title}</title>}
            {m.inferred && (
              <circle
                cx={cx}
                cy={cy}
                r={size / 2 + 2}
                fill="none"
                stroke="var(--muted-foreground)"
                strokeOpacity={0.6}
                strokeDasharray="2 2"
              />
            )}
            <image
              href={m.src}
              x={left}
              y={top}
              width={size}
              height={size}
              data-sprite
              preserveAspectRatio="xMidYMid meet"
              style={{ imageRendering: 'pixelated' }}
            />
          </g>
        );
      })}
    </g>
  );
}
