import { useMemo } from 'react';
import { getRouteApi, Link, useNavigate } from '@tanstack/react-router';
import { useSuspenseQuery } from '@tanstack/react-query';
import { createColumnHelper, type ColumnDef } from '@tanstack/react-table';
import clsx from 'clsx';
import { Card } from '@/components/Card';
import { DataTable } from '@/components/DataTable';
import { EvalPicker } from '@/components/EvalPicker';
import { SelectField } from '@/components/SelectField';
import { Empty, PageTitle, linkClassName } from '@/components/bits';
import { EvalMark } from '@/components/marks';
import { VariantShort } from '@/components/VariantShort';
import { indexQuery } from '@/data/queries';
import type { Eval, Run } from '@/data/types';
import { outcomeWord } from '@/lib/evals';
import { capitalize, formatClock, formatCost, formatInt, MISSING } from '@/lib/format';
import { resultValue } from '@/lib/runResult';
import { inScope, useDocumentTitle, useScope, useScopeUpdate, useSearchUpdate } from '@/lib/search';
import { agentInfo, modelInfo, variantOf } from '@/lib/series';

const route = getRouteApi('/runs/');
const PAGE_SIZE = 50;

type OutcomeFilter = 'finished' | 'not_finished' | 'scored';

const OUTCOMES: { value: OutcomeFilter; label: string }[] = [
  { value: 'finished', label: 'Finished' },
  { value: 'not_finished', label: 'Not finished' },
  { value: 'scored', label: 'Scored' },
];

const outcomeValue = (r: Run): OutcomeFilter =>
  (({ Finished: 'finished', 'Not finished': 'not_finished', Scored: 'scored' }) as const)[outcomeWord(r)];

/** Who ended the run, in a word: the agent, the budget, or reaching the target. */
const endedBy = (reason: string | null): string =>
  (({ 'agent finished': 'Agent', done: 'Target', budget: 'Budget' }) as Record<string, string>)[reason ?? ''] ?? capitalize(reason);

const startedFormat = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'UTC' });

interface Row extends Run {
  e: Eval | undefined;
}

const col = createColumnHelper<Row>();

/** The best value the run held, with the eval's measure; a finished or unfinished mark for evals with a target. */
function ResultCell({ run, e }: { run: Run; e: Eval | undefined }) {
  const value = resultValue(run);
  const word = outcomeWord(run);
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
      {word !== 'Scored' && (
        <span
          role="img"
          aria-label={word}
          title={word}
          className={clsx('size-2 shrink-0 rounded-full', word === 'Finished' ? 'bg-success' : 'border-2 border-danger')}
        />
      )}
      <span className="font-medium tabular-nums">{formatInt(value)}</span>
      {e && <span className="text-xs text-muted">{e.measure.toLowerCase()}</span>}
    </span>
  );
}

