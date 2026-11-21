/**
 * Who is ahead at the playhead: one lane per racing run, lanes reordering as places change. Each
 * lane names its run and its value; its track runs to its pin as far as its value has got (to the
 * target, or the best result), with the eval's quest stages as ticks on it; under the track, the
 * events it has had so far (quests, the quest points its quest needs) as sprites, newest last, and
 * what the agent was doing at the playhead in its own words. The lanes key the map: each lane's pin
 * is the run's pin there.
 */

import { Link } from '@tanstack/react-router';
import { BrandMark, Sprite, VariantLabel } from '@/components/marks';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { formatInt } from '@/lib/format';
import { setHovered } from '@/lib/hover';
import type { AgentLine } from '@/lib/series';
import { cn } from '@/lib/utils';
import { faded } from '../lit';
import type { RunCurve } from '../model';
import type { LaneMark, LaneStage } from './lanes';
import type { Standing } from './race';

const LINE: Record<AgentLine, string> = { solid: 'border-solid', dashed: 'border-dashed', dotted: 'border-dotted' };

/** A lane's height: its name, its track, its events and status */
const LANE_HEIGHT = 72;
/** The events row's sprites: one size, on a fixed grid */
const MARK = 14;

/** A run's pin, as on the map: its model's colour with its vendor's mark. */
export function Pin({ curve, small }: { curve: RunCurve; small?: boolean }) {
  const v = curve.variant;
  return (
    <span aria-hidden className={cn('flex shrink-0 items-center justify-center rounded-full ring-2 ring-card', small ? 'size-3' : 'size-5', v.color.swatchClassName)}>
      {!small && <BrandMark slug={v.vendorSlug} size={14} className="size-3 bg-card" />}
    </span>
  );
}

export interface Lane extends Standing {
  /** Its events by the playhead, oldest first */
  marks: LaneMark[];
  /** What the agent was doing at the playhead */
  status: string | null;
}

export function Standings({
  rows,
  max,
  tick,
  showEpoch,
  lit,
  stages,
}: {
  rows: Lane[];
  max: number;
  tick: number;
  showEpoch: boolean;
  lit: string | null;
  /** The eval's quest stages, as ticks on every track */
  stages: LaneStage[];
}) {
  return (
    <ol className="relative" style={{ height: rows.length * LANE_HEIGHT }} aria-label="Places at the playhead">
      {rows.map(row => {
        const { run, variant } = row.curve;
        const f = Math.min(1, Math.max(0, row.value / max));
        return (
          <li
            key={run.id}
            className={cn('absolute inset-x-0 transition duration-150 ease-out motion-reduce:transition-none', faded(lit, variant.key) && 'opacity-30')}
            style={{ height: LANE_HEIGHT, transform: `translateY(${row.rank * LANE_HEIGHT}px)` }}
            onMouseEnter={() => setHovered(variant.key)}
            onMouseLeave={() => setHovered(undefined)}
          >
            <Link
              to="/runs/$runId"
              params={{ runId: run.id }}
              search={{ t: Math.round(tick) || undefined } as never}
              aria-label={`${variant.name}${showEpoch ? `, epoch ${run.epoch}` : ''}: ${formatInt(row.value)}`}
              className="flex h-full flex-col justify-center gap-1 rounded-md outline-none hover:bg-muted/50 focus-visible:ring-3 focus-visible:ring-ring/50"
            >
              <span className="flex min-w-0 items-center gap-2 text-xs">
                <VariantLabel run={run} variant={variant} compact size={14} className="min-w-0" />
                {showEpoch && <span className="text-muted-foreground tabular-nums">#{run.epoch}</span>}
                <span className="ml-auto text-muted-foreground tabular-nums" title={formatInt(row.value)}>
                  {formatInt(row.value)}
                </span>
              </span>
              {/* The track: a hairline to the end, the eval's stages as ticks, the run's line (its harness's dash) up to its pin */}
              <span className="relative h-4 shrink-0">
                <span aria-hidden className="absolute inset-x-0 top-1/2 border-t" />
                <span
                  aria-hidden
                  className={cn('absolute top-1/2 left-0 -translate-y-1/2 border-t-2', LINE[variant.line], variant.color.borderClassName)}
                  style={{ width: `${f * 100}%` }}
                />
                {stages.map(s => (
                  <span
                    key={s.stage}
                    aria-hidden
                    title={s.name}
                    className={cn('absolute top-1/2 size-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full', row.value >= s.stage ? variant.color.swatchClassName : 'border bg-card')}
                    style={{ left: `${Math.min(1, s.stage / max) * 100}%` }}
                  />
                ))}
                <span className="absolute top-1/2 -translate-x-1/2 -translate-y-1/2" style={{ left: `${f * 100}%` }}>
                  <Pin curve={row.curve} small />
                </span>
              </span>
              <span className="flex h-4 min-w-0 items-center gap-2 text-xs text-muted-foreground">
                {row.marks.length > 0 && (
                  // Newest last; the oldest wrap out of sight when they don't fit
                  <span className="flex h-4 max-w-1/2 shrink-0 flex-row-reverse flex-wrap gap-x-0.5 overflow-hidden">
                    {[...row.marks].reverse().map(m => (
                      <Tooltip key={`${m.tick}-${m.name}`}>
                        <TooltipTrigger asChild>
                          <span aria-label={m.name} className={cn('flex shrink-0', m.inferred && 'border-b border-dashed border-muted-foreground')}>
                            <Sprite src={m.src} size={MARK} alt="" />
                          </span>
                        </TooltipTrigger>
                        <TooltipContent>{m.name}</TooltipContent>
                      </Tooltip>
                    ))}
                  </span>
                )}
                {row.status && (
                  <span className="truncate" title={row.status}>
                    {row.status}
                  </span>
                )}
              </span>
            </Link>
          </li>
        );
      })}
    </ol>
  );
}
