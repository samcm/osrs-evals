/**
 * The eval's one ranked list, raced: a row per pairing (or per run, for every run) in the order of
 * the eval's score, the same order from the first frame to the last. Each row names its pairing
 * (opening the model's page on this eval at its level and harness), its track (opening the run)
 * runs to its pin as far as the run has got at the playhead, with the eval's quest stages as ticks,
 * the newest quest it finished as a sprite, and what the agent was doing at the playhead as the
 * track's tooltip, and under the row the title of the run's chapter at the playhead
 * (site/summarize.py), its text on hover, opening the run there. The fixed columns carry the answer: the median result (or how many finished and
 * their median time to finish, in game time) and the median cost. The rows key the map: each row's
 * pin is the run's pin there.
 */

import { Tip } from '@/components/bits';
import { Fragment } from 'react';
import { Link } from '@tanstack/react-router';
import { BrandMark, Sprite, VariantLabel } from '@/components/marks';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import type { Eval, RunSummary } from '@/data/types';
import { formatAxisNumber, formatClock, formatCost, formatInt } from '@/lib/format';
import { setHovered } from '@/lib/hover';
import { evalSlug } from '@/lib/evals';
import type { AgentLine } from '@/lib/series';
import { modelSlug } from '@/lib/series';
import { median } from '@/lib/stats';
import { cn } from '@/lib/utils';
import { useIsMobile } from '@/hooks/use-mobile';
import { faded } from '../lit';
import { resultText, resultValue } from '@/lib/runResult';
import type { RunCurve } from '../model';
import type { LaneMark, LaneStage } from './lanes';
import type { RaceRow } from './race';

const LINE: Record<AgentLine, string> = { solid: 'border-solid', dashed: 'border-dashed', dotted: 'border-dotted' };

/** A run's pin, as on the map: its model's colour with its vendor's mark. */
export function Pin({ curve, small }: { curve: RunCurve; small?: boolean }) {
  const v = curve.variant;
  return (
    <span
      aria-hidden
      className={cn(
        'flex shrink-0 items-center justify-center rounded-full ring-2 ring-card',
        small ? 'size-3' : 'size-5',
        v.color.swatchClassName
      )}
    >
      {!small && <BrandMark slug={v.vendorSlug} size={14} className="size-3 bg-card" />}
    </span>
  );
}

export interface Lane extends RaceRow {
  /** The run's value at the playhead */
  value: number;
  /** Its newest quest by the playhead */
  mark: LaneMark | null;
  /** What the agent was doing at the playhead */
  status: string | null;
  /** The run's chapter at the playhead (site/summarize.py) */
  chapter: RunSummary['chapters'][number] | null;
}

/** Game time of a tick count at the eval's tick rate. */
export const gameTime = (e: Eval, ticks: number): string => formatClock((ticks * e.tick_ms) / 1000);

