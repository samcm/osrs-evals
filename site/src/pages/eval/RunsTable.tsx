/** Every run of the eval: its pairing, its progress as a sparkline, its result, cost and length; a row opens the run. */

import { useMemo } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { createColumnHelper, type ColumnDef } from '@tanstack/react-table';
import { Line, LineChart, YAxis, XAxis } from 'recharts';
import { cn } from '@/lib/utils';
import { DataTable } from '@/components/DataTable';
import { Empty } from '@/components/bits';
import { VariantLabel } from '@/components/marks';
import type { Eval, Run } from '@/data/types';
import { cssColor } from '@/lib/chartSeries';
import { capitalize, formatCost, formatInt } from '@/lib/format';
import { useSearchUpdate } from '@/lib/search';
import { variantKey, variantOf } from '@/lib/series';
import { resultValue, totalBudgetTicks, type RunCurve } from './model';

const col = createColumnHelper<Run>();
const PAGE_SIZE = 25;

/** A run's value over the budget, in its model's colour, on a scale shared by every row. */
function Spark({ curve, maxTick, top }: { curve: RunCurve | undefined; maxTick: number; top: number }) {
  if (!curve) return null;
  const data = curve.points.map(p => ({ t: Math.min(p.tick, maxTick), v: p.value }));
  return (
    <LineChart width={96} height={24} data={data} margin={{ top: 2, right: 2, bottom: 2, left: 2 }} aria-hidden>
      <XAxis dataKey="t" type="number" domain={[0, maxTick]} hide />
      <YAxis domain={[0, top]} hide />
      <Line dataKey="v" type="stepAfter" stroke={cssColor(curve.variant.color)} strokeWidth={1.5} dot={false} isAnimationActive={false} />
    </LineChart>
  );
}

function columns(e: Eval, curves: Map<string, RunCurve>): ColumnDef<Run, unknown>[] {
  const target = e.target != null;
  const maxTick = totalBudgetTicks(e);
  const top = e.target ?? Math.max(1, ...[...curves.values()].flatMap(cv => cv.points.map(p => p.value)));
  return [
    col.accessor(r => variantOf(r).name, { id: 'variant', header: 'Pairing', cell: ({ row }) => <VariantLabel run={row.original} compact /> }),
    col.accessor('epoch', { header: 'Epoch', meta: { numeric: true } }),
    col.display({
      id: 'progress',
      header: () => <span className="sr-only">Progress</span>,
      // Phones keep the result columns in view
      meta: { className: 'max-md:hidden' },
      cell: ({ row }) => <Spark curve={curves.get(row.original.id)} maxTick={maxTick} top={top} />,
    }),
    col.accessor(r => (r.success ? 1e9 : 0) + (resultValue(r) ?? -1), {
      id: 'result',
      header: e.measure,
      meta: { numeric: true },
      cell: ({ row }) => {
        const run = row.original;
        const value = formatInt(resultValue(run));
        if (!target) return value;
        return (
          <span className="inline-flex items-center gap-1.5" title={run.success ? 'Finished' : 'Not finished'}>
            <span aria-hidden className={cn('size-2 rounded-full', run.success ? 'bg-success' : 'border-2 border-destructive')} />
            {value}
          </span>
        );
      },
    }),
    col.accessor(r => (target ? (r.ticks ?? Infinity) : (r.game_ticks ?? Infinity)), {
      id: 'ticks',
      header: target ? 'Ticks to finish' : 'Ticks played',
      meta: { numeric: true },
      cell: ({ row }) => formatInt(target ? row.original.ticks : row.original.game_ticks),
    }),
    col.accessor(r => r.cost ?? Infinity, {
      id: 'cost',
      header: 'Cost',
      meta: { numeric: true },
      cell: ({ row }) => formatCost(row.original.cost),
    }),
    col.accessor(r => r.ended_by ?? '', {
      id: 'ended',
      header: 'Ended by',
      meta: { className: 'max-md:hidden' },
      cell: ({ row }) => <span className="text-muted-foreground">{capitalize(row.original.ended_by)}</span>,
    }),
  ] as ColumnDef<Run, unknown>[];
}

export function RunsTable({ e, runs, curves, sort, page }: { e: Eval; runs: Run[]; curves: RunCurve[]; sort: string[]; page: number }) {
  const navigate = useNavigate();
  const update = useSearchUpdate();
  const cols = useMemo(() => columns(e, new Map(curves.map(cv => [cv.run.id, cv]))), [e, curves]);
  return (
        <DataTable
          data={runs}
          columns={cols}
          getRowId={r => r.id}
          sort={sort}
          onSortChange={s => update({ sort: s }, { resetPage: true })}
          page={page}
          pageSize={PAGE_SIZE}
          onPageChange={p => update({ page: p === 1 ? undefined : p })}
          // Scope rides along by itself (the root retains it); nothing else is carried
          onRowClick={r => navigate({ to: '/runs/$runId', params: { runId: r.id }, search: {} as never })}
          empty={<Empty>No runs in this scope.</Empty>}
          hoverId={r => variantKey(r)}
        />
  );
}
