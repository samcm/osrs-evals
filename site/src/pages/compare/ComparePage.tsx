/**
 * `/compare`: how models and harnesses differ on any one measure, cut any way. One toolbar (measure,
 * eval, grouping, scale), then tabs: the measure as every run on a strip chart that is its own
 * ranking (rows best first, each with its median), the tool-call mix, and list prices.
 */

import { useMemo } from 'react';
import { getRouteApi } from '@tanstack/react-router';
import { useSuspenseQuery } from '@tanstack/react-query';
import { createColumnHelper, type ColumnDef } from '@tanstack/react-table';
import { DataTable } from '@/components/DataTable';
import { SelectField } from '@/components/SelectField';
import { Empty, Segmented } from '@/components/bits';
import { EvalMark, ModelLabel } from '@/components/marks';
import { PageHeader, PageSection, PageTabs, PageToolbar } from '@/components/page';
import { indexQuery } from '@/data/queries';
import type { Eval, Price } from '@/data/types';
import { useLegend } from '@/lib/legend';
import { inScope, useDocumentTitle, useScope, useSearchUpdate } from '@/lib/search';
import { modelInfo, vendorOf } from '@/lib/series';
import { median } from '@/lib/stats';
import { StripChart, ToolMixChart, type MixGroup, type RankedGroup } from './charts';
import { groupRuns, type GroupBy } from './groups';
import { METRICS, metricById, metricLabel, type MetricId } from './metrics';
import { compareSearch } from './search';

const route = getRouteApi('/compare');

const TABS = [
  { value: 'measure', label: 'Measure' },
  { value: 'tools', label: 'Tool calls' },
  { value: 'prices', label: 'Prices' },
] as const;

const BY_OPTIONS: { value: GroupBy; label: string }[] = [
  { value: 'model', label: 'Model' },
  { value: 'vendor', label: 'Vendor' },
  { value: 'agent', label: 'Harness' },
  { value: 'variant', label: 'Pairing' },
];

