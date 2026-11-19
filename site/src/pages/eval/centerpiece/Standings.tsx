/**
 * Who is ahead at the playhead: one lane per racing run, named, its pin as far along as its value has
 * got (to the target, or the best result), lanes reordering as places change. The lanes key the map:
 * each lane's pin is the run's pin there. On a phone the name sits above its lane.
 */

import { Link } from '@tanstack/react-router';
import { BrandMark, VariantLabel } from '@/components/marks';
import { formatInt } from '@/lib/format';
import { setHovered } from '@/lib/hover';
import { faded } from '../lit';
import type { AgentLine } from '@/lib/series';
import { cn } from '@/lib/utils';
import type { Standing } from './race';
import type { RunCurve } from '../model';

const LINE: Record<AgentLine, string> = { solid: 'border-solid', dashed: 'border-dashed', dotted: 'border-dotted' };

/** The columns the playback bar and the lanes share: a name (or the play button), the track, the value. */
export const LANE = {
  row: 'flex items-center gap-3',
  /** `wide` makes room for an epoch beside the name */
  head: (narrow: boolean, wide = false) => cn('min-w-0 shrink-0', narrow ? 'w-8' : wide ? 'w-52' : 'w-44'),
  track: 'min-w-0 flex-1',
  value: 'w-12 shrink-0 text-right text-xs text-muted-foreground tabular-nums',
};

/** A run's pin, as on the map: its model's colour with its vendor's mark. */
export function Pin({ curve, small }: { curve: RunCurve; small?: boolean }) {
  const v = curve.variant;
  return (
    <span aria-hidden className={cn('flex shrink-0 items-center justify-center rounded-full ring-2 ring-card', small ? 'size-3' : 'size-5', v.color.swatchClassName)}>
      {!small && <BrandMark slug={v.vendorSlug} size={14} className="size-3 bg-card" />}
    </span>
  );
}

export function Standings({
  rows,
  max,
  tick,
  showEpoch,
  lit,
  narrow,
}: {
  rows: Standing[];
  max: number;
  tick: number;
  showEpoch: boolean;
  lit: string | null;
  /** Too narrow for a name column: names go above their lanes */
  narrow: boolean;
}) {
  const small = rows.length > 12;
  const lane = small ? 24 : 32;
  const height = narrow ? lane + 16 : lane;
  return (
    <ol className="relative" style={{ height: rows.length * height }} aria-label="Places at the playhead">
      {rows.map(row => {
        const { run, variant } = row.curve;
        const f = Math.min(1, Math.max(0, row.value / max));
        const name = (
          <span className="flex min-w-0 items-center gap-2 text-xs">
            <VariantLabel run={run} variant={variant} compact size={14} />
            {showEpoch && <span className="text-muted-foreground tabular-nums">#{run.epoch}</span>}
          </span>
        );
        return (
          <li
            key={run.id}
            className={cn('absolute inset-x-0 transition duration-150 ease-out motion-reduce:transition-none', faded(lit, variant.key) && 'opacity-30')}
            style={{ height, transform: `translateY(${row.rank * height}px)` }}
            onMouseEnter={() => setHovered(variant.key)}
            onMouseLeave={() => setHovered(undefined)}
          >
            <Link
              to="/runs/$runId"
              params={{ runId: run.id }}
              search={{ t: Math.round(tick) } as never}
              aria-label={`${variant.name}${showEpoch ? `, epoch ${run.epoch}` : ''}: ${formatInt(row.value)}`}
              className="flex h-full flex-col justify-center rounded-md outline-none hover:bg-muted/50 focus-visible:ring-3 focus-visible:ring-ring/50"
            >
              {narrow && <span className={cn(LANE.row, 'h-4')}><span className={LANE.head(true)} />{name}</span>}
              <span className={LANE.row} style={{ height: lane }}>
                <span className={LANE.head(narrow, showEpoch)}>{!narrow && name}</span>
                {/* The track: a hairline to the end, the run's line (its harness's dash) up to its pin */}
                <span className={cn(LANE.track, 'relative h-full')}>
                  <span aria-hidden className="absolute inset-x-0 top-1/2 border-t" />
                  <span
                    aria-hidden
                    className={cn('absolute top-1/2 left-0 -translate-y-1/2 border-t-2', LINE[variant.line], variant.color.borderClassName)}
                    style={{ width: `${f * 100}%` }}
                  />
                  <span className="absolute top-1/2 -translate-x-1/2 -translate-y-1/2" style={{ left: `${f * 100}%` }}>
                    <Pin curve={row.curve} small={small} />
                  </span>
                </span>
                <span className={LANE.value}>{formatInt(row.value)}</span>
              </span>
            </Link>
          </li>
        );
      })}
    </ol>
  );
}
