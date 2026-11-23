/**
 * The overview: its one ranked list, the page's full width. Every pairing (a model in a harness) by
 * its blended score out of 100, then a cell per eval, headed by its sprite and name, with the
 * pairing's own result there on hover (a blank cell is an eval it didn't run), then what its runs
 * cost; fifty to a page. An eval only one pairing ran has no column: one cell compares nothing.
 * On a phone the eval cells sit under the pairing's name, so the score stays in view beside it.
 * Sorting by any column is `?sort=`, the page `?page=`; a row opens the model's page, filtered to
 * the row's level and harness, and an eval's cell that model's runs of that eval.
 */

import { useMemo } from 'react';
import { Link, useNavigate } from '@tanstack/react-router';
import { createColumnHelper, type ColumnDef } from '@tanstack/react-table';
import { DataTable } from '@/components/DataTable';
import { Empty } from '@/components/bits';
import { EvalMark, VariantLabel } from '@/components/marks';
import { Button } from '@/components/ui/button';
import { PageSection } from '@/components/page';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import type { Eval } from '@/data/types';
import { evalArt, evalSlug } from '@/lib/evals';
import { formatScore, type Pairing } from '@/lib/score';
import { formatCost, formatDuration, formatInt } from '@/lib/format';
import { resultValue } from '@/lib/runResult';
import { median, sum } from '@/lib/stats';
import { modelSlug } from '@/lib/series';
import { cn } from '@/lib/utils';

/** One hue in tint steps, darker for a higher score. */
export const TINTS = ['bg-data-emerald/5', 'bg-data-emerald/15', 'bg-data-emerald/25', 'bg-data-emerald/40', 'bg-data-emerald/55'];
export const tint = (score: number): string => TINTS[Math.min(TINTS.length - 1, Math.floor(score * TINTS.length))];

/** The pairing's own result on an eval, in the eval's terms: how many finished and how fast, or its median amount. */
function resultText(pairing: Pairing, e: Eval): string {
  const runs = pairing.runs.filter(r => r.eval === e.id);
  if (e.target != null) {
    const done = runs.filter(r => r.success);
    const time = median(done.map(r => r.seconds));
    return done.length ? `Finished ${done.length} of ${runs.length}, median ${formatDuration(time)}` : `Finished 0 of ${runs.length}`;
  }
  return `Median ${e.measure.toLowerCase()} ${formatInt(median(runs.map(resultValue)))}, over ${runs.length === 1 ? '1 run' : `${runs.length} runs`}`;
}

function HeatCell({ pairing, e, mark }: { pairing: Pairing; e: Eval; mark?: boolean }) {
  const s = pairing.evals.get(e.id);
  if (!s) return mark ? null : <span className="text-xs text-muted-foreground">–</span>;
  const { variant } = pairing;
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        {/* The model's runs of this eval, at the row's level and harness */}
        <Link
          to="/evals/$evalId/$model"
          params={{ evalId: evalSlug(e.id), model: modelSlug(variant.model) }}
          search={{ level: [variant.thinking], harness: [variant.agent] } as never}
          onClick={ev => ev.stopPropagation()}
          className={cn('inline-flex h-6 items-center gap-1 rounded-sm px-1 text-muted-foreground tabular-nums outline-none hover:bg-muted hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50', !mark && '-mr-1')}
        >
          {mark && <EvalMark evalId={e.id} size={14} title="" />}
          {formatScore(s.score)}
        </Link>
      </TooltipTrigger>
      <TooltipContent>
        {e.title}: {resultText(pairing, e)}
      </TooltipContent>
    </Tooltip>
  );
}

/** How the score is made, on demand: what wins each eval, then how runs become one number. */
function Scoring({ evals }: { evals: Eval[] }) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="sm">
          How it's scored
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="flex w-80 flex-col gap-2 text-sm">
        <ul className="flex flex-col gap-1">
          {evals.map(e => (
            <li key={e.id} className="flex items-center gap-2">
              <EvalMark evalId={e.id} size={16} title={e.title} />
              <span>{evalArt(e.id).score ?? e.title}</span>
            </li>
          ))}
        </ul>
        <p>Each run scores 0 to 100 on its eval. A finish is worth 50 to 100, more the sooner it came; a miss up to 50 by how far it got. Evals without a target score against the best run.</p>
        <p>A pairing's score is the average plus how far it beat or trailed everyone on each eval it ran. An eval it skipped neither helps nor hurts, and a pairing that ran few evals stays nearer the middle.</p>
      </PopoverContent>
    </Popover>
  );
}

type Row = Pairing & { rank: number };
const col = createColumnHelper<Row>();