export function Standings({
  e,
  rows,
  max,
  perRun,
  lit,
  stages,
}: {
  e: Eval;
  rows: Lane[];
  max: number;
  perRun: boolean;
  lit: string | null;
  stages: LaneStage[];
}) {
  const target = e.target != null;
  // A phone has no room for the tracks or the cost (the Cost tab has it): each row is its pairing,
  // its value now and its result
  const mobile = useIsMobile();
  const track = !mobile;
  // Every column the header has, for the chapter line under each row
  const columns = 2 + Number(track || !target) + Number(target && !perRun) + Number(track);
  // Columns: pairing (in place order), track, then the fixed answer
  return (
    <Table className="table-fixed text-xs" aria-label="Standings">
      {track ? (
        <colgroup>
          <col className="w-1/2" />
          <col />
          {target && !perRun && <col className="w-14" />}
          <col className="w-14" />
          <col className="w-14" />
        </colgroup>
      ) : (
        // The pairing takes what the values leave, its name truncating first
        <colgroup>
          <col />
          {(!target || !perRun) && <col className="w-14" />}
          <col className="w-16" />
        </colgroup>
      )}
      <TableHeader>
        <TableRow className="hover:bg-transparent">
          <TableHead>
            <span className="sr-only">Pairing</span>
          </TableHead>
          {(track || !target) && (
            <TableHead className="text-right">{target ? <span className="sr-only">Progress</span> : 'Now'}</TableHead>
          )}
          {target && !perRun && <TableHead className="text-right">Finished</TableHead>}
          <TableHead className="text-right">
            <Tip
              content={
                perRun ? undefined : target ? 'Median time to finish, over finished runs' : 'Median over its runs'
              }
            >
              <span>{target ? (perRun ? 'Result' : 'Time') : perRun ? 'Result' : 'Median'}</span>
            </Tip>
          </TableHead>
          {track && (
            <TableHead className="text-right">
              <Tip content={perRun ? undefined : 'Median per run'}>
                <span>Cost</span>
              </Tip>
            </TableHead>
          )}
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map(row => {
          const { run, variant } = row.curve;
          const p = row.pairing;
          const f = Math.min(1, Math.max(0, row.value / max));
          const times = p.runs.filter(r => r.success && r.ticks != null).map(r => r.ticks!);
          const hover = { onMouseEnter: () => setHovered(variant.key), onMouseLeave: () => setHovered(undefined) };
          const fade = faded(lit, variant.key) && 'opacity-30';
          // A run with a summary has a chapter line, from the first frame
          const told = Boolean(run.summary);
          return (
            <Fragment key={run.id}>
              <TableRow className={cn('transition-opacity duration-150', fade, told && 'border-b-0')} {...hover}>
                <TableCell>
                  {/* The raced run in one sentence (site/summarize.py), on hover */}
                  <Tip content={run.summary}>
                    <Link
                      to="/evals/$evalId/$model"
                      params={{ evalId: evalSlug(e.id), model: modelSlug(variant.model) }}
                      search={{ level: [variant.thinking], harness: [variant.agent] } as never}
                      className="flex min-w-0 items-center gap-1.5 rounded-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
                    >
                      <VariantLabel run={run} variant={variant} compact size={14} className="min-w-0" />
                      {perRun && <span className="text-muted-foreground tabular-nums">#{run.epoch}</span>}
                    </Link>
                  </Tip>
                </TableCell>
                {track ? (
                  <TableCell>
                    {/* The track opens the run: a hairline to the end, the stages as ticks, the run's line (its harness's dash) to its pin */}
                    <Tip content={row.status}>
                      <Link
                        to="/runs/$runId"
                        params={{ runId: run.id }}
                        // A click into a run opens it at its start, playing
                        search={{} as never}
                        aria-label={`Epoch ${run.epoch}: ${formatInt(row.value)}`}
                        className="flex items-center gap-1.5 rounded-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
                      >
                        <span className="relative h-4 min-w-6 flex-1">
                          <span aria-hidden className="absolute inset-x-0 top-1/2 border-t" />
                          <span
                            aria-hidden
                            className={cn(
                              'absolute top-1/2 left-0 -translate-y-1/2 border-t-2',
                              LINE[variant.line],
                              variant.color.borderClassName
                            )}
                            style={{ width: `${f * 100}%` }}
                          />
                          {stages.map(s => (
                            <span
                              key={s.stage}
                              aria-hidden
                              className={cn(
                                'absolute top-1/2 size-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full',
                                row.value >= s.stage ? variant.color.swatchClassName : 'border bg-card'
                              )}
                              style={{ left: `${Math.min(1, s.stage / max) * 100}%` }}
                            />
                          ))}
                          <span
                            className="absolute top-1/2 -translate-x-1/2 -translate-y-1/2"
                            style={{ left: `${f * 100}%` }}
                          >
                            <Pin curve={row.curve} small />
                          </span>
                        </span>
                        {row.mark && !target && (
                          <span
                            className={cn(
                              'flex shrink-0',
                              row.mark.inferred && 'border-b border-dashed border-muted-foreground'
                            )}
                          >
                            <Sprite src={row.mark.src} size={14} alt={row.mark.name} />
                          </span>
                        )}
                        {!target && (
                          <span className="w-10 shrink-0 text-right text-muted-foreground tabular-nums">
                            {formatAxisNumber(row.value)}
                          </span>
                        )}
                      </Link>
                    </Tip>
                  </TableCell>
                ) : (
                  !target && (
                    <TableCell className="text-right text-muted-foreground tabular-nums">
                      <Tip content={row.status}>
                        <Link to="/runs/$runId" params={{ runId: run.id }} search={{} as never}>
                          {formatAxisNumber(row.value)}
                        </Link>
                      </Tip>
                    </TableCell>
                  )
                )}
                {target && !perRun && (
                  <TableCell className="text-right tabular-nums">
                    {formatInt(p.finished)}
                    <span className="text-muted-foreground"> of {formatInt(p.runs.length)}</span>
                  </TableCell>
                )}
                <TableCell className="text-right tabular-nums">
                  {/* Without a target a value can run to millions: compact, exact on hover */}
                  {target ? (
                    perRun ? (
                      resultText(run, e)
                    ) : times.length ? (
                      gameTime(e, median(times)!)
                    ) : (
                      '–'
                    )
                  ) : (
                    <Tip content={formatInt(perRun ? resultValue(run) : p.medianResult)}>
                      <span>{formatAxisNumber((perRun ? resultValue(run) : p.medianResult) ?? 0)}</span>
                    </Tip>
                  )}
                </TableCell>
                {track && (
                  <TableCell className="text-right tabular-nums">
                    {formatCost(perRun ? run.cost : median(p.runs.map(r => r.cost)))}
                  </TableCell>
                )}
              </TableRow>
              {told && (
                // The run's chapter at the playhead, its title only (its text on hover), under its row
                <TableRow className={cn('transition-opacity duration-150 hover:bg-transparent', fade)} {...hover}>
                  <TableCell colSpan={columns} className="pt-0">
                    {/* The line is held while the chapters load, so the rows never jump */}
                    <Tip content={row.chapter?.text}>
                      <Link
                        to="/runs/$runId"
                        params={{ runId: run.id }}
                        search={(row.chapter ? { t: row.chapter.from_tick } : {}) as never}
                        className="block truncate rounded-sm text-muted-foreground outline-none hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50"
                      >
                        {row.chapter?.title ?? '\u00a0'}
                      </Link>
                    </Tip>
                  </TableCell>
                </TableRow>
              )}
            </Fragment>
          );
        })}
      </TableBody>
    </Table>
  );
}
