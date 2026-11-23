import { useMemo } from 'react';
import { Tip } from '@/components/bits';
import { BrainIcon } from 'lucide-react';
import { getRouteApi, Link, useNavigate } from '@tanstack/react-router';
import { useSuspenseQuery } from '@tanstack/react-query';
import { createColumnHelper, type ColumnDef } from '@tanstack/react-table';
import { X } from 'lucide-react';
import { DataTable } from '@/components/DataTable';
import { RunStory } from '@/components/RunStory';
import { FacetFilter, type FacetOption as Option } from '@/components/FacetFilter';
import { FiltersFold } from '@/components/PairingFilters';
import { PageSection, PageToolbar } from '@/components/page';
import { BrandMark, EvalMark, VariantLabel } from '@/components/marks';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { indexQuery } from '@/data/queries';
import type { Eval, Run } from '@/data/types';
import { outcomeWord } from '@/lib/evals';
import { capitalize, formatClock, formatCost, formatInt, MISSING } from '@/lib/format';
import { endedWord, resultText, resultValue } from '@/lib/runResult';
import { useDocumentTitle, useScope, useSearchUpdate } from '@/lib/search';
import { agentInfo, compareThinking, levelName, modelInfo, thinkingTitle, variantKey, vendorOf } from '@/lib/series';
import { cn } from '@/lib/utils';

const route = getRouteApi('/runs/');
const PAGE_SIZE = 50;

type Outcome = 'finished' | 'not_finished' | 'scored';

const OUTCOME_VALUE = { Finished: 'finished', 'Not finished': 'not_finished', Scored: 'scored' } as const;
const outcomeValue = (r: Run): Outcome => OUTCOME_VALUE[outcomeWord(r)];

const startedFormat = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'UTC' });

export interface Row extends Run {
  e: Eval | undefined;
}

/** The filters, each a URL list; a run passes a filter when the list is empty or holds the run's value. */
const FACETS = ['eval', 'model', 'thinking', 'agent', 'vendor', 'outcome', 'batch'] as const;
type Facet = (typeof FACETS)[number];

const facetValue: Record<Facet, (r: Run) => string> = {
  eval: r => r.eval,
  model: r => r.model,
  thinking: r => r.thinking,
  agent: r => r.agent,
  vendor: r => vendorOf(r.model).id,
  outcome: outcomeValue,
  batch: r => r.batch,
};

const col = createColumnHelper<Row>();

/** The best value the run held; a filled or hollow dot says whether it reached the eval's target. */
function ResultCell({ run, e }: { run: Run; e: Eval | undefined }) {
  const value = formatInt(resultValue(run));
  const text = resultText(run, e);
  const word = outcomeWord(run);
  return (
    <Tip content={[e && `${value} ${e.measure.toLowerCase()}`, word !== 'Scored' && word].filter(Boolean).join(', ')}>
    <span className="inline-flex items-center gap-1.5">
      {word !== 'Scored' && (
        <span aria-label={word} role="img" className={cn('size-2 shrink-0 rounded-full', word === 'Finished' ? 'bg-success' : 'border-2 border-destructive')} />
      )}
      {text}
    </span>
    </Tip>
  );
}

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
                  <span className="@max-5xl/runs:sr-only">{String(getValue())}</span>
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
            {!oneEval && <EvalMark evalId={row.original.eval} size={16} title={row.original.e?.title ?? row.original.eval} className="md:hidden" />}
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
      cell: ({ row }) => (row.original.metrics.wall_seconds == null ? MISSING : formatClock(row.original.metrics.wall_seconds)),
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
          className="font-mono text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
          onClick={event => event.stopPropagation()}
        >
          {getValue()}
        </Link>
      ),
    }),
  ] as ColumnDef<Row, unknown>[];
}

