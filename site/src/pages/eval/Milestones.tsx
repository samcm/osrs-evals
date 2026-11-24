/**
 * The eval's milestones (export.py MILESTONES), in its Milestones tab: one row per milestone in its
 * fixed order, how many of the runs in scope reached it, the median game time they did, and the run
 * that got there first. Runs exported without their accounts' states have no milestones and are
 * left out of the count.
 */

import type { JSX } from 'react';
import { Link } from '@tanstack/react-router';
import { createColumnHelper, type ColumnDef } from '@tanstack/react-table';
import clsx from 'clsx';
import { Empty } from '@/components/bits';
import { DataTable } from '@/components/DataTable';
import { MilestoneLabel, VariantLabel } from '@/components/marks';
import { PageSection } from '@/components/page';
import type { Eval, Milestone, Run } from '@/data/types';
import { formatClock, formatInt, MISSING } from '@/lib/format';
import { median } from '@/lib/stats';

interface Row {
  milestone: Milestone;
  /** The tick each run that reached it did */
  ticks: number[];
  first: { run: Run; tick: number } | null;
}

const col = createColumnHelper<Row>();

export function MilestonesView({ e, runs }: { e: Eval; runs: Run[] }): JSX.Element {
  const told = runs.filter((r): r is Run & { milestones: Record<string, number> } => r.milestones != null);
  const milestones = e.milestones ?? [];
  if (milestones.length === 0) return <Empty>This eval has no milestones.</Empty>;
  if (told.length === 0) return <Empty>These runs were exported without their accounts&apos; states.</Empty>;

  const time = (tick: number): string => formatClock((tick * e.tick_ms) / 1000);
  const rows: Row[] = milestones.map(milestone => {
    let first: Row['first'] = null;
    const ticks: number[] = [];
    for (const run of told) {
      const tick = run.milestones[milestone.id];
      if (tick == null) continue;
      ticks.push(tick);
      if (!first || tick < first.tick) first = { run, tick };
    }
    return { milestone, ticks, first };
  });

  const columns = [
    col.display({
      id: 'milestone',
      header: 'Milestone',
      // A phone wraps long labels, so the count and the time stay in view
      meta: { className: 'max-md:whitespace-normal' },
      cell: ({ row }) => (
        <MilestoneLabel
          milestone={row.original.milestone}
          className={clsx(row.original.ticks.length === 0 && 'text-muted')}
        />
      ),
    }),
    col.display({
      id: 'runs',
      header: 'Runs',
      meta: { numeric: true },
      cell: ({ row }) => {
        const n = row.original.ticks.length;
        return (
          <span className="flex items-center justify-end gap-2">
            <span className="tabular-nums">
              {formatInt(n)}
              <span className="text-muted"> of {formatInt(told.length)}</span>
            </span>
            {/* The share that reached it on lab ProgressBar's track, neutral: the count is the value,
                not a series; a phone keeps the median time in its place. Drawn here because ProgressBar is a
                block with its own label, not a cell's bar */}
            <span aria-hidden className="h-1.5 w-20 overflow-hidden rounded-full bg-border max-md:hidden">
              <span className="block h-full rounded-full bg-muted" style={{ width: `${(n / told.length) * 100}%` }} />
            </span>
          </span>
        );
      },
    }),
    col.display({
      id: 'at',
      header: 'Median time',
      meta: { numeric: true },
      cell: ({ row }) => {
        const at = median(row.original.ticks);
        return at == null ? <span className="text-muted">{MISSING}</span> : time(at);
      },
    }),
    col.display({
      id: 'first',
      header: 'First',
      // A phone keeps the count and the median beside the name
      meta: { minWidth: 560 },
      cell: ({ row }) => {
        const first = row.original.first;
        if (!first) return <span className="text-muted">{MISSING}</span>;
        return (
          <Link
            to="/runs/$runId"
            params={{ runId: first.run.id }}
            search={{} as never}
            className="flex w-fit items-center gap-3 rounded-xs outline-hidden hover:underline focus-visible:outline-2 focus-visible:outline-primary"
          >
            <VariantLabel run={first.run} compact />
            <span className="text-muted tabular-nums">{time(first.tick)}</span>
          </Link>
        );
      },
    }),
  ] as ColumnDef<Row, unknown>[];

  const without = runs.length - told.length;
  return (
    <PageSection
      description={
        without > 0
          ? `${formatInt(without)} ${without === 1 ? 'run was' : 'runs were'} exported without the accounts' states and ${without === 1 ? 'is' : 'are'} left out`
          : undefined
      }
    >
      <DataTable data={rows} columns={columns} getRowId={r => r.milestone.id} />
    </PageSection>
  );
}
