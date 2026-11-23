/**
 * `/runs`: every run, filterable and sortable. The search box and the filters (each a URL list) narrow
 * the table; each filter's counts are the runs its own choice would leave.
 */

import { useMemo, type JSX } from 'react';
import { getRouteApi, useNavigate } from '@tanstack/react-router';
import { useSuspenseQuery } from '@tanstack/react-query';
import { MagnifyingGlassIcon, XMarkIcon } from '@heroicons/react/20/solid';
import { Button } from '@/components/Elements/Button';
import { Input } from '@/components/Forms/Input';
import { DataTable } from '@/components/DataTable';
import { FacetFilter, type FacetOption as Option } from '@/components/FacetFilter';
import { FiltersFold } from '@/components/PairingFilters';
import { PageSection, PageToolbar } from '@/components/page';
import { BrandMark, EvalMark } from '@/components/marks';
import { indexQuery } from '@/data/queries';
import type { Run } from '@/data/types';
import { outcomeWord } from '@/lib/evals';
import { capitalize, formatInt } from '@/lib/format';
import { useDocumentTitle, useScope, useSearchUpdate } from '@/lib/search';
import { agentInfo, compareThinking, levelName, modelInfo, variantKey, vendorOf } from '@/lib/series';
import { runColumns, type Row } from '@/pages/runsTable/columns';

const route = getRouteApi('/runs/');
const PAGE_SIZE = 50;

type Outcome = 'finished' | 'not_finished' | 'scored';

const OUTCOME_VALUE = { Finished: 'finished', 'Not finished': 'not_finished', Scored: 'scored' } as const;
const outcomeValue = (r: Run): Outcome => OUTCOME_VALUE[outcomeWord(r)];

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

export function RunsPage(): JSX.Element {
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
  const matching = (skip?: Facet): Run[] =>
    data.runs.filter(
      r =>
        FACETS.every(f => f === skip || picks[f].length === 0 || picks[f].includes(facetValue[f](r))) &&
        (!query ||
          [
            r.id,
            r.batch,
            evalById.get(r.eval)?.title ?? r.eval,
            modelInfo(r.model).name,
            agentInfo(r.agent, r.agent_name).name,
          ].some(s => s.toLowerCase().includes(query)))
    );
  const counts = (f: Facet): Map<string, number> => {
    const out = new Map<string, number>();
    for (const r of matching(f)) out.set(facetValue[f](r), (out.get(facetValue[f](r)) ?? 0) + 1);
    return out;
  };
  const rows: Row[] = matching().map(r => ({ ...r, e: evalById.get(r.eval) }));

  const uniq = (make: (r: Run) => Option): Option[] =>
    [...new Map(data.runs.map(r => [make(r).value, make(r)])).values()].sort((a, b) => a.label.localeCompare(b.label));
  const options: Record<Facet, Option[]> = {
    eval: data.evals.map(e => ({ value: e.id, label: e.title, mark: <EvalMark evalId={e.id} size={16} title="" /> })),
    model: uniq(r => ({
      value: r.model,
      label: modelInfo(r.model).name,
      mark: <BrandMark slug={modelInfo(r.model).vendor.slug} size={16} />,
    })),
    thinking: uniq(r => ({ value: r.thinking, label: levelName(r.thinking) }))
      .filter(o => o.value)
      .sort((a, b) => compareThinking(a.value, b.value)),
    agent: uniq(r => ({
      value: r.agent,
      label: agentInfo(r.agent, r.agent_name).name,
      mark: <BrandMark slug={agentInfo(r.agent, r.agent_name).slug} size={16} />,
    })),
    vendor: uniq(r => ({
      value: vendorOf(r.model).id,
      label: vendorOf(r.model).name,
      mark: <BrandMark slug={vendorOf(r.model).slug} size={16} />,
    })),
    outcome: (['finished', 'not_finished', 'scored'] as const).map(v => ({
      value: v,
      label: capitalize(v.replace('_', ' ')),
    })),
    batch: uniq(r => ({ value: r.batch, label: r.batch })),
  };
  const titles: Record<Facet, string> = {
    eval: 'Eval',
    model: 'Model',
    thinking: 'Thinking',
    agent: 'Harness',
    vendor: 'Vendor',
    outcome: 'Outcome',
    batch: 'Batch',
  };
  // Vendor narrows the same way Model does, so it shows only when a link brought it in
  const shown = FACETS.filter(f => f !== 'vendor' || picks.vendor.length > 0);

  const oneEval = search.eval.length === 1 ? evalById.get(search.eval[0]) : undefined;
  const columns = useMemo(() => runColumns(oneEval), [oneEval]);

  const filtered = Boolean(query) || FACETS.some(f => picks[f].length > 0);
  const reset = (): void =>
    setSearch({ q: undefined, ...Object.fromEntries(FACETS.map(f => [f, []])) }, { resetPage: true });
  const noun = (n: number): string => (n === 1 ? 'run' : 'runs');

  return (
    <>
      <PageToolbar label="Filters">
        <div className="w-36 sm:w-48">
          <Input size="sm">
            <Input.Leading>
              <MagnifyingGlassIcon />
            </Input.Leading>
            {/* At a Button's and a SelectMenu's height (h-8), so the toolbar's controls line up */}
            <Input.Field
              className="h-8"
              type="search"
              aria-label="Search runs"
              placeholder="Search runs"
              value={search.q ?? ''}
              onChange={event => setSearch({ q: event.target.value || undefined }, { resetPage: true })}
            />
          </Input>
        </div>
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
          <Button variant="blank" size="sm" trailingIcon={<XMarkIcon />} onClick={reset}>
            Reset
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
                  <Button variant="secondary" size="sm" onClick={reset}>
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
