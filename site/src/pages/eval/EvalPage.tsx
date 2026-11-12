import { useMemo, type ReactNode } from 'react';
import clsx from 'clsx';
import { getRouteApi, Link, useNavigate } from '@tanstack/react-router';
import { useSuspenseQuery } from '@tanstack/react-query';
import { createColumnHelper, type ColumnDef } from '@tanstack/react-table';
import { Card } from '@/components/Card';
import { DataTable } from '@/components/DataTable';
import { AgentLabel, Empty, EvalSprites, ModelLabel, Outcome, PageTitle, VariantLabel, linkClassName } from '@/components/bits';
import { indexQuery } from '@/data/queries';
import type { Eval, Run } from '@/data/types';
import { budgetMinutes, evalArt, hasTarget } from '@/lib/evals';
import { capitalize, formatCost, formatDecimal, formatInt, formatPercent, formatSeconds } from '@/lib/format';
import { useDocumentTitle } from '@/lib/search';
import { byVariant, type VariantStats } from '@/lib/stats';
import { variantOf } from '@/lib/series';
import { AttemptsChart, Pareto, RunScatter, SuccessCdf, TimeSplit, ValueStrip } from './charts';

const route = getRouteApi('/evals/$evalId');
const PAGE_SIZE = 25;

const vcol = createColumnHelper<VariantStats>();

function variantColumns(e: Eval): ColumnDef<VariantStats, unknown>[] {
  const target = hasTarget(e);
  const measure = evalArt(e.id).measure;
  const cols = [
    vcol.accessor(v => v.variant.model, { id: 'model', header: 'Model', cell: ({ getValue }) => <ModelLabel model={getValue()} /> }),
    vcol.accessor(v => v.variant.agent, {
      id: 'agent',
      header: 'Agent',
      cell: ({ row }) => <AgentLabel agent={row.original.variant.agent} fallback={row.original.runs[0]?.agent_name} />,
    }),
    vcol.accessor('n', { header: 'Runs', meta: { numeric: true } }),
    ...(target
      ? [
          vcol.accessor('finished', {
            header: 'Finished',
            meta: { numeric: true },
            cell: ({ row }) => `${row.original.finished} of ${row.original.scored}`,
          }),
          vcol.accessor(v => v.finishRate ?? -1, {
            id: 'finishRate',
            header: 'Finish rate',
            meta: { numeric: true },
            cell: ({ row }) => formatPercent(row.original.finishRate),
          }),
          vcol.accessor(v => v.medianTicks ?? Infinity, {
            id: 'ticks',
            header: 'Ticks to finish',
            meta: { numeric: true },
            cell: ({ row }) => formatInt(row.original.medianTicks),
          }),
          vcol.accessor(v => v.medianSeconds ?? Infinity, {
            id: 'seconds',
            header: 'Seconds to finish',
            meta: { numeric: true },
            cell: ({ row }) => formatSeconds(row.original.medianSeconds),
          }),
        ]
      : [
          vcol.accessor(v => v.medianScore ?? -1, {
            id: 'value',
            header: measure,
            meta: { numeric: true },
            cell: ({ row }) => formatInt(row.original.medianScore),
          }),
        ]),
    vcol.accessor(v => v.medianCost ?? Infinity, {
      id: 'cost',
      header: 'Cost per run',
      meta: { numeric: true },
      cell: ({ row }) => formatCost(row.original.medianCost),
    }),
    vcol.accessor(v => v.medianCalls ?? 0, {
      id: 'calls',
      header: 'Model calls',
      meta: { numeric: true },
      cell: ({ row }) => formatInt(row.original.medianCalls),
    }),
    vcol.accessor(v => v.medianOutputTokens ?? 0, {
      id: 'outputTokens',
      header: 'Output tokens',
      meta: { numeric: true },
      cell: ({ row }) => formatInt(row.original.medianOutputTokens),
    }),
    vcol.accessor(v => v.medianTps ?? 0, {
      id: 'tps',
      header: 'Output tok/s',
      meta: { numeric: true },
      cell: ({ row }) => formatDecimal(row.original.medianTps),
    }),
    vcol.accessor(v => v.waitShare ?? 0, {
      id: 'wait',
      header: 'Waiting on model',
      meta: { numeric: true },
      cell: ({ row }) => formatPercent(row.original.waitShare),
    }),
  ];
  return cols as ColumnDef<VariantStats, unknown>[];
}

const rcol = createColumnHelper<Run>();