export function Leaderboard({
  pairings,
  evals: every,
  sort,
  onSortChange,
  page,
  onPageChange,
}: {
  pairings: Pairing[];
  evals: Eval[];
  sort: string[];
  onSortChange: (sort: string[]) => void;
  page: number;
  onPageChange: (page: number) => void;
}) {
  const navigate = useNavigate();
  const rows = useMemo(() => pairings.map((p, i) => ({ ...p, rank: i + 1 })), [pairings]);
  const evals = useMemo(() => every.filter(e => pairings.filter(p => p.evals.has(e.id)).length > 1), [every, pairings]);
  const columns = useMemo(
    () =>
      [
        col.accessor('rank', { header: '#', enableSorting: false, meta: { className: 'w-px' }, cell: ({ getValue }) => <span className="text-muted-foreground">{getValue()}</span> }),
        col.accessor(p => p.variant.name, {
          id: 'pairing',
          header: 'Pairing',
          meta: { className: 'w-px' },
          // On a phone a long name truncates (its title has it whole) so the score stays in view
          cell: ({ row }) => (
            <span className="flex min-w-0 flex-col gap-1">
              <VariantLabel variant={row.original.variant} run={row.original.sample} compact className="max-md:max-w-52" />
              {/* A phone has no room for the eval columns: the cells under the name */}
              <span className="flex flex-wrap gap-1 md:hidden">
                {evals.map(e => (
                  <HeatCell key={e.id} pairing={row.original} e={e} mark />
                ))}
              </span>
            </span>
          ),
        }),
        col.accessor('score', {
          header: 'Score of 100',
          meta: { className: 'w-px' },
          sortDescFirst: true,
          // Complete pairings above partial ones, whichever way it sorts by score
          sortingFn: (a, b) => Number(a.original.complete) - Number(b.original.complete) || a.original.score - b.original.score,
          // A partial pairing's score is over the evals it ran: muted, and says so
          // The row's answer: the number, large, over a bar of its 100
          cell: ({ row, getValue }) => (
            <span className={cn('flex items-center gap-2', !row.original.complete && 'text-muted-foreground')}>
              <span className="w-8 text-base font-semibold tabular-nums">{formatScore(getValue())}</span>
              {/* A bar of its 100 in the model's colour, as on every chart */}
              <span aria-hidden className={cn('h-2 w-12 overflow-hidden rounded-full bg-muted md:w-24 2xl:w-48', !row.original.complete && 'opacity-50')}>
                <span className={cn('block h-full rounded-full', row.original.variant.color.swatchClassName)} style={{ width: `${getValue() * 100}%` }} />
              </span>
            </span>
          ),
        }),
        ...evals.map(e =>
          col.accessor(p => p.evals.get(e.id)?.score ?? -1, {
            id: `eval-${e.id}`,
            // The eval's sprite and name, right-aligned over its numbers
            header: () => (
              <span className="inline-flex items-center gap-1.5">
                {/* The sprite where there's room for it: at 1440 the names alone fit every column */}
                <EvalMark evalId={e.id} size={16} title="" className="max-2xl:hidden" />
                {e.title}
              </span>
            ),
            meta: { numeric: true, className: 'max-md:hidden' },
            sortDescFirst: true,
            cell: ({ row }) => <HeatCell pairing={row.original} e={e} />,
          })
        ),
        // What all its runs cost together: every complete pairing ran the same evals the same number of times
        col.accessor(p => sum(p.runs.map(r => r.cost)), {
          id: 'cost',
          header: 'Spent',
          // Where every eval's column fits beside it
          meta: { numeric: true, className: 'max-md:hidden', minWidth: 1100 },
          cell: ({ getValue, row }) => <span className="text-muted-foreground">{row.original.runs.some(r => r.cost != null) ? formatCost(getValue()) : '–'}</span>,
        }),
      ] as ColumnDef<Row, unknown>[],
    [evals]
  );

  return (
    <PageSection title="Leaderboard" actions={<Scoring evals={every} />}>
      <DataTable
        page={page}
        pageSize={50}
        onPageChange={onPageChange}
        data={rows}
        columns={columns}
        getRowId={p => p.variant.key}
        hoverId={p => p.variant.key}
        sort={sort}
        onSortChange={onSortChange}
        onRowClick={p =>
          navigate({
            to: '/models/$model',
            params: { model: modelSlug(p.variant.model) },
            search: { level: [p.variant.thinking], harness: [p.variant.agent] } as never,
          })
        }
        empty={<Empty>No runs in this scope.</Empty>}
      />
    </PageSection>
  );
}