export function RunsPage() {
  useDocumentTitle('Runs');
  const search = route.useSearch();
  const navigate = useNavigate();
  const { data } = useSuspenseQuery(indexQuery);
  const scope = useScope();
  const setScope = useScopeUpdate();
  const setSearch = useSearchUpdate<typeof search>();

  const evalById = useMemo(() => new Map(data.evals.map(e => [e.id, e])), [data]);
  const rows = useMemo<Row[]>(
    () =>
      data.runs
        .filter(
          r =>
            inScope(r, scope) &&
            (!search.eval || r.eval === search.eval) &&
            (!search.batch || r.batch === search.batch) &&
            (!search.outcome || outcomeValue(r) === search.outcome)
        )
        .map(r => ({ ...r, e: evalById.get(r.eval) })),
    [data, scope, search.eval, search.batch, search.outcome, evalById]
  );

  const models = [...new Set(data.runs.map(r => r.model))]
    .map(m => ({ value: m, label: modelInfo(m).name }))
    .sort((a, b) => a.label.localeCompare(b.label));
  const agents = [...new Map(data.runs.map(r => [r.agent, { value: r.agent, label: agentInfo(r.agent, r.agent_name).name }])).values()].sort((a, b) =>
    a.label.localeCompare(b.label)
  );
  const batches = [...new Set(data.runs.map(r => r.batch))].sort().map(b => ({ value: b, label: b }));

  const columns = useMemo(
    () =>
      [
        col.accessor(r => r.e?.title ?? r.eval, {
          id: 'eval',
          header: 'Eval',
          cell: ({ row }) => (
            <span className="flex items-center gap-2">
              {row.original.screenshot ? (
                <img
                  src={`/data/${row.original.screenshot}`}
                  alt=""
                  loading="lazy"
                  width={48}
                  height={27}
                  className="h-7 w-12 max-w-none rounded-xs bg-background object-cover"
                />
              ) : (
                <span className="block h-7 w-12 rounded-xs bg-background" />
              )}
              <EvalMark evalId={row.original.eval} size={24} title={row.original.e?.title} />
            </span>
          ),
        }),
        col.accessor(r => variantOf(r).name, {
          id: 'variant',
          header: 'Variant',
          cell: ({ row }) => <VariantShort variant={variantOf(row.original)} />,
        }),
        col.accessor(r => (r.success ? 1e9 : 0) + (resultValue(r) ?? -1), {
          id: 'result',
          header: 'Result',
          sortDescFirst: true,
          cell: ({ row }) => <ResultCell run={row.original} e={row.original.e} />,
        }),
        col.accessor(r => r.cost ?? -1, {
          id: 'cost',
          header: 'Cost',
          meta: { numeric: true },
          sortDescFirst: true,
          cell: ({ row }) => formatCost(row.original.cost),
        }),
        col.accessor(r => r.game_ticks ?? -1, {
          id: 'ticks',
          header: 'Game ticks',
          meta: { numeric: true },
          sortDescFirst: true,
          cell: ({ row }) => formatInt(row.original.game_ticks),
        }),
        col.accessor(r => r.metrics.wall_seconds ?? -1, {
          id: 'wall',
          header: 'Wall time',
          meta: { numeric: true },
          sortDescFirst: true,
          cell: ({ row }) => (row.original.metrics.wall_seconds == null ? MISSING : formatClock(row.original.metrics.wall_seconds)),
        }),
        col.accessor(r => r.ended_by ?? '', { id: 'ended', header: 'Ended by', cell: ({ row }) => endedBy(row.original.ended_by) }),
        col.accessor(r => r.sample_started ?? r.started, {
          id: 'started',
          header: 'Started (UTC)',
          sortDescFirst: true,
          cell: ({ getValue }) => {
            const date = new Date(getValue());
            return Number.isNaN(date.getTime()) ? MISSING : startedFormat.format(date);
          },
        }),
        col.accessor('id', {
          header: 'Run',
          cell: ({ getValue }) => (
            <Link
              to="/runs/$runId"
              params={{ runId: getValue() }}
              className={clsx(linkClassName, 'font-mono text-xs text-muted')}
              onClick={event => event.stopPropagation()}
            >
              {getValue()}
            </Link>
          ),
        }),
      ] as ColumnDef<Row, unknown>[],
    []
  );

  const filtered = Boolean(search.eval || search.batch || search.outcome || scope.model.length || scope.agent.length || scope.vendor.length);

  return (
    <div className="flex flex-col gap-6">
      <PageTitle>Runs</PageTitle>

      <div className="flex flex-col gap-3">
        <EvalPicker evals={data.evals} value={search.eval} allLabel="All evals" onChange={v => setSearch({ eval: v }, { resetPage: true })} />
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:max-w-4xl">
          <SelectField label="Model" allLabel="All" value={scope.model[0]} options={models} onChange={v => setScope({ model: v ? [v] : [] })} />
          <SelectField label="Agent" allLabel="All" value={scope.agent[0]} options={agents} onChange={v => setScope({ agent: v ? [v] : [] })} />
          <SelectField
            label="Outcome"
            allLabel="All"
            value={search.outcome}
            options={OUTCOMES}
            onChange={v => setSearch({ outcome: v as OutcomeFilter | undefined }, { resetPage: true })}
          />
          <SelectField
            label="Batch"
            allLabel="All"
            value={search.batch}
            options={batches}
            onChange={v => setSearch({ batch: v }, { resetPage: true })}
          />
        </div>
      </div>

      <Card
        title={rows.length === 1 ? '1 run' : `${formatInt(rows.length)} runs`}
        actions={
          filtered ? (
            <button
              type="button"
              onClick={() => navigate({ to: '/runs', search: { model: [], agent: [], vendor: [] } as never })}
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
          sort={search.sort}
          onSortChange={sort => setSearch({ sort }, { resetPage: true })}
          onRowClick={r => navigate({ to: '/runs/$runId', params: { runId: r.id } })}
          page={search.page}
          pageSize={PAGE_SIZE}
          onPageChange={page => setSearch({ page })}
          empty={<Empty>No runs match these filters.</Empty>}
        />
      </Card>
    </div>
  );
}
