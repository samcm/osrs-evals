/**
 * The overview's lead and its one ranked list: every pairing (a model in a harness) by its blended
 * score, then a heat cell per eval so coverage shows as it is (a blank cell is an eval it didn't
 * run). The score comes straight after the name so it stays in view on a phone and with any number
 * of evals; the eval columns scroll inside the card.
 * Sorting by any column is `?sort=`; a row opens the model's page, filtered to the row's level and harness.
 */

import { useMemo } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { createColumnHelper, type ColumnDef } from '@tanstack/react-table';
import { DataTable } from '@/components/DataTable';
import { Empty } from '@/components/bits';
import { EvalMark, VariantLabel } from '@/components/marks';
import { Button } from '@/components/ui/button';
import { PageSection } from '@/components/page';
import { Progress } from '@/components/ui/progress';
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

function HeatCell({ pairing, e }: { pairing: Pairing; e: Eval }) {
  const s = pairing.evals.get(e.id);
  if (!s) return <span className="inline-flex h-6 w-10 items-center justify-center text-muted-foreground">–</span>;
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className={cn('inline-flex h-6 w-10 items-center justify-center rounded-sm tabular-nums', tint(s.score))}>{formatScore(s.score)}</span>
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

export function Leaderboard({ pairings, evals, sort, onSortChange }: { pairings: Pairing[]; evals: Eval[]; sort: string[]; onSortChange: (sort: string[]) => void }) {
  const navigate = useNavigate();
  const rows = useMemo(() => pairings.map((p, i) => ({ ...p, rank: i + 1 })), [pairings]);
  const columns = useMemo(
    () =>
      [
        col.accessor('rank', { header: '#', enableSorting: false, meta: { className: 'w-px' }, cell: ({ getValue }) => <span className="text-muted-foreground">{getValue()}</span> }),
        col.accessor(p => p.variant.name, {
          id: 'pairing',
          header: 'Pairing',
          meta: { className: 'w-px' },
          // On a phone a long name truncates (its title has it whole) so the score stays in view
          cell: ({ row }) => <VariantLabel variant={row.original.variant} run={row.original.sample} compact className="max-md:max-w-52" />,
        }),
        col.accessor('score', {
          header: 'Score',
          // A long bar, so the ranking reads as a bar chart

          sortDescFirst: true,
          cell: ({ getValue }) => (
            <span className="flex min-w-0 items-center gap-3">
              <span className="w-7 shrink-0 text-right font-medium tabular-nums">{formatScore(getValue())}</span>
              <Progress value={getValue() * 100} aria-hidden className="w-24 xl:w-32 2xl:w-56 max-md:hidden **:data-[slot=progress-indicator]:bg-data-emerald" />
            </span>
          ),
        }),
        ...evals.map(e =>
          col.accessor(p => p.evals.get(e.id)?.score ?? -1, {
            id: `eval-${e.id}`,
            header: () => (
              <span className="inline-flex items-center gap-1.5 whitespace-nowrap" title={e.title}>
                <EvalMark evalId={e.id} size={16} title="" />
                {/* "Quest points in 30 minutes" → "Quest points": the window is the eval's, not the column's */}
                {e.title.split(' in ')[0]}
              </span>
            ),
            // Columns other than the score shrink to their content, so the score's bar takes the rest
            meta: { className: 'w-px text-center' },
            sortDescFirst: true,
            cell: ({ row }) => <HeatCell pairing={row.original} e={e} />,
          })
        ),
      ] as ColumnDef<Row, unknown>[],
    [evals]
  );

  return (
    <PageSection title="Leaderboard" actions={<Scoring evals={evals} />}>
      <DataTable
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
            search: { ...(p.variant.thinking && { level: [p.variant.thinking] }), harness: [p.variant.agent] } as never,
          })
        }
        empty={<Empty>No runs in this scope.</Empty>}
      />
    </PageSection>
  );
}
