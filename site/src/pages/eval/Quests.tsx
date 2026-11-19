/**
 * For quest-point evals, under the progress chart on its x: one lane per run, grouped by pairing,
 * each quest's icon where the run finished it. Icons are one size on a fixed grid of slots, so two
 * quests close together sit side by side, never on top of each other.
 */

import { useMemo } from 'react';
import { Link } from '@tanstack/react-router';
import { BrandMark, Sprite } from '@/components/marks';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { questSrc, uiSrc } from '@/lib/assets';
import { dashArray, variantSeries } from '@/lib/chartSeries';
import { setHovered } from '@/lib/hover';
import { faded, useLit } from './lit';
import { useWidth } from '@/lib/useWidth';
import { cn } from '@/lib/utils';
import { formatX } from './chartBits';
import { xAtTick, type RunCurve, type XMeasure } from './model';
import { Y_AXIS_WIDTH, type ProgressFrame } from './Progress';

const ROW = 24;
const ICON = 16;
/** One slot per icon plus a gap: the grid icons snap to */
const SLOT = 20;

export function QuestStrip({ curves, x, frame, focus }: { curves: RunCurve[]; x: XMeasure; frame: ProgressFrame; focus?: string }) {
  const [ref, width] = useWidth();
  const lit = useLit(focus);
  const plot = Math.max(1, width - Y_AXIS_WIDTH - frame.right);
  const { min, max, log } = frame.range;
  const toPx = (v: number): number => {
    const c = Math.min(max, Math.max(min, v));
    return (log ? Math.log(c / min) / Math.log(max / min) : (c - min) / (max - min)) * plot;
  };

  // Lanes grouped by pairing (in the order pairings first appear), runs by epoch within each
  const lanes = useMemo(() => {
    const groups = new Map<string, RunCurve[]>();
    for (const cv of curves) groups.set(cv.variant.key, [...(groups.get(cv.variant.key) ?? []), cv]);
    return [...groups.values()].flatMap(group => group.sort((a, b) => a.run.epoch - b.run.epoch).map((cv, i) => ({ cv, first: i === 0 })));
  }, [curves]);

  if (lanes.length === 0) return null;
  const slots = Math.max(1, Math.floor(plot / SLOT));
  return (
    <div ref={ref} className="flex flex-col pt-2" role="list" aria-label="Quests finished by each run">
      {lanes.map(({ cv, first }, row) => {
        const spec = variantSeries(cv.variant);
        // Snap each quest to its slot; a taken slot pushes it to the next free one
        const taken = new Set<number>();
        const icons = cv.run.metrics.quests.flatMap((q, i) => {
          const at = xAtTick(cv, q.tick, x);
          if (at == null) return [];
          let slot = Math.min(slots - 1, Math.round(toPx(at) / SLOT));
          while (taken.has(slot) && slot < slots - 1) slot++;
          while (taken.has(slot) && slot > 0) slot--;
          taken.add(slot);
          return [{ q, i, at, slot }];
        });
        return (
          <div
            key={cv.run.id}
            role="listitem"
            className={cn('flex items-center transition-opacity duration-150', first && row > 0 && 'mt-1 border-t pt-1', faded(lit, cv.variant.key) && 'opacity-30')}
            style={{ height: ROW }}
            onMouseEnter={() => setHovered(cv.variant.key)}
            onMouseLeave={() => setHovered(undefined)}
          >
            <Link
              to="/runs/$runId"
              params={{ runId: cv.run.id }}
              search={{} as never}
              title={`${spec.name}, epoch ${cv.run.epoch}`}
              className="flex shrink-0 items-center justify-end gap-1.5 pr-2 text-xs text-muted-foreground hover:text-foreground"
              style={{ width: Y_AXIS_WIDTH }}
            >
              {first && (
                <>
                  <svg aria-hidden width="12" height="4" className="shrink-0">
                    <line x1="0" y1="2" x2="12" y2="2" stroke={spec.color} strokeWidth="2" strokeDasharray={dashArray(spec.line)} />
                  </svg>
                  {spec.vendor && <BrandMark slug={spec.vendor} size={14} />}
                </>
              )}
              <span className="w-3 text-right tabular-nums">{cv.run.epoch}</span>
            </Link>
            <div className="relative h-full flex-1" style={{ marginRight: frame.right }}>
              <span aria-hidden className="absolute inset-x-0 top-1/2 border-t border-dashed" />
              {frame.hover != null && <span aria-hidden className="absolute inset-y-0 w-px bg-border" style={{ left: toPx(frame.hover) }} />}
              {icons.map(({ q, i, at, slot }) => {
                const inferred = q.source === 'inferred';
                const name = q.name ?? 'A quest we could not name';
                return (
                  <Tooltip key={i}>
                    <TooltipTrigger asChild>
                      <span
                        tabIndex={0}
                        aria-label={inferred ? `≈ ${name}` : name}
                        className={cn(
                          'absolute top-1/2 flex -translate-x-1/2 -translate-y-1/2 rounded-sm bg-card outline-none focus-visible:ring-3 focus-visible:ring-ring/50',
                          inferred && 'border-b border-dashed border-muted-foreground'
                        )}
                        style={{ left: Math.min(plot - ICON / 2, Math.max(ICON / 2, slot * SLOT)) }}
                      >
                        <Sprite src={q.quest ? questSrc(q.quest) : uiSrc('quests')} size={ICON} alt="" />
                      </span>
                    </TooltipTrigger>
                    <TooltipContent className="max-w-64">
                      <p className="font-medium">
                        {inferred && '≈ '}
                        {name}
                      </p>
                      <p className="tabular-nums">{formatX(at, x)}</p>
                      {inferred && <p className="opacity-80">Guessed from the quest-point jump, where the account was and whom it last faced.</p>}
                    </TooltipContent>
                  </Tooltip>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
