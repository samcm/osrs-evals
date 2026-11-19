import { useMemo } from 'react';
import { Link } from '@tanstack/react-router';
import { useSuspenseQuery } from '@tanstack/react-query';
import { createColumnHelper, type ColumnDef } from '@tanstack/react-table';
import { Card } from '@/components/Card';
import { DataTable } from '@/components/DataTable';
import { PageTitle } from '@/components/bits';
import { AgentLabel, ModelLabel } from '@/components/marks';
import { indexQuery } from '@/data/queries';
import type { Eval, Run } from '@/data/types';
import { hasTarget } from '@/lib/evals';
import { formatCost, formatDecimal, formatInt } from '@/lib/format';
import { useDocumentTitle } from '@/lib/search';
import { agentName, modelName } from '@/lib/series';
import { groupBy, groupStats, type GroupStats } from '@/lib/stats';
import { ResultCell } from './OverviewPage';

interface Row {
  id: string;
  label: string;
  /** For the runs filter */
  filter: { model?: string[]; agent?: string[] };
  stats: GroupStats;
  perEval: Map<string, GroupStats>;
}

function rowsBy(runs: Run[], key: (r: Run) => string, label: (r: Run) => string, filter: (id: string) => Row['filter']): Row[] {
  return [...groupBy(runs, key).entries()]
    .map(([id, list]) => ({
      id,
      label: label(list[0]),
      filter: filter(id),
      stats: groupStats(list),
      perEval: new Map([...groupBy(list, r => r.eval).entries()].map(([e, l]) => [e, groupStats(l)])),
    }))
    .sort((a, b) => a.label.localeCompare(b.label));
}

const col = createColumnHelper<Row>();

function columns(kind: 'model' | 'agent', evals: Eval[]): ColumnDef<Row, unknown>[] {
  return [
    col.accessor('label', {
      header: kind === 'model' ? 'Model' : 'Agent',
      cell: ({ row }) =>
        kind === 'model' ? <ModelLabel model={row.original.id} /> : <AgentLabel agent={row.original.id} fallback={row.original.label} />,
    }),
    col.accessor(r => r.stats.n, {
      id: 'runs',
      header: 'Runs',
      meta: { numeric: true },
      cell: ({ row }) => (
        <Link to="/runs" search={row.original.filter} className="transition-colors hover:text-primary">
          {formatInt(row.original.stats.n)}
        </Link>
      ),
    }),
    col.accessor(r => r.perEval.size, { id: 'evals', header: 'Evals', meta: { numeric: true } }),
    ...evals.map(e =>
      col.accessor(r => (hasTarget(e) ? r.perEval.get(e.id)?.finishRate : r.perEval.get(e.id)?.medianScore) ?? -1, {
        id: `eval-${e.id}`,
        header: e.title,
        meta: { numeric: true },
        cell: ({ row }) => <ResultCell e={e} stats={row.original.perEval.get(e.id)} />,
      })
    ),
    col.accessor(r => r.stats.medianTps ?? -1, {
      id: 'tps',
      header: 'Output tok/s',
      meta: { numeric: true },
      cell: ({ row }) => formatDecimal(row.original.stats.medianTps),
    }),
    col.accessor(r => r.stats.totalCost ?? -1, {
      id: 'cost',
      header: 'Total cost',
      meta: { numeric: true },
      cell: ({ row }) => formatCost(row.original.stats.totalCost),
    }),
  ] as ColumnDef<Row, unknown>[];
}

export function ModelsPage() {
  useDocumentTitle('Models');
  const { data } = useSuspenseQuery(indexQuery);

  const models = useMemo(() => rowsBy(data.runs, r => r.model, r => modelName(r.model), id => ({ model: [id] })), [data]);
  const agents = useMemo(
    () => rowsBy(data.runs, r => r.agent, r => agentName(r.agent, r.agent_name), id => ({ agent: [id] })),
    [data]
  );
  const modelColumns = useMemo(() => columns('model', data.evals), [data.evals]);
  const agentColumns = useMemo(() => columns('agent', data.evals), [data.evals]);

  return (
    <div className="flex flex-col gap-6">
      <PageTitle>Models and agents</PageTitle>
      <Card title="Models" subtitle="Finish rate per eval, or the median value for evals without a target; output tok/s is the median run" flush>
        <DataTable data={models} columns={modelColumns} getRowId={r => r.id} />
      </Card>
      <Card title="Agents" subtitle="Finish rate per eval, or the median value for evals without a target; output tok/s is the median run" flush>
        <DataTable data={agents} columns={agentColumns} getRowId={r => r.id} />
      </Card>
    </div>
  );
}
