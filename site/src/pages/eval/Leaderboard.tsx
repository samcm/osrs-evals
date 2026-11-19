/**
 * The eval's one list of model + harness pairings, ranked by result: how many finished (or the median
 * result), every run as a dot on one shared scale (each opens its run), and the median cost. A click
 * on a pairing hides it on every chart; a double click shows only it; hovering lights it everywhere.
 */

import { Link } from '@tanstack/react-router';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { VariantLabel } from '@/components/marks';
import type { Eval, Run } from '@/data/types';
import { formatCost, formatInt } from '@/lib/format';
import { setHovered } from '@/lib/hover';
import { faded, useLit } from './lit';
import type { LegendState } from '@/lib/legend';
import { median } from '@/lib/stats';
import { cn } from '@/lib/utils';
import { formatX } from './chartBits';
import { finishOn, resultValue, type RankedVariant, type XMeasure } from './model';

const TO_FINISH: Record<XMeasure, string> = { ticks: 'Ticks to finish', seconds: 'Time to finish', cost: 'Cost to finish', calls: 'Calls to finish' };
/** The share of the scale for finished runs; the rest is for runs that did not finish */
const FINISHED_SPAN = 0.85;
const LINE = { solid: 'border-solid', dashed: 'border-dashed', dotted: 'border-dotted' } as const;

/** Every run of a pairing as a dot on the shared scale: filled when it finished, hollow at the end when not. */
function Spread({ e, r, x, max }: { e: Eval; r: RankedVariant; x: XMeasure; max: number }) {
  const target = e.target != null;
  const at = (run: Run): number => {
    const v = target ? finishOn(run, x) : resultValue(run);
    if (v == null) return 1;
    return Math.min(1, Math.max(0, v / max)) * (target ? FINISHED_SPAN : 1);
  };
  return (
    <span className="relative mx-2 block h-4 min-w-32">
      <span aria-hidden className="absolute top-1/2 left-0 border-t" style={{ width: `${(target ? FINISHED_SPAN : 1) * 100}%` }} />
      {/* Runs that never finished sit apart at the end, past a gap */}
      {target && <span aria-hidden className="absolute top-1/2 right-0 border-t border-dashed" style={{ width: `${(1 - FINISHED_SPAN - 0.05) * 100}%` }} />}
      {r.runs.map(run => {
        const finished = !target || run.success;
        const value = target ? finishOn(run, x) : resultValue(run);
        return (
          <Tooltip key={run.id}>
            <TooltipTrigger asChild>
              <Link
                to="/runs/$runId"
                params={{ runId: run.id }}
                search={{} as never}
                onClick={event => event.stopPropagation()}
                aria-label={`Epoch ${run.epoch}`}
                className="absolute top-1/2 grid size-4 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
                style={{ left: `${at(run) * 100}%` }}
              >
                <span className={cn('size-2.5 rounded-full', finished ? r.variant.color.swatchClassName : cn('border-2 bg-card', r.variant.color.borderClassName))} />
              </Link>
            </TooltipTrigger>
            <TooltipContent>
              <span className="tabular-nums">
                Epoch {run.epoch}: {target ? (run.success ? formatX(value, x) : `${formatInt(resultValue(run))} of ${formatInt(e.target)}`) : formatInt(value)}
              </span>
            </TooltipContent>
          </Tooltip>
        );
      })}
    </span>
  );
}

export function Leaderboard({ e, ranked, x, legend }: { e: Eval; ranked: RankedVariant[]; x: XMeasure; legend: LegendState }) {
  const target = e.target != null;
  const lit = useLit(legend.focus);
  // One scale for every row: the slowest finish (or the best result)
  const max = Math.max(
    1e-9,
    ...ranked.flatMap(r => r.runs.map(run => (target ? (finishOn(run, x) ?? 0) : (resultValue(run) ?? 0))))
  );
  return (
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead>
                <span className="sr-only">Pairing</span>
              </TableHead>
              <TableHead className="text-right">{target ? 'Finished' : 'Median'}</TableHead>
              {target && (
                <TableHead className="text-right" title="Median over finished runs">
                  {TO_FINISH[x]}
                </TableHead>
              )}
              {/* The runs' scale takes the table's slack, so the dots spread out */}
              <TableHead className="w-full">Runs</TableHead>
              <TableHead className="text-right" title="Median per run">
                Cost
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {ranked.map(r => {
              const key = r.variant.key;
              const focused = legend.focus === key;
              return (
                <TableRow
                  key={key}
                  data-state={focused ? 'selected' : undefined}
                  className={cn('cursor-pointer transition-opacity duration-150', (!legend.visible(key) || faded(lit, key)) && 'opacity-40')}
                  onMouseEnter={() => legend.visible(key) && setHovered(key)}
                  onMouseLeave={() => setHovered(undefined)}
                  onClick={event => (event.detail >= 2 ? legend.isolate(key) : legend.toggle(key))}
                >
                  <TableCell>
                    <button
                      type="button"
                      aria-pressed={legend.visible(key)}
                      title={focused ? 'Show every pairing' : 'Hide; double-click to show only this'}
                      onClick={event => {
                        event.stopPropagation();
                        if (event.detail >= 2) legend.isolate(key);
                        else legend.toggle(key);
                      }}
                      className="flex min-w-0 items-center gap-2 rounded-md text-left outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
                    >
                      <span aria-hidden className={cn('w-4 shrink-0 border-t-2', r.variant.color.borderClassName, LINE[r.variant.line])} />
                      <VariantLabel variant={r.variant} run={r.runs[0]} compact />
                    </button>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {target ? (
                      <>
                        {formatInt(r.finished)}
                        <span className="text-muted-foreground"> of {formatInt(r.runs.length)}</span>
                      </>
                    ) : (
                      formatInt(r.medianResult)
                    )}
                  </TableCell>
                  {target && <TableCell className="text-right tabular-nums">{r.toFinish == null ? '–' : formatX(r.toFinish, x).replace(/ (ticks|calls)$/, '')}</TableCell>}
                  <TableCell>
                    <Spread e={e} r={r} x={x} max={max} />
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{formatCost(median(r.runs.map(run => run.cost)))}</TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
  );
}
