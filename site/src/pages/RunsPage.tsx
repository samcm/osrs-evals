import { useMemo } from 'react';
import { getRouteApi, Link, useNavigate } from '@tanstack/react-router';
import { useSuspenseQuery } from '@tanstack/react-query';
import { createColumnHelper, type ColumnDef, type SortingState } from '@tanstack/react-table';
import { Card } from '@/components/Card';
import { DataTable } from '@/components/DataTable';
import { AgentLabel, Empty, ModelLabel, Outcome, PageTitle, linkClassName } from '@/components/bits';
import { indexQuery } from '@/data/queries';
import type { Run } from '@/data/types';
import { outcomeWord } from '@/lib/evals';
import { capitalize, formatCost, formatDate, formatInt, formatSeconds } from '@/lib/format';
import { useDocumentTitle, type RunsSearch } from '@/lib/search';
import { agentName, modelName } from '@/lib/series';

const route = getRouteApi('/runs/');
const PAGE_SIZE = 50;

const OUTCOMES = [
  { value: 'finished', label: 'Finished' },
  { value: 'not_finished', label: 'Not finished' },
  { value: 'scored', label: 'Scored' },
];

const outcomeValue = (r: Run): string => ({ Finished: 'finished', 'Not finished': 'not_finished', Scored: 'scored' })[outcomeWord(r)];

const col = createColumnHelper<Run & { evalTitle: string }>();

function Select({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string | undefined;
  options: { value: string; label: string }[];
  onChange: (value: string | undefined) => void;
}) {
  return (
    <label className="flex min-w-0 flex-col gap-1">
      <span className="text-xs font-medium text-muted">{label}</span>
      <select
        value={value ?? ''}
        onChange={event => onChange(event.target.value || undefined)}
        className="h-8 w-full min-w-0 rounded-sm bg-surface px-2 text-sm text-foreground outline -outline-offset-1 outline-border focus-visible:outline-2 focus-visible:outline-primary"
      >
        <option value="">All</option>
        {options.map(o => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}

export function RunsPage() {
  useDocumentTitle('Runs');
  const search = route.useSearch();
  const navigate = useNavigate();
  const { data } = useSuspenseQuery(indexQuery);

  const setSearch = (patch: Partial<RunsSearch>): void => {
    navigate({ to: '/runs', search: prev => ({ ...prev, ...patch }), replace: true, resetScroll: false });
  };

  const titles = useMemo(() => new Map(data.evals.map(e => [e.id, e.title])), [data]);
  const rows = useMemo(
    () =>
      data.runs
        .filter(
          r =>
            (!search.eval || r.eval === search.eval) &&
            (!search.model || r.model === search.model) &&
            (!search.agent || r.agent === search.agent) &&
            (!search.outcome || outcomeValue(r) === search.outcome)
        )
        .map(r => ({ ...r, evalTitle: titles.get(r.eval) ?? r.eval })),
    [data, search.eval, search.model, search.agent, search.outcome, titles]
  );

  const models = [...new Set(data.runs.map(r => r.model))].map(m => ({ value: m, label: modelName(m) })).sort((a, b) => a.label.localeCompare(b.label));
  const agents = [...new Map(data.runs.map(r => [r.agent, { value: r.agent, label: agentName(r.agent, r.agent_name) }])).values()].sort((a, b) =>
    a.label.localeCompare(b.label)
  );

  const sorting: SortingState = search.sort
    ? [{ id: search.sort.replace(/^-/, ''), desc: search.sort.startsWith('-') }]
    : [{ id: 'started', desc: true }];

  const columns = useMemo(
    () =>
      [
        col.accessor('id', {
          header: 'Run',
          cell: ({ getValue }) => (
            <Link
              to="/runs/$runId"
              params={{ runId: getValue() }}
              className={`${linkClassName} font-mono text-xs`}
              onClick={event => event.stopPropagation()}
            >
              {getValue()}
            </Link>
          ),
        }),
        col.accessor('evalTitle', { id: 'eval', header: 'Eval' }),
        col.accessor(r => modelName(r.model), { id: 'model', header: 'Model', cell: ({ row }) => <ModelLabel model={row.original.model} /> }),
        col.accessor(r => agentName(r.agent, r.agent_name), {
          id: 'agent',
          header: 'Agent',
          cell: ({ row }) => <AgentLabel agent={row.original.agent} fallback={row.original.agent_name} />,
        }),
        col.accessor('epoch', { header: 'Epoch', meta: { numeric: true } }),
        col.accessor(r => outcomeValue(r), { id: 'outcome', header: 'Outcome', cell: ({ row }) => <Outcome run={row.original} /> }),
        col.accessor(r => r.ticks ?? Infinity, {
          id: 'ticks',
          header: 'Ticks to finish',
          meta: { numeric: true },
          cell: ({ row }) => formatInt(row.original.ticks),
        }),
        col.accessor(r => r.seconds ?? Infinity, {
          id: 'seconds',
          header: 'Seconds to finish',
          meta: { numeric: true },
          cell: ({ row }) => formatSeconds(row.original.seconds),
        }),
        col.accessor(r => r.cost ?? Infinity, { id: 'cost', header: 'Cost', meta: { numeric: true }, cell: ({ row }) => formatCost(row.original.cost) }),
        col.accessor('model_calls', { id: 'calls', header: 'Model calls', meta: { numeric: true } }),
        col.accessor(r => r.ended_by ?? '', { id: 'ended', header: 'Ended by', cell: ({ row }) => capitalize(row.original.ended_by) }),
        col.accessor('started', { header: 'Started', cell: ({ getValue }) => `${formatDate(getValue())} UTC` }),
      ] as ColumnDef<Run & { evalTitle: string }, unknown>[],
    []
  );

  const filtered = Boolean(search.eval || search.model || search.agent || search.outcome);

  return (
    <div className="flex flex-col gap-6">
      <PageTitle>Runs</PageTitle>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:max-w-4xl">
        <Select
          label="Eval"
          value={search.eval}
          options={data.evals.map(e => ({ value: e.id, label: e.title }))}
          onChange={v => setSearch({ eval: v, page: undefined })}
        />
        <Select label="Model" value={search.model} options={models} onChange={v => setSearch({ model: v, page: undefined })} />
        <Select label="Agent" value={search.agent} options={agents} onChange={v => setSearch({ agent: v, page: undefined })} />
        <Select label="Outcome" value={search.outcome} options={OUTCOMES} onChange={v => setSearch({ outcome: v, page: undefined })} />
      </div>

      <Card
        title={rows.length === 1 ? '1 run' : `${formatInt(rows.length)} runs`}
        actions={
          filtered ? (
            <button
              type="button"
              onClick={() => navigate({ to: '/runs', search: {} })}
              className="h-7 rounded-sm px-2.5 text-xs font-medium text-muted outline -outline-offset-1 outline-border transition-colors hover:bg-background hover:text-foreground"
            >
              Clear filters
            </button>
          ) : undefined
        }
        flush
      >
        <DataTable
          data={rows}
          columns={columns}
          getRowId={r => r.id}
          sorting={sorting}
          onSortingChange={next => {
            const s = next[0];
            setSearch({ sort: s ? `${s.desc ? '-' : ''}${s.id}` : undefined, page: undefined });
          }}
          onRowClick={r => navigate({ to: '/runs/$runId', params: { runId: r.id } })}
          paging={{ page: (search.page ?? 1) - 1, pageSize: PAGE_SIZE, onPage: p => setSearch({ page: p > 0 ? p + 1 : undefined }) }}
          empty={<Empty>No runs match these filters.</Empty>}
        />
      </Card>
    </div>
  );
}
