import { useMemo } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { createColumnHelper, type ColumnDef } from '@tanstack/react-table';
import clsx from 'clsx';
import { Card } from '@/components/Card';
import { DataTable } from '@/components/DataTable';
import { Empty } from '@/components/bits';
import { VariantLabel } from '@/components/marks';
import type { Eval, Run } from '@/data/types';
import { capitalize, formatCost, formatInt } from '@/lib/format';
import { useSearchUpdate } from '@/lib/search';
import { variantOf } from '@/lib/series';
import { resultValue } from './model';

const col = createColumnHelper<Run>();
const PAGE_SIZE = 25;

function columns(e: Eval): ColumnDef<Run, unknown>[] {
  const target = e.target != null;
  return [
    col.display({
      id: 'screenshot',
      header: () => <span className="sr-only">End of the run</span>,
      cell: ({ row }) =>
        row.original.screenshot ? (
          <img
            src={`/data/${row.original.screenshot}`}
            alt=""
            loading="lazy"
            className="-my-1 h-9 w-16 max-w-none rounded-xs object-cover outline -outline-offset-1 outline-border"
          />
        ) : null,
    }),
    col.accessor(r => variantOf(r).name, { id: 'variant', header: 'Variant', cell: ({ row }) => <VariantLabel run={row.original} /> }),
    col.accessor('epoch', { header: 'Epoch', meta: { numeric: true } }),
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
            <span aria-hidden className={clsx('size-2 rounded-full', run.success ? 'bg-success' : 'border-2 border-danger')} />
            {value}
          </span>
        );
      },
    }),
    col.accessor(r => r.cost ?? Infinity, {
      id: 'cost',
      header: 'Cost',
      meta: { numeric: true },
      cell: ({ row }) => formatCost(row.original.cost),
    }),
    col.accessor(r => (target ? (r.ticks ?? Infinity) : (r.game_ticks ?? Infinity)), {
      id: 'ticks',
      header: target ? 'Ticks to finish' : 'Ticks played',
      meta: { numeric: true },
      cell: ({ row }) => formatInt(target ? row.original.ticks : row.original.game_ticks),
    }),
    col.accessor(r => r.ended_by ?? '', { id: 'ended', header: 'Ended by', cell: ({ row }) => capitalize(row.original.ended_by) }),
  ] as ColumnDef<Run, unknown>[];
}

export function RunsTable({ e, runs, sort, page }: { e: Eval; runs: Run[]; sort: string[]; page: number }) {
  const navigate = useNavigate();
  const update = useSearchUpdate();
  const cols = useMemo(() => columns(e), [e]);
  return (
    <Card title="Runs" flush>
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
      />
    </Card>
  );
}
