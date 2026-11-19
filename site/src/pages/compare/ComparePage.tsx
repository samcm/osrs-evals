import { useMemo } from 'react';
import { getRouteApi, Link } from '@tanstack/react-router';
import { useSuspenseQuery } from '@tanstack/react-query';
import clsx from 'clsx';
import { Card } from '@/components/Card';
import { ChartLegend } from '@/components/ChartLegend';
import { EvalPicker } from '@/components/EvalPicker';
import { SelectField } from '@/components/SelectField';
import { Empty, PageTitle, Segmented } from '@/components/bits';
import { EvalMark, ModelLabel } from '@/components/marks';
import { indexQuery } from '@/data/queries';
import type { Eval, Price } from '@/data/types';
import { inScope, useDocumentTitle, useScope, useSearchUpdate } from '@/lib/search';
import { modelInfo, vendorOf } from '@/lib/series';
import { median } from '@/lib/stats';
import { StripChart, ToolMixChart, type MixGroup, type RankedGroup } from './charts';
import { GroupLabel, groupRuns, groupScope, type GroupBy } from './groups';
import { METRICS, metricById, metricLabel, TOOL_CATEGORIES, type MetricId } from './metrics';

const route = getRouteApi('/compare');

interface CompareSearch {
  metric: MetricId;
  by: GroupBy;
  eval: string | undefined;
  scale: 'log' | 'linear' | undefined;
  mix: 'agent' | 'variant' | 'model';
}

const BY_OPTIONS: { value: GroupBy; label: string }[] = [
  { value: 'model', label: 'Model' },
  { value: 'vendor', label: 'Vendor' },
  { value: 'agent', label: 'Agent' },
  { value: 'variant', label: 'Variant' },
];

export function ComparePage() {
  useDocumentTitle('Compare');
  const { data } = useSuspenseQuery(indexQuery);
  const search = route.useSearch();
  const update = useSearchUpdate<CompareSearch>();
  const scope = useScope();

  const metric = metricById(search.metric);
  const scoped = useMemo(() => data.runs.filter(r => inScope(r, scope)), [data, scope]);
  const evals = data.evals.filter(e => scoped.some(r => r.eval === e.id));
  // Outcome measures read one eval: the chosen one if the measure applies to it, else the first that fits
  const choices = metric.outcome ? evals.filter(e => !metric.applies || metric.applies(e)) : evals;
  const chosen = choices.find(e => e.id === search.eval);
  const evalShown: Eval | undefined = chosen ?? (metric.outcome ? choices[0] : undefined);
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
      groupRuns(runs, search.mix)
        .map(g => {
          const counts = new Map<string, number>();
          for (const r of g.runs) for (const [k, n] of Object.entries(r.metrics.tool_mix)) counts.set(k, (counts.get(k) ?? 0) + (n ?? 0));
          return { key: g.key, sample: g.sample, counts, total: [...counts.values()].reduce((a, b) => a + b, 0) };
        })
        .filter(g => g.total > 0)
        .sort((a, b) => a.key.localeCompare(b.key)),
    [runs, search.mix]
  );

  const prices = useMemo(
    () =>
      Object.entries(data.prices)
        .filter(
          ([model]) =>
            (scope.model.length === 0 || scope.model.includes(model)) && (scope.vendor.length === 0 || scope.vendor.includes(vendorOf(model).id))
        )
        .sort(([a], [b]) => modelInfo(a).name.localeCompare(modelInfo(b).name)),
    [data, scope]
  );

  const name = metricLabel(metric, evalShown);

  return (
    <div className="flex flex-col gap-6">
      <PageTitle>Compare</PageTitle>

      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-end gap-x-4 gap-y-3">
          <SelectField
            label="Measure"
            className="w-full sm:w-72"
            value={metric.id}
            options={METRICS.map(m => ({ value: m.id, label: m.label, group: m.group }))}
            onChange={v => v && update({ metric: v as MetricId, scale: undefined })}
          />
          <div className="flex flex-col gap-1">
            <span className="text-xs font-medium text-muted">Group by</span>
            <div className="flex h-8 items-center">
              <Segmented label="Group by" value={search.by} options={BY_OPTIONS} onChange={by => update({ by })} />
            </div>
          </div>
          {metric.log && (
            <div className="flex flex-col gap-1">
              <span className="text-xs font-medium text-muted">Scale</span>
              <div className="flex h-8 items-center">
                <Segmented
                  label="Scale"
                  value={log ? 'log' : 'linear'}
                  options={[
                    { value: 'linear', label: 'Linear' },
                    { value: 'log', label: 'Log' },
                  ]}
                  onChange={scale => update({ scale: scale === metric.scale ? undefined : scale })}
                />
              </div>
            </div>
          )}
        </div>
        <EvalPicker evals={choices} value={evalShown?.id} allLabel={metric.outcome ? undefined : 'All evals'} onChange={id => update({ eval: id })} />
      </div>

      <Card
        title={
          <span className="inline-flex items-center gap-2">
            {evalShown && <EvalMark evalId={evalShown.id} size={20} title="" />}
            {name}
          </span>
        }
        subtitle={evalShown && !metric.outcome ? evalShown.title : undefined}
        flush
      >
        {ranked.length === 0 ? (
          <Empty>No runs have this measure.</Empty>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-5">
            <div className="min-w-0 p-4 sm:p-5 lg:col-span-3">
              <StripChart groups={ranked} metric={metric} by={search.by} log={log} evals={data.evals} />
              <ChartLegend
                className="mt-3"
                items={[
                  { label: 'Median', swatchClassName: 'bg-foreground' },
                  ...[...new Map(ranked.flatMap(g => g.points.map(p => [p.run.model, p.run] as const))).values()].map(r => ({
                    label: modelInfo(r.model).short,
                    color: modelInfo(r.model).color,
                    hollow: true,
                  })),
                ]}
              />
            </div>
            <ol className="divide-y divide-border border-t border-border lg:col-span-2 lg:border-t-0 lg:border-l">
              {ranked.map((g, i) => (
                <li key={g.key}>
                  <Link
                    to="/runs"
                    search={{ ...groupScope(g.sample, search.by), eval: evalShown?.id } as never}
                    className="flex items-center gap-3 px-4 py-2.5 text-sm transition-colors hover:bg-background sm:px-5"
                  >
                    <span className="w-4 text-right text-xs text-muted tabular-nums">{i + 1}</span>
                    <span className="min-w-0 flex-1 truncate">
                      <GroupLabel sample={g.sample} by={search.by} short />
                    </span>
                    <span className="text-xs text-muted tabular-nums">
                      {g.points.length < g.total ? `${g.points.length} of ${g.total} runs` : g.total === 1 ? '1 run' : `${g.total} runs`}
                    </span>
                    <span className="w-16 text-right font-medium tabular-nums">{metric.format(g.median)}</span>
                  </Link>
                </li>
              ))}
            </ol>
          </div>
        )}
      </Card>

      <div className="grid gap-6 xl:grid-cols-2">
        <Card
          title="Tool calls by kind"
          actions={
            <Segmented
              label="Tool calls by"
              value={search.mix}
              onChange={v => update({ mix: v })}
              options={[
                { value: 'agent', label: 'Agent' },
                { value: 'model', label: 'Model' },
                { value: 'variant', label: 'Variant' },
              ]}
            />
          }
        >
          {mix.length === 0 ? (
            <Empty>No tool calls in this scope.</Empty>
          ) : (
            <>
              <ToolMixChart groups={mix} by={search.mix} />
              <ChartLegend
                className="mt-3"
                items={TOOL_CATEGORIES.filter(c => mix.some(g => g.counts.get(c.id))).map(c => ({ label: c.label, swatchClassName: c.swatch }))}
              />
            </>
          )}
        </Card>

        <Card title="List prices" subtitle="USD per million tokens" flush>
          {prices.length === 0 ? <Empty>No priced models in this scope.</Empty> : <PriceTable prices={prices} />}
        </Card>
      </div>
    </div>
  );
}