export function RunsPage() {
  useDocumentTitle('Runs');
  const search = route.useSearch();
  const navigate = useNavigate();
  const { data } = useSuspenseQuery(indexQuery);
  const scope = useScope();
  const setSearch = useSearchUpdate<typeof search & typeof scope>();

  const picks: Record<Facet, string[]> = { ...scope, eval: search.eval, outcome: search.outcome, batch: search.batch };
  const query = search.q?.trim().toLowerCase() ?? '';
  const evalById = useMemo(() => new Map(data.evals.map(e => [e.id, e])), [data]);

  /** Runs matching the search text and every filter but `skip` (for that filter's counts). */
  const matching = (skip?: Facet) =>
    data.runs.filter(
      r =>
        FACETS.every(f => f === skip || picks[f].length === 0 || picks[f].includes(facetValue[f](r))) &&
        (!query ||
          [r.id, r.batch, evalById.get(r.eval)?.title ?? r.eval, modelInfo(r.model).name, agentInfo(r.agent, r.agent_name).name].some(s =>
            s.toLowerCase().includes(query)
          ))
    );
  const counts = (f: Facet) => {
    const out = new Map<string, number>();
    for (const r of matching(f)) out.set(facetValue[f](r), (out.get(facetValue[f](r)) ?? 0) + 1);
    return out;
  };
  const rows: Row[] = matching().map(r => ({ ...r, e: evalById.get(r.eval) }));

  const uniq = (make: (r: Run) => Option) =>
    [...new Map(data.runs.map(r => [make(r).value, make(r)])).values()].sort((a, b) => a.label.localeCompare(b.label));
  const options: Record<Facet, Option[]> = {
    eval: data.evals.map(e => ({ value: e.id, label: e.title, mark: <EvalMark evalId={e.id} size={16} title="" /> })),
    model: uniq(r => ({ value: r.model, label: modelInfo(r.model).name, mark: <BrandMark slug={modelInfo(r.model).vendor.slug} size={16} /> })),
    thinking: uniq(r => ({ value: r.thinking, label: levelName(r.thinking), mark: <BrainIcon aria-label={thinkingTitle(r.thinking)} /> }))
      .filter(o => o.value)
      .sort((a, b) => compareThinking(a.value, b.value)),
    agent: uniq(r => ({ value: r.agent, label: agentInfo(r.agent, r.agent_name).name, mark: <BrandMark slug={agentInfo(r.agent, r.agent_name).slug} size={16} /> })),
    vendor: uniq(r => ({ value: vendorOf(r.model).id, label: vendorOf(r.model).name, mark: <BrandMark slug={vendorOf(r.model).slug} size={16} /> })),
    outcome: (['finished', 'not_finished', 'scored'] as const).map(v => ({ value: v, label: capitalize(v.replace('_', ' ')) })),
    batch: uniq(r => ({ value: r.batch, label: r.batch })),
  };
  const titles: Record<Facet, string> = { eval: 'Eval', model: 'Model', thinking: 'Thinking', agent: 'Harness', vendor: 'Vendor', outcome: 'Outcome', batch: 'Batch' };
  // Vendor narrows the same way Model does, so it shows only when a link brought it in
  const shown = FACETS.filter(f => f !== 'vendor' || picks.vendor.length > 0);

  const oneEval = search.eval.length === 1 ? evalById.get(search.eval[0]) : undefined;
  const columns = useMemo(() => runColumns(oneEval), [oneEval]);

  const filtered = Boolean(query) || FACETS.some(f => picks[f].length > 0);
  const reset = () => setSearch({ q: undefined, ...Object.fromEntries(FACETS.map(f => [f, []])) }, { resetPage: true });
  const noun = (n: number) => (n === 1 ? 'run' : 'runs');

  return (
    <>
      <PageToolbar label="Filters">
        <Input
          type="search"
          aria-label="Search runs"
          placeholder="Search runs"
          className="w-36 sm:w-48"
          value={search.q ?? ''}
          onChange={event => setSearch({ q: event.target.value || undefined }, { resetPage: true })}
        />
        <FiltersFold active={FACETS.filter(f => picks[f].length > 0).length}>
          {shown.map(f => (
            <FacetFilter
              key={f}
              title={titles[f]}
              options={options[f]}
              selected={picks[f]}
              counts={counts(f)}
              onChange={values => setSearch({ [f]: values } as Partial<Record<Facet, string[]>>, { resetPage: true })}
            />
          ))}
        </FiltersFold>
        {filtered && (
          <Button variant="ghost" onClick={reset}>
            Reset
            <X />
          </Button>
        )}
      </PageToolbar>

      <PageSection>
        <div className="@container/runs">
          <DataTable
            data={rows}
            columns={columns}
            getRowId={r => r.id}
            hoverId={variantKey}
            sort={search.sort}
            onSortChange={sort => setSearch({ sort }, { resetPage: true })}
            onRowClick={r => navigate({ to: '/runs/$runId', params: { runId: r.id } })}
            page={search.page}
            pageSize={PAGE_SIZE}
            onPageChange={page => setSearch({ page })}
            footer={
              rows.length === 0
                ? undefined
                : filtered
                ? `${formatInt(rows.length)} of ${formatInt(data.runs.length)} ${noun(data.runs.length)}`
                : `${formatInt(rows.length)} ${noun(rows.length)}`
            }
            empty={
              data.runs.length === 0 ? (
                'No runs yet.'
              ) : (
                <span className="inline-flex flex-col items-center gap-3">
                  No runs match these filters.
                  <Button variant="outline" onClick={reset}>
                    Reset filters
                  </Button>
                </span>
              )
            }
          />
        </div>
      </PageSection>
    </>
  );
}
