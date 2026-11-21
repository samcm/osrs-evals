/**
 * The overview's lead and its one ranked list: every pairing (a model in a harness) by its blended
 * score out of 100, then a heat cell per eval so coverage shows as it is (a blank cell is an eval it
 * didn't run), ten to a page. An eval only one pairing ran has no column: one cell compares nothing.
 * On a phone the eval cells sit under the pairing's name, so the score stays in view beside it.
 * Sorting by any column is `?sort=`, the page `?page=`; a row opens the model's page, filtered to
 * the row's level and harness.
 */

import { useMemo } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { createColumnHelper, type ColumnDef } from '@tanstack/react-table';
import { DataTable } from '@/components/DataTable';
import { Empty } from '@/components/bits';
import { EvalMark, VariantLabel } from '@/components/marks';
import { Button } from '@/components/ui/button';
import { PageSection } from '@/components/page';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import type { Eval } from '@/data/types';
import { evalArt } from '@/lib/evals';
import { formatScore, type Pairing } from '@/lib/score';
import { modelSlug } from '@/lib/series';
import { cn } from '@/lib/utils';

/** One hue in tint steps, darker for a higher score. */
export const TINTS = ['bg-data-emerald/5', 'bg-data-emerald/15', 'bg-data-emerald/25', 'bg-data-emerald/40', 'bg-data-emerald/55'];
export const tint = (score: number): string => TINTS[Math.min(TINTS.length - 1, Math.floor(score * TINTS.length))];

function HeatCell({ pairing, e, mark }: { pairing: Pairing; e: Eval; mark?: boolean }) {
  const s = pairing.evals.get(e.id);
  if (!s) return mark ? null : <span className="inline-flex h-6 w-10 items-center justify-center text-muted-foreground">–</span>;
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className={cn('inline-flex h-6 items-center justify-center gap-1 rounded-sm tabular-nums', mark ? 'px-1' : 'w-10', tint(s.score))}>
          {mark && <EvalMark evalId={e.id} size={14} title="" />}
          {formatScore(s.score)}
        </span>
      </TooltipTrigger>
      <TooltipContent>
        {e.title}, {s.runs === 1 ? '1 run' : `${s.runs} runs`}
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
          header: () => <span title="Out of 100: how it's scored, top right">Score of 100</span>,
          meta: { numeric: true, className: 'w-px' },
          sortDescFirst: true,
          cell: ({ getValue }) => <span className="font-medium tabular-nums">{formatScore(getValue())}</span>,
        }),
        ...evals.map(e =>
          col.accessor(p => p.evals.get(e.id)?.score ?? -1, {
            id: `eval-${e.id}`,
            // The eval's sprite, its name on hover: every eval's column fits beside the score, however many there are
            header: () => (
              <span className="inline-flex items-center" title={e.title}>
                <EvalMark evalId={e.id} size={20} title={e.title} />
              </span>
            ),
            meta: { className: 'text-center max-md:hidden' },
            sortDescFirst: true,
            cell: ({ row }) => <HeatCell pairing={row.original} e={e} />,
          })
        ),
      ] as ColumnDef<Row, unknown>[],
    [evals]
  );

  return (
    <PageSection title="Leaderboard" actions={<Scoring evals={every} />} className="2xl:col-span-8">
      <DataTable
        page={page}
        pageSize={10}
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