const PRICE_COLUMNS: { key: keyof Price; label: string }[] = [
  { key: 'input', label: 'Input' },
  { key: 'output', label: 'Output' },
  { key: 'input_cache_read', label: 'Cache read' },
  { key: 'input_cache_write', label: 'Cache write' },
];

function PriceTable({ prices }: { prices: [string, Price][] }) {
  const usd = (v: number) => `$${v < 1 ? v.toFixed(3).replace(/0$/, '') : v.toFixed(2)}`;
  return (
    <div className="scrollbar-thin table-inset inset-from-card overflow-x-auto">
      <table className="min-w-full divide-y divide-border">
        <thead>
          <tr>
            <th scope="col" className="py-2.5 pr-3 pl-table-inset text-left text-xs font-medium whitespace-nowrap text-muted">
              Model
            </th>
            {PRICE_COLUMNS.map((c, i) => (
              <th
                key={c.key}
                scope="col"
                className={clsx(
                  'py-2.5 pl-3 text-right text-xs font-medium whitespace-nowrap text-muted',
                  i === PRICE_COLUMNS.length - 1 ? 'pr-table-inset' : 'pr-3'
                )}
              >
                {c.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {prices.map(([model, price]) => (
            <tr key={model} className="transition-colors hover:bg-background">
              <td className="py-2.5 pr-3 pl-table-inset text-sm whitespace-nowrap">
                <ModelLabel model={model} size={20} />
              </td>
              {PRICE_COLUMNS.map((c, i) => (
                <td
                  key={c.key}
                  className={clsx(
                    'py-2.5 pl-3 text-right text-sm whitespace-nowrap tabular-nums',
                    i === PRICE_COLUMNS.length - 1 ? 'pr-table-inset' : 'pr-3'
                  )}
                >
                  {usd(price[c.key])}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
