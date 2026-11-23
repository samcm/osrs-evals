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
 *
 * Drawn as a plain table on lab's table type rather than lab's DataTable: every row carries a
 * full-width chapter line under it and re-renders each frame of the race, and DataTable's only
 * full-width row is one expanded panel.
 */

import { Fragment, type JSX } from 'react';
import { Link } from '@tanstack/react-router';
import clsx from 'clsx';
import { Tip } from '@/components/bits';
import { BrandMark, Sprite, VariantLabel } from '@/components/marks';
import type { Eval, RunSummary } from '@/data/types';
import { formatAxisNumber, formatCost, formatInt } from '@/lib/format';
import { setHovered } from '@/lib/hover';
import { evalSlug } from '@/lib/evals';
import type { AgentLine } from '@/lib/series';
import { modelSlug } from '@/lib/series';
import { median } from '@/lib/stats';
import { useIsMobile } from '@/hooks/use-mobile';
import { faded } from '@/pages/eval/lit';
import { resultText, resultValue } from '@/lib/runResult';
import type { RunCurve } from '@/pages/eval/model';
import { gameTime, type LaneMark, type LaneStage } from '@/pages/eval/centerpiece/lanes';
import type { RaceRow } from '@/pages/eval/centerpiece/race';

const lineClassName: Record<AgentLine, string> = {
  solid: 'border-solid',
  dashed: 'border-dashed',
  dotted: 'border-dotted',
};
/** A link inside a row: no box of its own, the theme's focus outline */
const rowLinkClassName = 'rounded-xs outline-hidden focus-visible:outline-2 focus-visible:outline-primary';
const headClassName = 'pb-2 text-right font-medium whitespace-nowrap text-muted';
const cellClassName = 'px-1 py-2 first:pl-0 last:pr-0';

