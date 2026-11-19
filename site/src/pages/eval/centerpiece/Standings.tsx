/**
 * Who is ahead at the playhead: one lane per racing run, its pin as far along as its value has got
 * (to the target, or the best result), lanes reordering as places change.
 */

import { Link } from '@tanstack/react-router';
import { BrandMark, VariantLabel } from '@/components/marks';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { formatInt } from '@/lib/format';
import type { AgentLine } from '@/lib/series';
import { cn } from '@/lib/utils';
import type { Standing } from './race';

const LINE: Record<AgentLine, string> = { solid: 'border-solid', dashed: 'border-dashed', dotted: 'border-dotted' };

/** A run's pin, as on the map: its model's colour with its vendor's mark. */
export function Pin({ standing, small }: { standing: Standing; small?: boolean }) {
  const v = standing.curve.variant;
  return (
    <span aria-hidden className={cn('flex shrink-0 items-center justify-center rounded-full ring-2 ring-card', small ? 'size-3' : 'size-5', v.color.swatchClassName)}>
      {!small && <BrandMark slug={v.vendorSlug} size={14} className="size-3 bg-card" />}
    </span>
  );
}

export function Standings({ rows, max, tick, showEpoch }: { rows: Standing[]; max: number; tick: number; showEpoch: boolean }) {
  const small = rows.length > 12;
  const height = small ? 20 : 28;
  return (
    <ol className="relative" style={{ height: rows.length * height }} aria-label="Places at the playhead">
      {rows.map(row => {
        const { run, variant } = row.curve;
        const f = Math.min(1, Math.max(0, row.value / max));
        return (
          <li
            key={run.id}
            className="absolute inset-x-0 transition-transform duration-500 ease-out"
            style={{ height, transform: `translateY(${row.rank * height}px)` }}
          >
            <Tooltip>
              <TooltipTrigger asChild>
                <Link
                  to="/runs/$runId"
                  params={{ runId: run.id }}
                  search={{ t: Math.round(tick) } as never}
                  className="flex h-full items-center gap-3 rounded-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
                >
                  <span className="relative mx-2.5 h-full flex-1">
                    <span aria-hidden className="absolute inset-x-0 top-1/2 border-t" />
                    <span
                      aria-hidden
                      className={cn('absolute top-1/2 left-0 -translate-y-1/2 border-t-2', LINE[variant.line], variant.color.borderClassName)}
                      style={{ width: `${f * 100}%` }}
                    />
                    <span className="absolute top-1/2 -translate-x-1/2 -translate-y-1/2" style={{ left: `${f * 100}%` }}>
                      <Pin standing={row} small={small} />
                    </span>
                  </span>
                  <span className="w-10 shrink-0 text-right text-xs text-muted-foreground tabular-nums">{formatInt(row.value)}</span>
                </Link>
              </TooltipTrigger>
              <TooltipContent side="top">
                <span className="flex items-center gap-2">
                  <VariantLabel run={run} compact size={14} />
                  {showEpoch && <span className="tabular-nums">epoch {run.epoch}</span>}
                </span>
              </TooltipContent>
            </Tooltip>
          </li>
        );
      })}
    </ol>
  );
}
