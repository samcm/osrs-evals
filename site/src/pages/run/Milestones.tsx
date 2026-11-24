/**
 * The run's milestones card, first over the lanes: its eval's milestones (export.py MILESTONES) in
 * their fixed order, each with the game time the run first reached it, the ones it never reached
 * muted. Clicking a reached one settles the playhead there.
 */

import type { JSX } from 'react';
import { createColumnHelper, type ColumnDef } from '@tanstack/react-table';
import clsx from 'clsx';
import { DataTable } from '@/components/DataTable';
import { MilestoneLabel } from '@/components/marks';
import { PageSection } from '@/components/page';
import type { Milestone } from '@/data/types';
import { formatClock, MISSING } from '@/lib/format';
import { useSettle } from './search';

interface Row {
  milestone: Milestone;
  tick: number | undefined;
}

const col = createColumnHelper<Row>();

export function MilestonesCard({
  milestones,
  reached,
  tickMs,
}: {
  milestones: Milestone[];
  /** The tick each was first reached, by id */
  reached: Record<string, number>;
  tickMs: number;
}): JSX.Element {
  const settle = useSettle();
  const rows = milestones.map(milestone => ({ milestone, tick: reached[milestone.id] }));
  const columns = [
    col.display({
      id: 'milestone',
      header: 'Milestone',
      cell: ({ row }) => (
        <MilestoneLabel
          milestone={row.original.milestone}
          className={clsx(row.original.tick == null && 'text-muted')}
        />
      ),
    }),
    col.display({
      id: 'at',
      header: 'Game time',
      meta: { numeric: true },
      cell: ({ row }) =>
        row.original.tick == null ? (
          <span className="text-muted">{MISSING}</span>
        ) : (
          formatClock((row.original.tick * tickMs) / 1000)
        ),
    }),
  ] as ColumnDef<Row, unknown>[];
  return (
    <PageSection title="Milestones">
      <DataTable
        data={rows}
        columns={columns}
        getRowId={r => r.milestone.id}
        density="compact"
        onRowClick={r => r.tick != null && settle(r.tick)}
        rowClickable={r => r.tick != null}
      />
    </PageSection>
  );
}