export function ComparePage() {
  useDocumentTitle('Compare');
  const { data } = useSuspenseQuery(indexQuery);
  const search = route.useSearch();
  const update = useSearchUpdate(compareSearch);
  const scope = useScope();
  const legend = useLegend();

  const metric = metricById(search.metric);
  const scoped = useMemo(() => data.runs.filter(r => inScope(r, scope)), [data, scope]);
  const evals = data.evals.filter(e => scoped.some(r => r.eval === e.id));
  // Outcome measures read one eval: the chosen one if the measure applies to it, else the first that fits
  const oneEval = search.tab === 'measure' && Boolean(metric.outcome);
  const choices = oneEval ? evals.filter(e => !metric.applies || metric.applies(e)) : evals;
  const chosen = choices.find(e => e.id === search.eval);
  const evalShown: Eval | undefined = chosen ?? (oneEval ? choices[0] : undefined);
  const runs = useMemo(() => scoped.filter(r => !evalShown || r.eval === evalShown.id), [scoped, evalShown]);

  const log = metric.log && (search.scale ?? metric.scale) === 'log';

  const ranked = useMemo<RankedGroup[]>(() => {
    const groups = groupRuns(runs, search.by)
      .map(g => {
        const points = g.runs
          .map(run => ({ run, value: metric.get(run) }))
          // A log scale has no place for zero
          .filter((p): p is { run: typeof p.run; value: number } => p.value != null && Number.isFinite(p.value) && (!log || p.value > 0));
        return { key: g.key, sample: g.sample, points, total: g.runs.length, median: median(points.map(p => p.value)) ?? NaN };
      })
      .filter(g => g.points.length > 0);
    const dir = metric.better === 'lower' ? 1 : -1;
    return groups.sort((a, b) => dir * (a.median - b.median));
  }, [runs, search.by, metric, log]);

  const mix = useMemo<MixGroup[]>(
    () =>
      groupRuns(runs, search.by)
        .map(g => {
          const counts = new Map<string, number>();
          for (const r of g.runs) for (const [k, n] of Object.entries(r.metrics.tool_mix)) counts.set(k, (counts.get(k) ?? 0) + (n ?? 0));
          return { key: g.key, sample: g.sample, counts, total: [...counts.values()].reduce((a, b) => a + b, 0) };
        })
        .filter(g => g.total > 0)
        .sort((a, b) => a.key.localeCompare(b.key)),
    [runs, search.by]
  );

  const prices = useMemo(
    () =>
      Object.entries(data.prices)
        .filter(
          ([model]) =>
            (scope.model.length === 0 || scope.model.includes(model)) && (scope.vendor.length === 0 || scope.vendor.includes(vendorOf(model).id))
        )
        .sort(([a], [b]) => modelInfo(a).name.localeCompare(modelInfo(b).name))
        .map(([model, price]) => ({ model, ...price })),
    [data, scope]
  );

  const name = metricLabel(metric, evalShown);
  const evalOptions = choices.map(e => ({ value: e.id, label: e.title, mark: <EvalMark evalId={e.id} size={16} title="" /> }));

  return (
    <>
      <PageHeader title="Compare" description="Every run on one measure, grouped by model, vendor, harness or pairing." />
      <PageTabs value={search.tab} tabs={[...TABS]} />

      {search.tab !== 'prices' && (
        <PageToolbar label="Measure, eval and grouping">
          {search.tab === 'measure' && (
            <SelectField
              label="Measure"
              hideLabel
              className="w-full sm:w-64"
              value={metric.id}
              options={METRICS.map(m => ({ value: m.id, label: m.label, group: m.group }))}
              onChange={v => v && update({ metric: v as MetricId, scale: undefined })}
            />
          )}
          <SelectField
            label="Eval"
            hideLabel
            className="w-full sm:w-64"
            value={evalShown?.id}
            allLabel={oneEval ? undefined : 'All evals'}
            options={evalOptions}
            onChange={id => update({ eval: id })}
          />
          <Segmented label="Group by" value={search.by} options={BY_OPTIONS} onChange={by => update({ by })} />
          {search.tab === 'measure' && metric.log && (
            <Segmented
              label="Scale"
              value={log ? 'log' : 'linear'}
              options={[
                { value: 'linear', label: 'Linear' },
                { value: 'log', label: 'Log' },
              ]}
              onChange={scale => update({ scale: scale === metric.scale ? undefined : scale })}
            />
          )}
        </PageToolbar>
      )}

      {search.tab === 'measure' ? (
        <PageSection
          lead
          title={
            <>
              {evalShown && <EvalMark evalId={evalShown.id} size={20} title="" />}
              {name}
            </>
          }
          description={metric.better ? 'Best first, by median' : undefined}
        >
          {ranked.length === 0 ? (
            <Empty>No runs have this measure.</Empty>
          ) : (
            <StripChart groups={ranked} metric={metric} by={search.by} log={log} evals={data.evals} legend={legend} />
          )}
        </PageSection>
      ) : search.tab === 'tools' ? (
        <PageSection
          lead
          title={
            <>
              {evalShown && <EvalMark evalId={evalShown.id} size={20} title="" />}
              Tool calls by kind
            </>
          }
        >
          {mix.length === 0 ? <Empty>No tool calls in this scope.</Empty> : <ToolMixChart groups={mix} by={search.by} />}
        </PageSection>
      ) : (
        <PageSection title="List prices" description="USD per million tokens">
          <DataTable data={prices} columns={PRICE_COLUMNS} getRowId={p => p.model} empty={<Empty>No priced models in this scope.</Empty>} />
        </PageSection>
      )}
    </>
  );
}

const usd = (v: number) => `$${v < 1 ? v.toFixed(3).replace(/0$/, '') : v.toFixed(2)}`;
const priceCol = createColumnHelper<Price & { model: string }>();

const PRICE_COLUMNS = [
  priceCol.accessor('model', { header: 'Model', enableSorting: false, cell: ({ getValue }) => <ModelLabel model={getValue()} /> }),
  ...(
    [
      ['input', 'Input'],
      ['output', 'Output'],
      ['input_cache_read', 'Cache read'],
      ['input_cache_write', 'Cache write'],
    ] as const
  ).map(([key, header]) =>
    priceCol.accessor(key, { header, enableSorting: false, meta: { numeric: true }, cell: ({ getValue }) => usd(getValue()) })
  ),
] as ColumnDef<Price & { model: string }, unknown>[];
