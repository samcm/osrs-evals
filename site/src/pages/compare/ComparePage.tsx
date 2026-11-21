/**
 * `/compare`: how models and harnesses differ on any one measure, cut any way. Tabs, one toolbar
 * (measure, eval, grouping, scale), then one card: the measure as every run on a strip chart that is
 * its own ranking (rows best first, each with its median), the tool-call mix, or list prices. The
 * strip chart's legend keys models (colour) and harnesses (shape) once each, so it stays short at
 * any number of pairings; hiding or isolating one drops its runs from the ranking.
 */

import { useMemo } from 'react';
import { getRouteApi } from '@tanstack/react-router';
import { useSuspenseQuery } from '@tanstack/react-query';
import { createColumnHelper, type ColumnDef } from '@tanstack/react-table';
import { DataTable } from '@/components/DataTable';
import { SelectField } from '@/components/SelectField';
import { Empty, Segmented } from '@/components/bits';
import { EvalMark, ModelLabel } from '@/components/marks';
import { PageSection, PageTabs, PageToolbar } from '@/components/page';
import { indexQuery } from '@/data/queries';
import type { Eval, Price, Run } from '@/data/types';
import { useLegend } from '@/lib/legend';
import { inScope, useDocumentTitle, useEffort, useScope, useScopeUpdate, useSearchUpdate } from '@/lib/search';
import { PairingFilters } from '@/components/PairingFilters';
import { bestLevelKeys, blendedScores } from '@/lib/score';
import { variantKey } from '@/lib/series';
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
  const setScope = useScopeUpdate();
  const effort = useEffort();
  const legend = useLegend();

  // EthIQ's cut: every thinking level, or each model in each harness at its best blended score
  const scoped = useMemo(() => {
    const runs = data.runs.filter(r => inScope(r, scope));
    if (effort === 'all') return runs;
    const keep = bestLevelKeys(blendedScores(data.evals, runs).map(p => p.variant));
    return runs.filter(r => keep.has(variantKey(r)));
  }, [data, scope, effort]);
  // The measures some run in scope has; one that none has (cost, for unpriced models) gives way to the first that one has
  const offered = useMemo(() => METRICS.filter(m => scoped.some(r => Number.isFinite(m.get(r) ?? NaN))), [scoped]);
  const metric = offered.find(m => m.id === search.metric) ?? offered[0] ?? metricById(search.metric);
  const evals = data.evals.filter(e => scoped.some(r => r.eval === e.id));
  // Outcome measures read one eval: the chosen one if the measure applies to it, else the first that fits
  const oneEval = search.tab === 'measure' && Boolean(metric.outcome);
  const choices = oneEval ? evals.filter(e => !metric.applies || metric.applies(e)) : evals;
  const chosen = choices.find(e => e.id === search.eval);
  // Without a choice, the eval with the most runs: the one with the most to compare
  const runsOf = (id: string) => scoped.filter(r => r.eval === id).length;
  const evalShown: Eval | undefined = chosen ?? (oneEval ? [...choices].sort((a, b) => runsOf(b.id) - runsOf(a.id))[0] : undefined);
  const runs = useMemo(() => scoped.filter(r => !evalShown || r.eval === evalShown.id), [scoped, evalShown]);

  const log = metric.log && (search.scale ?? metric.scale) === 'log';

  // Every run with a value on the measure (a log scale has no place for zero): the legend keys
  // their models and harnesses, hidden or not
  const valued = useMemo(
    () =>
      runs
        .map(run => ({ run, value: metric.get(run) }))
        .filter((p): p is { run: Run; value: number } => p.value != null && Number.isFinite(p.value) && (!log || p.value > 0)),
    [runs, metric, log]
  );

  const { hidden, focus } = legend;
  const ranked = useMemo<RankedGroup[]>(() => {
    // A run is shown unless its model or harness is hidden, or, with one isolated, when it is that one
    const shown = (run: Run) => (focus ? focus === run.model || focus === run.agent : !hidden.includes(run.model) && !hidden.includes(run.agent));
    const values = new Map(valued.map(p => [p.run, p.value]));
    const groups = groupRuns(valued.map(p => p.run).filter(shown), search.by).map(g => {
      const points = g.runs.map(run => ({ run, value: values.get(run)! }));
      return { key: g.key, sample: g.sample, points, median: median(points.map(p => p.value)) ?? NaN };
    });
    // Lower-is-better measures lowest first; the rest highest first
    const dir = metric.better === 'lower' ? 1 : -1;
    return groups.sort((a, b) => dir * (a.median - b.median));
  }, [valued, search.by, metric, hidden, focus]);

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
      <PageTabs value={search.tab} tabs={[...TABS]} />

      {search.tab !== 'prices' && (
        <PageToolbar label="Measure, eval and grouping">
          {search.tab === 'measure' && (
            <SelectField
              label="Measure"
              hideLabel
              className="w-full sm:w-64"
              value={metric.id}
              options={offered.map(m => ({ value: m.id, label: m.label, group: m.group }))}
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
          <PairingFilters runs={data.runs} thinking={scope.thinking} agent={scope.agent} onChange={setScope}>
            <Segmented size="default" label="Group by" value={search.by} options={BY_OPTIONS} onChange={by => update({ by })} />
            {search.tab === 'measure' && metric.log && (
              <Segmented
                size="default"
                label="Scale"
                value={log ? 'log' : 'linear'}
                options={SCALE_OPTIONS}
                onChange={scale => update({ scale: scale === metric.scale ? undefined : scale })}
              />
            )}
          </PairingFilters>
        </PageToolbar>
      )}

      {search.tab === 'measure' ? (
        <PageSection
          title={
            <>
              {evalShown && <EvalMark evalId={evalShown.id} size={16} title="" />}
              {name}
            </>
          }
          description={metric.better === 'lower' ? 'Lowest first, by median' : 'Highest first, by median'}
        >
          {valued.length === 0 ? (
            <Empty>No runs have this measure.</Empty>
          ) : (
            <StripChart groups={ranked} keyed={valued.map(p => p.run)} metric={metric} by={search.by} log={log} evals={evalShown ? undefined : data.evals} legend={legend} />
          )}
        </PageSection>
      ) : search.tab === 'tools' ? (
        <PageSection
          title={
            <>
              {evalShown && <EvalMark evalId={evalShown.id} size={16} title="" />}
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

const SCALE_OPTIONS: { value: 'linear' | 'log'; label: string }[] = [
  { value: 'linear', label: 'Linear' },
  { value: 'log', label: 'Log' },
];

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
