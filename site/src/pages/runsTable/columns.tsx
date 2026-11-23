/**
 * The runs table's columns, shared by `/runs` and the model page: the eval, the pairing with the run's
 * sentence under it, its result, cost and when it ran, then the columns a wider table has room for.
 */

import { Link } from '@tanstack/react-router';
import { createColumnHelper, type ColumnDef } from '@tanstack/react-table';
import { Tip } from '@/components/bits';
import { EvalMark, VariantLabel } from '@/components/marks';
import { RunStory } from '@/components/RunStory';
import type { Eval, Run } from '@/data/types';
import { formatClock, formatCost, formatInt, MISSING } from '@/lib/format';
import { endedWord, resultValue } from '@/lib/runResult';
import { agentInfo, modelInfo } from '@/lib/series';
import { ResultCell } from './ResultCell';

const startedFormat = new Intl.DateTimeFormat('en-GB', {
  day: 'numeric',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
  timeZone: 'UTC',
});

export interface Row extends Run {
  e: Eval | undefined;
}

const col = createColumnHelper<Row>();

export function runColumns(oneEval: Eval | undefined): ColumnDef<Row, unknown>[] {
  return [
    // Filtered to one eval, every row would repeat it
    ...(oneEval
      ? []
      : [
          col.accessor(r => r.e?.title ?? r.eval, {
            id: 'eval',
            header: 'Eval',
            // A phone shows the eval's sprite in the pairing's cell, so the result fits beside it
            meta: { className: 'max-md:hidden' },
            cell: ({ row, getValue }) => (
              <Tip content={String(getValue())}>
                <span className="inline-flex items-center gap-2">
                  <EvalMark evalId={row.original.eval} size={20} title={String(getValue())} />
                  <span className="@max-4xl/runs:sr-only">{String(getValue())}</span>
                </span>
              </Tip>
            ),
          }),
        ]),
    col.accessor(r => `${modelInfo(r.model).short} ${r.thinking} ${agentInfo(r.agent, r.agent_name).name}`, {
      id: 'variant',
      header: 'Pairing',
      cell: ({ row }) => (
        <span className="flex min-w-0 flex-col gap-0.5">
          <span className="inline-flex min-w-0 items-center gap-2">
            {!oneEval && (
              <EvalMark
                evalId={row.original.eval}
                size={16}
                title={row.original.e?.title ?? row.original.eval}
                className="md:hidden"
              />
            )}
            <VariantLabel run={row.original} compact />
          </span>
          <RunStory run={row.original} />
        </span>
      ),
    }),
    col.accessor(r => (r.success ? 1e9 : 0) + (resultValue(r) ?? -1), {
      id: 'result',
      header: oneEval?.measure ?? 'Result',
      meta: { numeric: true },
      sortDescFirst: true,
      cell: ({ row }) => <ResultCell run={row.original} e={row.original.e} />,
    }),
    col.accessor(r => r.cost ?? -1, {
      id: 'cost',
      header: 'Cost',
      meta: { numeric: true, minWidth: 440 },
      sortDescFirst: true,
      cell: ({ row }) => formatCost(row.original.cost),
    }),
    col.accessor(r => r.sample_started ?? r.started, {
      id: 'started',
      header: 'Started (UTC)',
      meta: { minWidth: 700 },
      sortDescFirst: true,
      cell: ({ getValue }) => {
        const date = new Date(String(getValue()));
        return Number.isNaN(date.getTime()) ? MISSING : startedFormat.format(date);
      },
    }),
    col.accessor(r => r.metrics.wall_seconds ?? -1, {
      id: 'wall',
      header: 'Wall time',
      meta: { numeric: true, minWidth: 560 },
      sortDescFirst: true,
      cell: ({ row }) =>
        row.original.metrics.wall_seconds == null ? MISSING : formatClock(row.original.metrics.wall_seconds),
    }),
    col.accessor(r => r.game_ticks ?? -1, {
      id: 'ticks',
      header: 'Game ticks',
      meta: { numeric: true, minWidth: 820 },
      sortDescFirst: true,
      cell: ({ row }) => formatInt(row.original.game_ticks),
    }),
    col.accessor(r => r.ended_by ?? '', {
      id: 'ended',
      header: 'Ended',
      meta: { minWidth: 920 },
      cell: ({ row }) => endedWord(row.original.ended_by),
    }),
    col.accessor('id', {
      header: 'Run',
      meta: { minWidth: 1240 },
      cell: ({ getValue }) => (
        <Link
          to="/runs/$runId"
          params={{ runId: getValue() }}
          className="font-mono text-xs text-muted underline-offset-4 hover:text-foreground hover:underline"
          onClick={event => event.stopPropagation()}
        >
          {getValue()}
        </Link>
      ),
    }),
  ] as ColumnDef<Row, unknown>[];
}