function runColumns(e: Eval, withScreenshots: boolean): ColumnDef<Run, unknown>[] {
  const target = hasTarget(e);
  const cols = [
    ...(withScreenshots
      ? [
          rcol.display({
            id: 'screenshot',
            header: 'Screenshot',
            cell: ({ row }) =>
              row.original.screenshot ? (
                <img
                  src={`/data/${row.original.screenshot}`}
                  alt=""
                  loading="lazy"
                  className="h-9 w-16 rounded-xs object-cover outline -outline-offset-1 outline-border"
                />
              ) : null,
          }),
        ]
      : []),
    rcol.accessor(r => variantOf(r).name, { id: 'variant', header: 'Variant', cell: ({ row }) => <VariantLabel run={row.original} /> }),
    rcol.accessor('epoch', { header: 'Epoch', meta: { numeric: true } }),
    ...(target
      ? [
          rcol.accessor(r => (r.success ? 1 : 0), { id: 'outcome', header: 'Outcome', cell: ({ row }) => <Outcome run={row.original} /> }),
          rcol.accessor(r => r.ticks ?? Infinity, {
            id: 'ticks',
            header: 'Ticks to finish',
            meta: { numeric: true },
            cell: ({ row }) => formatInt(row.original.ticks),
          }),
          rcol.accessor(r => r.seconds ?? Infinity, {
            id: 'seconds',
            header: 'Seconds to finish',
            meta: { numeric: true },
            cell: ({ row }) => formatSeconds(row.original.seconds),
          }),
        ]
      : [
          rcol.accessor(r => r.final_value ?? r.score ?? -1, {
            id: 'value',
            header: evalArt(e.id).measure,
            meta: { numeric: true },
            cell: ({ row }) => formatInt(row.original.final_value ?? row.original.score),
          }),
        ]),
    rcol.accessor(r => r.cost ?? Infinity, {
      id: 'cost',
      header: 'Cost',
      meta: { numeric: true },
      cell: ({ row }) => formatCost(row.original.cost),
    }),
    rcol.accessor('model_calls', { header: 'Model calls', meta: { numeric: true } }),
    rcol.accessor(r => r.ended_by ?? '', { id: 'ended', header: 'Ended by', cell: ({ row }) => capitalize(row.original.ended_by) }),
    rcol.accessor('id', {
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
  ];
  return cols as ColumnDef<Run, unknown>[];
}

function Setup({ e }: { e: Eval }) {
  const rows: [string, ReactNode][] = [
    ['Budget', `${formatInt(e.budget_ticks)} ticks`],
    ['At the tick rate', `${formatDecimal(budgetMinutes(e))} min`],
    ['Tick length', `${formatInt(e.tick_ms)} ms`],
    ['Attempts', formatInt(e.attempts)],
    [
      e.accounts.length === 1 ? 'Account' : 'Accounts',
      <span className="flex flex-wrap gap-x-2 font-mono text-xs/6">
        {e.accounts.map(a => (
          <span key={a}>{a}</span>
        ))}
      </span>,
    ],
    ['Target', e.target == null ? 'None, scored by amount' : `${evalArt(e.id).measure} ${formatInt(e.target)}`],
    ['Task file', <span className="font-mono text-xs/6 break-all">{e.task_file}</span>],
  ];
  return (
    <dl className="flex flex-wrap gap-x-8 gap-y-3">
      {rows.map(([term, value]) => (
        <div key={term} className="min-w-0">
          <dt className="text-xs/5 text-muted">{term}</dt>
          <dd className="text-sm/6 text-foreground tabular-nums">{value}</dd>
        </div>
      ))}
    </dl>
  );
}

export function EvalPage() {
  const { evalId } = route.useParams();
  const { page } = route.useSearch();
  const navigate = useNavigate();
  const { data } = useSuspenseQuery(indexQuery);
  const e = data.evals.find(x => x.id === evalId);
  useDocumentTitle(e?.title ?? evalId);

  const runs = useMemo(() => data.runs.filter(r => r.eval === evalId), [data, evalId]);
  const variants = useMemo(() => byVariant(runs), [runs]);
  const withScreenshots = runs.some(r => r.screenshot);
  const vColumns = useMemo(() => (e ? variantColumns(e) : []), [e]);
  const rColumns = useMemo(() => (e ? runColumns(e, withScreenshots) : []), [e, withScreenshots]);

  if (!e) {
    return (
      <div className="flex flex-col gap-6">
        <PageTitle>{evalId}</PageTitle>
        <Empty>No eval with this id has runs.</Empty>
      </div>
    );
  }
  const target = hasTarget(e);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center gap-3">
        <EvalSprites evalId={e.id} size="lg" />
        <PageTitle>{e.title}</PageTitle>
      </div>

      <Card title="Goal">
        <div className="flex flex-col gap-5">
          <blockquote className="max-w-4xl border-l-2 border-primary-40 pl-4 text-base/7 whitespace-pre-wrap text-foreground">
            {e.goal}
          </blockquote>
          <Setup e={e} />
        </div>
      </Card>

      <Card
        title="Variants"
        subtitle={target ? 'Medians per run; ticks and seconds over finished runs' : 'Medians per run'}
        flush
      >
        <DataTable data={variants} columns={vColumns} getRowId={v => v.variant.key} />
      </Card>

      {runs.length > 0 && (
        <div className="grid gap-6 xl:grid-cols-2">
          {target ? (
            <>
              <div className="min-w-0 xl:col-span-2">
                <SuccessCdf e={e} variants={variants} />
              </div>
              <Pareto variants={variants} />
              <RunScatter e={e} runs={runs} />
              <div className={clsx('min-w-0', e.attempts <= 1 && 'xl:col-span-2')}>
                <TimeSplit variants={variants} />
              </div>
              {e.attempts > 1 && <AttemptsChart e={e} variants={variants} />}
            </>
          ) : (
            <>
              <ValueStrip e={e} variants={variants} />
              <TimeSplit variants={variants} />
              {runs.some(r => (r.cost ?? 0) > 0) && (
                <div className="min-w-0 xl:col-span-2">
                  <RunScatter e={e} runs={runs} />
                </div>
              )}
            </>
          )}
        </div>
      )}

      <Card title="Runs" flush>
        <DataTable
          data={runs}
          columns={rColumns}
          getRowId={r => r.id}
          initialSorting={[{ id: 'variant', desc: false }]}
          onRowClick={r => navigate({ to: '/runs/$runId', params: { runId: r.id } })}
          paging={{
            page: (page ?? 1) - 1,
            pageSize: PAGE_SIZE,
            onPage: p => navigate({ to: '.', search: { page: p > 0 ? p + 1 : undefined }, replace: false, resetScroll: false }),
          }}
          empty={<Empty>No runs yet.</Empty>}
        />
      </Card>
    </div>
  );
}
