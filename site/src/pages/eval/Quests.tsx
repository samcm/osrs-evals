/**
 * For quest-point evals, under the progress chart on its x: one lane per run, in the leaderboard's
 * order, each quest's icon where the run finished it. A lane starts with the run's pin (as on the
 * map and in the race) and runs in its line, colour and dash, for as long as the run did. Icons are
 * one size on a fixed grid of slots, so two quests close together sit side by side, never on top of
 * each other. Quests after the playhead wait, faded, until it reaches them.
 */

import { useMemo } from 'react';
import { Link } from '@tanstack/react-router';
import { Sprite, VariantLabel } from '@/components/marks';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { questSrc, uiSrc } from '@/lib/assets';
import { hoverProps } from '@/lib/hover';
import type { AgentLine } from '@/lib/series';
import { useWidth } from '@/lib/useWidth';
import { cn } from '@/lib/utils';
import { formatX } from './chartBits';
import { faded, useLit } from './lit';
import { usePlayheadMark } from './playhead';
import { Pin } from './centerpiece/Standings';
import { xAtTick, xOf, type RankedVariant, type RunCurve, type XMeasure } from './model';
import { Y_AXIS_WIDTH, type ProgressFrame } from './Progress';

/** The run page's lane sprite size, so a quest looks the same on both pages */
const ICON = 24;
const ROW = 28;
/** One slot per icon plus a gap: the grid icons snap to */
const SLOT = 28;
const LINE: Record<AgentLine, string> = { solid: 'border-solid', dashed: 'border-dashed', dotted: 'border-dotted' };

export function QuestStrip({
  curves,
  ranked,
  x,
  frame,
  focus,
  t,
}: {
  curves: RunCurve[];
  /** The pairings in the leaderboard's order */
  ranked: RankedVariant[];
  x: XMeasure;
  frame: ProgressFrame;
  focus?: string;
  /** The playhead's settled tick (`?t=`) */
  t?: number;
}) {
  const [ref, width] = useWidth();
  const lit = useLit(focus);
  const playhead = usePlayheadMark(t);
  const plot = Math.max(1, width - Y_AXIS_WIDTH - frame.right);
  const { min, max, log } = frame.range;
  const toPx = (v: number): number => {
    const c = Math.min(max, Math.max(min, v));
    return (log ? Math.log(c / min) / Math.log(max / min) : (c - min) / (max - min)) * plot;
  };

  // Lanes by pairing, as the leaderboard ranks them; a pairing's runs by epoch
  const groups = useMemo(() => {
    const place = new Map(ranked.map((r, i) => [r.variant.key, i]));
    const byKey = new Map<string, RunCurve[]>();
    for (const cv of curves) byKey.set(cv.variant.key, [...(byKey.get(cv.variant.key) ?? []), cv]);
    return [...byKey.values()]
      .sort((a, b) => (place.get(a[0].variant.key) ?? 0) - (place.get(b[0].variant.key) ?? 0))
      .map(group => group.sort((a, b) => a.run.epoch - b.run.epoch));
  }, [curves, ranked]);

  if (groups.length === 0) return null;
  const slots = Math.max(1, Math.floor(plot / SLOT));
  const several = groups.some(g => g.length > 1);
  return (
    <div ref={ref} className="flex flex-col gap-2 pt-2" aria-label="Quests finished by each run">
      {groups.map(group => (
        <div
          key={group[0].variant.key}
          role="list"
          aria-label={group[0].variant.name}
          className={cn('flex flex-col transition-opacity duration-150', faded(lit, group[0].variant.key) && 'opacity-30')}
          {...hoverProps(group[0].variant.key)}
        >
          {group.map(cv => lane(cv))}
        </div>
      ))}
    </div>
  );

  function lane(cv: RunCurve) {
    const v = cv.variant;
    const end = cv.points.length ? toPx(xOf(cv.points[cv.points.length - 1], x) ?? 0) : 0;
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
      <div key={cv.run.id} role="listitem" className="flex items-center" style={{ height: ROW }}>
        {/* The run's pin in the y axis' gutter, opening the run */}
        <span className="flex shrink-0 justify-end pr-2" style={{ width: Y_AXIS_WIDTH }}>
          <Tooltip>
            <TooltipTrigger asChild>
              <Link
                to="/runs/$runId"
                params={{ runId: cv.run.id }}
                search={{} as never}
                aria-label={several ? `${v.name}, epoch ${cv.run.epoch}` : v.name}
                className="rounded-full outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
              >
                <Pin curve={cv} />
              </Link>
            </TooltipTrigger>
            <TooltipContent side="left">
              <span className="flex items-center gap-2">
                <VariantLabel run={cv.run} variant={v} compact size={14} />
                {several && <span className="tabular-nums">#{cv.run.epoch}</span>}
              </span>
            </TooltipContent>
          </Tooltip>
        </span>
        <div className="relative h-full flex-1" style={{ marginRight: frame.right }}>
          {/* The run's line for as long as it ran */}
          <span aria-hidden className={cn('absolute top-1/2 left-0 border-t-2 opacity-60', LINE[v.line], v.color.borderClassName)} style={{ width: end }} />
          {frame.hover != null && <span aria-hidden className="absolute inset-y-0 w-px bg-border" style={{ left: toPx(frame.hover) }} />}
          {icons.map(({ q, i, at, slot }) => {
            const inferred = q.source === 'inferred';
            const name = q.name ?? 'A quest we could not name';
            const waiting = x === 'ticks' && playhead != null && q.tick > playhead;
            return (
              <Tooltip key={i}>
                <TooltipTrigger asChild>
                  <span
                    tabIndex={0}
                    aria-label={inferred ? `≈ ${name}` : name}
                    className={cn(
                      'absolute top-1/2 flex -translate-x-1/2 -translate-y-1/2 rounded-sm bg-card outline-none focus-visible:ring-3 focus-visible:ring-ring/50',
                      inferred && 'border-b border-dashed border-muted-foreground',
                      waiting && 'opacity-30'
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
  }
}
