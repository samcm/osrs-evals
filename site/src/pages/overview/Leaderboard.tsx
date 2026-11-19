/**
 * The overview's lead and its one ranked list: every pairing (a model in a harness) by its blended
 * score, then a heat cell per eval so coverage shows as it is (a blank cell is an eval it didn't
 * run). The score comes straight after the name so it stays in view on a phone and with any number
 * of evals; the eval columns scroll inside the card.
 * Sorting by any column is `?sort=`; a row opens the pairing's runs.
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
import { formatScore, type Pairing } from '@/lib/score';
import { cn } from '@/lib/utils';

/** One hue in tint steps, darker for a higher score. */
const TINTS = ['bg-data-emerald/5', 'bg-data-emerald/15', 'bg-data-emerald/25', 'bg-data-emerald/40', 'bg-data-emerald/55'];
const tint = (score: number): string => TINTS[Math.min(TINTS.length - 1, Math.floor(score * TINTS.length))];

function HeatCell({ pairing, e }: { pairing: Pairing; e: Eval }) {
  const s = pairing.evals.get(e.id);
  if (!s) return <span className="inline-flex h-6 w-9 items-center justify-center text-muted-foreground">–</span>;
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className={cn('inline-flex h-6 w-9 items-center justify-center rounded-sm tabular-nums', tint(s.score))}>{formatScore(s.score)}</span>
      </TooltipTrigger>
      <TooltipContent>
        {e.title}, {s.runs === 1 ? '1 run' : `${s.runs} runs`}
      </TooltipContent>
    </Tooltip>
  );
}

/** How the score is made, on demand. */
function Scoring() {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="sm">
          How it's scored
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="flex w-80 flex-col gap-2 text-sm">
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
        col.accessor('rank', { header: '#', enableSorting: false, cell: ({ getValue }) => <span className="text-muted-foreground">{getValue()}</span> }),
        col.accessor(p => p.variant.name, {
          id: 'pairing',
          header: 'Pairing',
          // The name takes the table's spare width, so the numbers sit together on the right
          meta: { className: 'w-full' },
          // On a phone a long name truncates (its title has it whole) so the score stays in view
          cell: ({ row }) => <VariantLabel variant={row.original.variant} run={row.original.sample} compact className="max-md:max-w-52" />,
        }),
        col.accessor('score', {
          header: 'Score',
          meta: { numeric: true },
          sortDescFirst: true,
          cell: ({ getValue }) => (
            <span className="flex items-center justify-end gap-3">
              <Progress value={getValue() * 100} aria-hidden className="w-24 max-md:hidden **:data-[slot=progress-indicator]:bg-data-emerald" />
              <span className="font-medium">{formatScore(getValue())}</span>
            </span>
          ),
        }),
        ...evals.map(e =>
          col.accessor(p => p.evals.get(e.id)?.score ?? -1, {
            id: `eval-${e.id}`,
            header: () => <EvalMark evalId={e.id} size={16} title={e.title} />,
            meta: { numeric: true },
            sortDescFirst: true,
            cell: ({ row }) => <HeatCell pairing={row.original} e={e} />,
          })
        ),
      ] as ColumnDef<Row, unknown>[],
    [evals]
  );

  return (
    <PageSection title="Leaderboard" actions={<Scoring />}>
      <DataTable
        data={rows}
        columns={columns}
        getRowId={p => p.variant.key}
        hoverId={p => p.variant.key}
        sort={sort}
        onSortChange={onSortChange}
        onRowClick={p => navigate({ to: '/runs', search: { model: [p.variant.model], agent: [p.variant.agent] } as never })}
        empty={<Empty>No runs in this scope.</Empty>}
      />
    </PageSection>
  );
}
