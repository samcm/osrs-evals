import { useMemo, type ReactNode } from 'react';
import { getRouteApi, useNavigate } from '@tanstack/react-router';
import { useSuspenseQuery } from '@tanstack/react-query';
import { createColumnHelper, type ColumnDef } from '@tanstack/react-table';
import { DataTable } from '@/components/DataTable';
import { EvalPicker } from '@/components/EvalPicker';
import { SelectField } from '@/components/SelectField';
import { Empty, PageTitle, Segmented } from '@/components/bits';
import { EvalMark, ModelLabel } from '@/components/marks';
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { indexQuery } from '@/data/queries';
import type { Eval, Price } from '@/data/types';
import { useLegend } from '@/lib/legend';
import { inScope, useDocumentTitle, useScope, useSearchUpdate } from '@/lib/search';
import { modelInfo, vendorOf } from '@/lib/series';
import { median } from '@/lib/stats';
import { StripChart, ToolMixChart, type MixGroup, type RankedGroup } from './charts';
import { GroupLabel, groupRuns, groupScope, type GroupBy } from './groups';
import { METRICS, metricById, metricLabel, type Metric, type MetricId } from './metrics';

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

/** A control with its label above, as SelectField draws one. */
function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      {children}
    </div>
  );
}

export function ComparePage() {
  useDocumentTitle('Compare');
  const { data } = useSuspenseQuery(indexQuery);
  const search = route.useSearch();
  const update = useSearchUpdate<CompareSearch>();
  const scope = useScope();
  const legend = useLegend();

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
        .sort(([a], [b]) => modelInfo(a).name.localeCompare(modelInfo(b).name))
        .map(([model, price]) => ({ model, ...price })),
    [data, scope]
  );

  const name = metricLabel(metric, evalShown);

  return (
    <>
      <PageTitle>Compare</PageTitle>

      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap items-end gap-4">
          <SelectField
            label="Measure"
            className="w-full sm:w-72"
            value={metric.id}
            options={METRICS.map(m => ({ value: m.id, label: m.label, group: m.group }))}
            onChange={v => v && update({ metric: v as MetricId, scale: undefined })}
          />
          <Field label="Group by">
            <Segmented label="Group by" value={search.by} options={BY_OPTIONS} onChange={by => update({ by })} />
          </Field>
          {metric.log && (
            <Field label="Scale">
              <Segmented
                label="Scale"
                value={log ? 'log' : 'linear'}
                options={[
                  { value: 'linear', label: 'Linear' },
                  { value: 'log', label: 'Log' },
                ]}
                onChange={scale => update({ scale: scale === metric.scale ? undefined : scale })}
              />
            </Field>
          )}
        </div>
        <EvalPicker evals={choices} value={evalShown?.id} allLabel={metric.outcome ? undefined : 'All evals'} onChange={id => update({ eval: id })} />
      </div>

      {ranked.length === 0 ? (
        <Card>
          <CardContent>
            <Empty>No runs have this measure.</Empty>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:gap-6 xl:grid-cols-3">
          <Card className="xl:col-span-2">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                {evalShown && <EvalMark evalId={evalShown.id} size={20} title="" />}
                {name}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <StripChart groups={ranked} metric={metric} by={search.by} log={log} evals={data.evals} legend={legend} />
            </CardContent>
          </Card>
          <Ranking groups={ranked} metric={metric} by={search.by} evalId={evalShown?.id} />
        </div>
      )}

      <div className="grid gap-4 md:gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Tool calls by kind</CardTitle>
            <CardAction>
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
            </CardAction>
          </CardHeader>
          <CardContent>{mix.length === 0 ? <Empty>No tool calls in this scope.</Empty> : <ToolMixChart groups={mix} by={search.mix} />}</CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>List prices</CardTitle>
            <CardDescription>USD per million tokens</CardDescription>
          </CardHeader>
          <CardContent className="px-0">
            <DataTable data={prices} columns={PRICE_COLUMNS} getRowId={p => p.model} empty={<Empty>No priced models in this scope.</Empty>} />
          </CardContent>
        </Card>
      </div>
    </>
  );
}

const rankCol = createColumnHelper<RankedGroup & { rank: number }>();

/** The groups in rank order, each linking to its runs. */
function Ranking({ groups, metric, by, evalId }: { groups: RankedGroup[]; metric: Metric; by: GroupBy; evalId: string | undefined }) {
  const navigate = useNavigate();
  const columns = useMemo(
    () =>
      [
        rankCol.accessor('rank', { header: '#', enableSorting: false, cell: ({ getValue }) => <span className="text-muted-foreground">{getValue()}</span> }),
        rankCol.display({ id: 'group', header: BY_OPTIONS.find(o => o.value === by)?.label, cell: ({ row }) => <GroupLabel sample={row.original.sample} by={by} /> }),
        rankCol.display({
          id: 'runs',
          header: 'Runs',
          meta: { numeric: true },
          cell: ({ row }) => (
            <span className="text-muted-foreground">
              {row.original.points.length < row.original.total ? `${row.original.points.length} of ${row.original.total}` : row.original.total}
            </span>
          ),
        }),
        rankCol.display({
          id: 'median',
          header: 'Median',
          meta: { numeric: true },
          cell: ({ row }) => <span className="font-medium">{metric.format(row.original.median)}</span>,
        }),
      ] as ColumnDef<RankedGroup & { rank: number }, unknown>[],
    [by, metric]
  );
  return (
    <Card>
      <CardHeader>
        <CardTitle>Ranked by median</CardTitle>
        <CardDescription>{metric.better === 'lower' ? 'Lowest first' : 'Highest first'}</CardDescription>
      </CardHeader>
      <CardContent className="px-0">
        <DataTable
          data={groups.map((g, i) => ({ ...g, rank: i + 1 }))}
          columns={columns}
          getRowId={g => g.key}
          onRowClick={g => navigate({ to: '/runs', search: { ...groupScope(g.sample, by), eval: evalId } as never })}
        />
      </CardContent>
    </Card>
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
