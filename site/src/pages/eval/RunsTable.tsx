/** Every run of the eval: its pairing and what it did (its sentence and chapters, so runs compare at a glance), its progress as a sparkline, its result, cost and length; a row opens the run. */

import { useMemo, type JSX } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { createColumnHelper, type ColumnDef } from '@tanstack/react-table';
import clsx from 'clsx';
import { DataTable } from '@/components/DataTable';
import { Empty, Tip } from '@/components/bits';
import { VariantLabel } from '@/components/marks';
import type { Eval, Run } from '@/data/types';
import { cssColor } from '@/lib/chartSeries';
import { Sparkline } from '@/components/Charts/Sparkline';
import { formatCost, formatInt } from '@/lib/format';
import { useSearchUpdate } from '@/lib/search';
import { variantKey, variantOf } from '@/lib/series';
import { endedWord, resultText } from '@/lib/runResult';
import { RunStory } from '@/components/RunStory';
import { resultValue, totalBudgetTicks, type RunCurve } from './model';

const col = createColumnHelper<Run>();
const PAGE_SIZE = 25;

/** A run's value over the budget, in its model's colour, on a scale shared by every row. */
function Spark({
  curve,
  maxTick,
  top,
}: {
  curve: RunCurve | undefined;
  maxTick: number;
  top: number;
}): JSX.Element | null {
  if (!curve) return null;
  return (
    <Sparkline
      data={curve.points.map(p => [Math.min(p.tick, maxTick), p.value])}
      xDomain={[0, maxTick]}
      yDomain={[0, top]}
      width={96}
      color={cssColor(curve.variant.color)}
      step
    />
  );
}

function columns(e: Eval, curves: Map<string, RunCurve>): ColumnDef<Run, unknown>[] {
  const target = e.target != null;
  const maxTick = totalBudgetTicks(e);
  const top = e.target ?? Math.max(1, ...[...curves.values()].flatMap(cv => cv.points.map(p => p.value)));
  // The result next to the pairing (phones keep both in view), then cost; the epoch and ticks last
  return [
    col.accessor(r => variantOf(r).name, {
      id: 'variant',
      header: 'Pairing',
      cell: ({ row }) => (
        <span className="flex min-w-0 flex-col gap-0.5">
          <VariantLabel run={row.original} compact />
          <RunStory run={row.original} />
        </span>
      ),
    }),
    col.accessor(r => (r.success ? 1e9 - (r.ticks ?? 0) : 0) + (resultValue(r) ?? -1), {
      id: 'result',
      header: target ? 'Result' : e.measure,
      meta: { numeric: true },
      cell: ({ row }) => {
        const run = row.original;
        const value = resultText(run, e);
        if (!target) return value;
        return (
          <Tip content={run.success ? 'Finished' : 'Not finished'}>
            <span className="inline-flex items-center gap-1.5">
              <span
                aria-hidden
                className={clsx('size-2 rounded-full', run.success ? 'bg-success' : 'border-2 border-danger')}
              />
              {value}
            </span>
          </Tip>
        );
      },
    }),
    col.accessor(r => r.cost ?? Infinity, {
      id: 'cost',
      header: 'Cost',
      meta: { numeric: true },
      cell: ({ row }) => formatCost(row.original.cost),
    }),
    col.display({
      id: 'progress',
      header: () => <span className="sr-only">Progress</span>,
      // Phones keep the result columns in view
      meta: { className: 'max-md:hidden' },
      cell: ({ row }) => <Spark curve={curves.get(row.original.id)} maxTick={maxTick} top={top} />,
    }),
    col.accessor(r => r.ended_by ?? '', {
      id: 'ended',
      header: 'Ended',
      meta: { className: 'max-md:hidden' },
      cell: ({ row }) => <span className="text-muted">{endedWord(row.original.ended_by)}</span>,
    }),
    col.accessor('epoch', { header: 'Epoch', meta: { numeric: true } }),
    ...(target
      ? [
          col.accessor(r => r.ticks ?? Infinity, {
            id: 'ticks',
            header: 'Ticks to finish',
            meta: { numeric: true },
            cell: ({ row }) => formatInt(row.original.ticks),
          }),
        ]
      : []),
  ] as ColumnDef<Run, unknown>[];
}

export function RunsTable({
  e,
  runs,
  curves,
  sort,
  page,
}: {
  e: Eval;
  runs: Run[];
  curves: RunCurve[];
  sort: string[];
  page: number;
}): JSX.Element {
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