/** A run's pin, as on the map: its model's colour with its vendor's mark. */
function Pin({ curve, small }: { curve: RunCurve; small?: boolean }): JSX.Element {
  const v = curve.variant;
  return (
    <span
      aria-hidden
      className={clsx(
        'flex shrink-0 items-center justify-center rounded-full ring-2 ring-surface',
        small ? 'size-3' : 'size-5',
        v.color.swatchClassName
      )}
    >
      {!small && <BrandMark slug={v.vendorSlug} size={14} className="size-3 bg-surface" />}
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
}): JSX.Element {
  const target = e.target != null;
  // A phone has no room for the tracks or the cost (the Cost tab has it): each row is its pairing,
  // its value now and its result
  const mobile = useIsMobile();
  const track = !mobile;
  // Every column the header has, for the chapter line under each row
  const columns = 2 + Number(track || !target) + Number(target && !perRun) + Number(track);
  // Columns: pairing (in place order), track, then the fixed answer
  return (
    <table className="w-full table-fixed text-xs text-foreground" aria-label="Standings">
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
      <thead>
        <tr className="border-b border-border">
          <th className={headClassName}>
            <span className="sr-only">Pairing</span>
          </th>
          {(track || !target) && (
            <th className={headClassName}>{target ? <span className="sr-only">Progress</span> : 'Now'}</th>
          )}
          {target && !perRun && <th className={headClassName}>Finished</th>}
          <th className={headClassName}>
            <Tip
              content={
                perRun ? undefined : target ? 'Median time to finish, over finished runs' : 'Median over its runs'
              }
            >
              <span>{target ? (perRun ? 'Result' : 'Time') : perRun ? 'Result' : 'Median'}</span>
            </Tip>
          </th>
          {track && (
            <th className={headClassName}>
              <Tip content={perRun ? undefined : 'Median per run'}>
                <span>Cost</span>
              </Tip>
            </th>
          )}
        </tr>
      </thead>
      <tbody>
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
              <tr
                className={clsx('transition-opacity duration-150', fade, !told && 'border-b border-border')}
                {...hover}
              >
                <td className={cellClassName}>
                  {/* The raced run in one sentence (site/summarize.py), on hover */}
                  <Tip content={run.summary}>
                    <Link
                      to="/evals/$evalId/$model"
                      params={{ evalId: evalSlug(e.id), model: modelSlug(variant.model) }}
                      search={{ level: [variant.thinking], harness: [variant.agent] } as never}
                      className={clsx('flex min-w-0 items-center gap-1.5', rowLinkClassName)}
                    >
                      <VariantLabel run={run} variant={variant} compact size={14} className="min-w-0" />
                      {perRun && <span className="text-muted tabular-nums">#{run.epoch}</span>}
                    </Link>
                  </Tip>
                </td>
                {track ? (
                  <td className={cellClassName}>
                    {/* The track opens the run: a hairline to the end, the stages as ticks, the run's line (its harness's dash) to its pin */}
                    <Tip content={row.status}>
                      <Link
                        to="/runs/$runId"
                        params={{ runId: run.id }}
                        // A click into a run opens it at its start, playing
                        search={{} as never}
                        aria-label={`Epoch ${run.epoch}: ${formatInt(row.value)}`}
                        className={clsx('flex items-center gap-1.5', rowLinkClassName)}
                      >
                        <span className="relative h-4 min-w-6 flex-1">
                          <span aria-hidden className="absolute inset-x-0 top-1/2 border-t border-border" />
                          <span
                            aria-hidden
                            className={clsx(
                              'absolute top-1/2 left-0 -translate-y-1/2 border-t-2',
                              lineClassName[variant.line],
                              variant.color.borderClassName
                            )}
                            style={{ width: `${f * 100}%` }}
                          />
                          {stages.map(s => (
                            <span
                              key={s.stage}
                              aria-hidden
                              className={clsx(
                                'absolute top-1/2 size-1.5 -translate-1/2 rounded-full',
                                row.value >= s.stage ? variant.color.swatchClassName : 'border border-border bg-surface'
                              )}
                              style={{ left: `${Math.min(1, s.stage / max) * 100}%` }}
                            />
                          ))}
                          <span className="absolute top-1/2 -translate-1/2" style={{ left: `${f * 100}%` }}>
                            <Pin curve={row.curve} small />
                          </span>
                        </span>
                        {row.mark && !target && (
                          <span
                            className={clsx(
                              'flex shrink-0',
                              row.mark.inferred && 'border-b border-dashed border-muted'
                            )}
                          >
                            <Sprite src={row.mark.src} size={14} alt={row.mark.name} />
                          </span>
                        )}
                        {!target && (
                          <span className="w-10 shrink-0 text-right text-muted tabular-nums">
                            {formatAxisNumber(row.value)}
                          </span>
                        )}
                      </Link>
                    </Tip>
                  </td>
                ) : (
                  !target && (
                    <td className={clsx(cellClassName, 'text-right text-muted tabular-nums')}>
                      <Tip content={row.status}>
                        <Link
                          to="/runs/$runId"
                          params={{ runId: run.id }}
                          search={{} as never}
                          className={rowLinkClassName}
                        >
                          {formatAxisNumber(row.value)}
                        </Link>
                      </Tip>
                    </td>
                  )
                )}
                {target && !perRun && (
                  <td className={clsx(cellClassName, 'text-right tabular-nums')}>
                    {formatInt(p.finished)}
                    <span className="text-muted"> of {formatInt(p.runs.length)}</span>
                  </td>
                )}
                <td className={clsx(cellClassName, 'text-right tabular-nums')}>
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
                </td>
                {track && (
                  <td className={clsx(cellClassName, 'text-right tabular-nums')}>
                    {formatCost(perRun ? run.cost : median(p.runs.map(r => r.cost)))}
                  </td>
                )}
              </tr>
              {told && (
                // The run's chapter at the playhead, its title only (its text on hover), under its row
                <tr className={clsx('border-b border-border transition-opacity duration-150', fade)} {...hover}>
                  <td colSpan={columns} className="pb-2">
                    {/* The line is held while the chapters load, so the rows never jump */}
                    <Tip content={row.chapter?.text}>
                      <Link
                        to="/runs/$runId"
                        params={{ runId: run.id }}
                        search={(row.chapter ? { t: row.chapter.from_tick } : {}) as never}
                        className={clsx('block truncate text-muted hover:text-foreground', rowLinkClassName)}
                      >
                        {row.chapter?.title ?? '\u00a0'}
                      </Link>
                    </Tip>
                  </td>
                </tr>
              )}
            </Fragment>
          );
        })}
      </tbody>
    </table>
  );
}
