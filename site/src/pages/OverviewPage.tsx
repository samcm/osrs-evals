import { Fragment, useMemo, type ReactNode } from 'react';
import { getRouteApi, Link, useNavigate } from '@tanstack/react-router';
import { useQuery, useSuspenseQuery } from '@tanstack/react-query';
import type { EChartsOption } from 'echarts';
import clsx from 'clsx';
import { Card } from '@/components/Card';
import { Chart } from '@/components/Chart';
import { ChartLegend, type LegendItem } from '@/components/ChartLegend';
import { Empty, ParamSegmented, PageTitle, Segmented } from '@/components/bits';
import { AgentLabel, BrandMark, EvalMark, ModelLabel, VariantLabel } from '@/components/marks';
import { VariantShort } from '@/components/VariantShort';
import { evalRunsQuery, indexQuery } from '@/data/queries';
import type { Eval, EvalRuns, Run } from '@/data/types';
import { categoryAxis, formatAxisNumber, getChartTooltipChrome, getChartValueAxisName, tooltipRow, tooltipTitle, valueAxis } from '@/lib/chartChrome';
import { hasTarget } from '@/lib/evals';
import { formatClock, formatCostTick, formatInt, formatPercent, MISSING } from '@/lib/format';
import { useLegend, type LegendState } from '@/lib/legend';
import { logAxis, logRange } from '@/lib/logAxis';
import { resultValue } from '@/lib/runResult';
import { inScope, useDocumentTitle, useScope, useSearchUpdate } from '@/lib/search';
import { agentInfo, compareVariants, modelInfo, variantOf, type Variant } from '@/lib/series';
import { median } from '@/lib/stats';
import { useThemeColors, type ThemeColors } from '@/lib/theme';

const route = getRouteApi('/');

type XMeasure = 'ticks' | 'seconds' | 'cost';

const LINE_TYPE = { solid: 'solid', dashed: [6, 4], dotted: [1.5, 3] } as const;

/** Heat steps, one hue, light to strong. Literal classes so Tailwind generates them. */
const TINTS = ['bg-data-blue-10', 'bg-data-blue-15', 'bg-data-blue-25', 'bg-data-blue-30', 'bg-data-blue-60'];

/** One variant's runs of one eval and its headline result. */
interface Cell {
  runs: Run[];
  /** Finish rate for evals with a target; the median result otherwise */
  value: number | null;
  finished: number;
}

function cellOf(e: Eval, runs: Run[]): Cell {
  if (hasTarget(e)) {
    const scored = runs.filter(r => r.success != null);
    const finished = scored.filter(r => r.success).length;
    return { runs, value: scored.length ? finished / scored.length : null, finished };
  }
  return { runs, value: median(runs.map(resultValue)), finished: 0 };
}

interface Row {
  variant: Variant;
  cells: Map<string, Cell>;
}

export function OverviewPage() {
  useDocumentTitle(undefined);
  const { data } = useSuspenseQuery(indexQuery);
  const search = route.useSearch();
  const scope = useScope();

  const runs = useMemo(() => data.runs.filter(r => inScope(r, scope)), [data, scope]);
  const evals = useMemo(() => data.evals.filter(e => runs.some(r => r.eval === e.id)), [data, runs]);

  const rows = useMemo<Row[]>(() => {
    const byKey = new Map<string, Run[]>();
    for (const r of runs) byKey.set(variantOf(r).key, [...(byKey.get(variantOf(r).key) ?? []), r]);
    return [...byKey.values()]
      .map(list => ({
        variant: variantOf(list[0]),
        cells: new Map(
          evals.flatMap(e => {
            const mine = list.filter(r => r.eval === e.id);
            return mine.length ? [[e.id, cellOf(e, mine)] as const] : [];
          })
        ),
      }))
      .sort((a, b) => compareVariants(a.variant, b.variant));
  }, [runs, evals]);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <PageTitle>Language models playing 2004scape</PageTitle>
        <p className="text-sm text-muted">Each row is a model in an agent harness; each column, a goal in the game.</p>
      </div>
      {rows.length === 0 ? (
        <Empty>No runs in this scope.</Empty>
      ) : (
        <>
          <VariantGrid rows={rows} evals={evals} sort={search.sort[0]} by={search.by} />
          <Progress evals={evals} runs={runs} x={search.x} />
        </>
      )}
    </div>
  );
}

// The variant × eval grid

function sortRows(rows: Row[], key: string | undefined): Row[] {
  if (!key || key === 'variant') return rows;
  if (key === '-variant') return [...rows].reverse();
  const desc = key.startsWith('-');
  const id = key.replace(/^-/, '');
  return [...rows].sort((a, b) => {
    const va = a.cells.get(id)?.value;
    const vb = b.cells.get(id)?.value;
    // Variants without a result go last either way
    if (va == null || vb == null) return (va == null ? 1 : 0) - (vb == null ? 1 : 0);
    return desc ? vb - va : va - vb;
  });
}

function VariantGrid({ rows, evals, sort, by }: { rows: Row[]; evals: Eval[]; sort: string | undefined; by: 'model' | 'agent' | undefined }) {
  const update = useSearchUpdate<{ sort: string[]; by: 'model' | 'agent' | undefined }>();
  const sorted = sortRows(rows, sort);

  // Each column's heat is scaled to its own best result
  const top = new Map(evals.map(e => [e.id, Math.max(0, ...rows.map(r => r.cells.get(e.id)?.value ?? 0))]));

  const groups: { key: string; head: ReactNode; rows: Row[] }[] = by
    ? [...new Set(sorted.map(r => r.variant[by]))]
        .map(key => ({
          key,
          name: by === 'model' ? modelInfo(key).name : agentInfo(key).name,
          head: by === 'model' ? <ModelLabel model={key} /> : <AgentLabel agent={key} />,
          rows: sorted.filter(r => r.variant[by] === key),
        }))
        .sort((a, b) => a.name.localeCompare(b.name))
    : [{ key: 'all', head: null, rows: sorted }];

  const sortBy = (id: string, firstDesc: boolean) => {
    const next = sort === (firstDesc ? `-${id}` : id) ? (firstDesc ? id : `-${id}`) : firstDesc ? `-${id}` : id;
    update({ sort: next === 'variant' ? [] : [next] });
  };
  const ariaSort = (id: string) => (sort === id || (id === 'variant' && !sort) ? 'ascending' : sort === `-${id}` ? 'descending' : undefined);
  const arrow = (id: string) => {
    const s = ariaSort(id);
    return (
      <span aria-hidden className={clsx('w-2 text-2xs', !s && 'invisible')}>
        {s === 'descending' ? '↓' : '↑'}
      </span>
    );
  };

  return (
    <Card
      title="Results"
      actions={
        <Segmented
          label="Group rows"
          value={by ?? 'none'}
          onChange={v => update({ by: v === 'none' ? undefined : v })}
          options={[
            { value: 'none', label: 'Variants' },
            { value: 'model', label: 'By model' },
            { value: 'agent', label: 'By agent' },
          ]}
        />
      }
      flush
    >
      <div className="scrollbar-thin table-inset inset-from-card overflow-x-auto">
        <table className="min-w-full border-separate border-spacing-0">
          <thead>
            <tr>
              <th
                scope="col"
                aria-sort={ariaSort('variant')}
                className="sticky left-0 z-10 border-b border-border bg-surface py-2.5 pr-3 pl-table-inset text-left align-bottom text-xs font-medium whitespace-nowrap text-muted"
              >
                <button
                  type="button"
                  onClick={() => sortBy('variant', false)}
                  className={clsx(
                    'inline-flex items-center gap-1 rounded-xs transition-colors hover:text-foreground',
                    (!sort || sort.endsWith('variant')) && 'text-foreground'
                  )}
                >
                  {by === 'model' ? 'Agent' : by === 'agent' ? 'Model' : 'Variant'}
                  {arrow('variant')}
                </button>
              </th>
              {evals.map((e, i) => (
                <th
                  key={e.id}
                  scope="col"
                  aria-sort={ariaSort(e.id)}
                  className={clsx(
                    'border-b border-border py-2.5 pl-3 text-right align-bottom text-xs font-medium whitespace-nowrap text-muted',
                    i === evals.length - 1 ? 'pr-table-inset' : 'pr-3'
                  )}
                >
                  <button
                    type="button"
                    onClick={() => sortBy(e.id, true)}
                    className={clsx(
                      'inline-flex flex-col items-end gap-0.5 rounded-xs transition-colors hover:text-foreground',
                      sort?.replace(/^-/, '') === e.id && 'text-foreground'
                    )}
                  >
                    <span className="inline-flex items-center gap-1.5">
                      {arrow(e.id)}
                      <EvalMark evalId={e.id} size={20} title="" />
                      <span className="text-foreground">{e.title}</span>
                    </span>
                    <span>{hasTarget(e) ? 'Finish rate' : `Median ${e.measure.toLowerCase()}`}</span>
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {groups.map(group => (
              <Fragment key={group.key}>
                {group.head && (
                  <tr>
                    <th
                      scope="rowgroup"
                      colSpan={evals.length + 1}
                      className="border-b border-border bg-background py-2 pl-table-inset text-left text-sm font-medium"
                    >
                      <span className="sticky left-4 inline-flex">{group.head}</span>
                    </th>
                  </tr>
                )}
                {group.rows.map(row => (
                  <tr key={row.variant.key} className="group">
                    <th
                      scope="row"
                      className="sticky left-0 z-10 border-b border-border bg-surface py-0 pr-3 pl-table-inset text-left text-sm font-normal whitespace-nowrap"
                    >
                      {by === 'model' ? (
                        <AgentLabel agent={row.variant.agent} size={20} />
                      ) : by === 'agent' ? (
                        <ModelLabel model={row.variant.model} size={20} />
                      ) : (
                        <>
                          <VariantLabel variant={row.variant} size={20} className="max-sm:hidden" />
                          <VariantShort variant={row.variant} markOnly className="sm:hidden" />
                        </>
                      )}
                    </th>
                    {evals.map((e, i) => (
                      <GridCell
                        key={e.id}
                        e={e}
                        cell={row.cells.get(e.id)}
                        top={top.get(e.id) ?? 0}
                        variant={row.variant}
                        last={i === evals.length - 1}
                      />
                    ))}
                  </tr>
                ))}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

function GridCell({ e, cell, top, variant, last }: { e: Eval; cell: Cell | undefined; top: number; variant: Variant; last: boolean }) {
  const edge = clsx('border-b border-l border-border', last ? 'pr-table-inset' : 'pr-3');
  if (!cell || cell.value == null) {
    return <td className={clsx(edge, 'py-2.5 pl-3 text-right text-sm text-muted-50')}>{MISSING}</td>;
  }
  const t = top > 0 ? cell.value / top : 0;
  const tint = t > 0 ? TINTS[Math.min(TINTS.length - 1, Math.ceil(t * TINTS.length) - 1)] : undefined;
  const target = hasTarget(e);
  return (
    <td className={clsx(edge, 'p-0', tint)}>
      <Link
        to="/evals/$evalId"
        params={{ evalId: e.id }}
        search={{ model: [variant.model], agent: [variant.agent] } as never}
        title={`${variant.name}: ${e.title}`}
        className={clsx(
          'flex h-11 items-center justify-end gap-2 pl-3 tabular-nums transition-colors hover:bg-foreground-5',
          last ? 'pr-table-inset' : 'pr-3'
        )}
      >
        <span className="text-xs text-muted">
          {target ? `${cell.finished} of ${cell.runs.length}` : cell.runs.length === 1 ? '1 run' : `${cell.runs.length} runs`}
        </span>
        <span className="min-w-10 text-right text-sm font-medium text-foreground">{target ? formatPercent(cell.value) : formatInt(cell.value)}</span>
      </Link>
    </td>
  );
}

// Every eval's progress over time

function Progress({ evals, runs, x }: { evals: Eval[]; runs: Run[]; x: XMeasure }) {
  const legend = useLegend();
  const variants = useMemo(() => {
    const seen = new Map<string, Variant>();
    for (const r of runs) seen.set(variantOf(r).key, variantOf(r));
    return [...seen.values()].sort(compareVariants);
  }, [runs]);
  const items: LegendItem[] = variants.map(v => ({
    id: v.key,
    label: v.name,
    color: v.color,
    line: v.line,
    mark: (
      <span className="inline-flex items-center gap-1">
        {v.vendorSlug !== 'program' && <BrandMark slug={v.vendorSlug} size={14} />}
        <BrandMark slug={v.agentSlug} size={14} />
      </span>
    ),
  }));

  return (
    <section className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <h2 className="text-base font-semibold text-foreground">Progress</h2>
        <ParamSegmented
          param="x"
          label="X axis"
          value={x}
          options={[
            { value: 'ticks', label: 'Game ticks' },
            { value: 'seconds', label: 'Seconds' },
            { value: 'cost', label: 'Cost' },
          ]}
        />
      </div>
      <ChartLegend items={items} legend={legend} />
      <div className="grid gap-6 xl:grid-cols-2">
        {evals.map(e => (
          <EvalProgress key={e.id} e={e} runs={runs.filter(r => r.eval === e.id)} x={x} legend={legend} />
        ))}
      </div>
    </section>
  );
}

function EvalProgress({ e, runs, x, legend }: { e: Eval; runs: Run[]; x: XMeasure; legend: LegendState }) {
  const { data } = useQuery(evalRunsQuery(e.id));
  const colors = useThemeColors();
  const navigate = useNavigate();
  const option = useMemo(() => (data ? progressOption(e, runs, data, x, legend, colors) : null), [e, runs, data, x, legend, colors]);

  return (
    <Card
      title={
        <Link to="/evals/$evalId" params={{ evalId: e.id }} className="inline-flex items-center gap-2 transition-colors hover:text-primary">
          <EvalMark evalId={e.id} size={20} title="" />
          {e.title}
        </Link>
      }
      className="flex flex-col"
    >
      {option ? (
        <Chart
          option={option}
          height={220}
          onEvents={{
            click: p => {
              const id = (p as { seriesId?: string }).seriesId;
              if (id && !id.startsWith('_')) navigate({ to: '/runs/$runId', params: { runId: id } });
            },
          }}
        />
      ) : (
        <div className="flex h-55 items-center justify-center text-sm text-muted">{data ? 'No runs of the shown variants.' : null}</div>
      )}
    </Card>
  );
}

function progressOption(e: Eval, runs: Run[], data: EvalRuns, x: XMeasure, legend: LegendState, colors: ThemeColors): EChartsOption | null {
  const shown = runs.filter(r => data.runs[r.id] && legend.visible(variantOf(r).key));
  if (shown.length === 0) return null;
  const lines = shown.map(r => {
    const series = data.runs[r.id];
    const xs = x === 'ticks' ? data.ticks : x === 'seconds' ? series.seconds : series.cost;
    const points: [number, number][] = [];
    series.value.forEach((v, i) => {
      const at = xs[i];
      if (v == null || at == null || (x === 'cost' && at <= 0)) return;
      points.push([at, v]);
    });
    return { run: r, points };
  });

  const allX = lines.flatMap(l => l.points.map(p => p[0]));
  const allY = lines.flatMap(l => l.points.map(p => p[1]));
  const yMax = Math.max(e.target ?? 0, ...allY, 1);
  const budget = e.budget_ticks * e.attempts;

  let xAxis: EChartsOption['xAxis'];
  if (x === 'cost') {
    const range = logRange(allX);
    if (!range) return null;
    // Cost stands in for time here: an axis line, no split lines
    xAxis = { ...logAxis(colors, range[0], range[1], formatCostTick), axisLine: categoryAxis(colors).axisLine, splitLine: { show: false } };
  } else {
    xAxis = {
      type: 'value',
      min: 0,
      max: x === 'ticks' ? budget : Math.ceil(Math.max(1, ...allX) / 60) * 60,
      ...categoryAxis(colors),
      axisLabel: {
        ...categoryAxis(colors).axisLabel,
        formatter: (v: number) => (x === 'seconds' ? formatClock(v) : formatAxisNumber(v)),
        hideOverlap: true,
      },
    };
  }

  const guides = {
    id: '_guides',
    type: 'line' as const,
    data: [],
    silent: true,
    markLine: {
      silent: true,
      symbol: 'none',
      animation: false,
      data: [
        ...(e.target != null
          ? [
              {
                yAxis: e.target,
                lineStyle: { color: colors.muted, type: [4, 4] as number[], width: 1 },
                label: { show: true, position: 'insideEndBottom' as const, formatter: 'Target', color: colors.muted, fontSize: 11 },
              },
            ]
          : []),
        // Where each new try starts
        ...(x === 'ticks'
          ? Array.from({ length: e.attempts - 1 }, (_, k) => ({
              xAxis: e.budget_ticks * (k + 1),
              lineStyle: { color: colors.border, type: 'solid' as const, width: 1 },
              label: { show: false },
            }))
          : []),
      ],
    },
  };

  return {
    animation: false,
    grid: { left: 8, right: 16, top: 28, bottom: 4, containLabel: true },
    tooltip: {
      ...getChartTooltipChrome(colors),
      trigger: 'item',
      formatter: (p: unknown) => {
        const { seriesId } = p as { seriesId: string };
        const run = runs.find(r => r.id === seriesId);
        if (!run) return '';
        return tooltipTitle(variantOf(run).name) + tooltipRow(null, e.measure, formatInt(resultValue(run))) + tooltipRow(null, 'Run', run.id);
      },
    },
    xAxis,
    yAxis: {
      type: 'value',
      min: 0,
      max: yMax,
      minInterval: 1,
      name: e.measure,
      ...getChartValueAxisName(colors),
      ...valueAxis(colors),
      axisLabel: { ...valueAxis(colors).axisLabel, formatter: (v: number) => formatAxisNumber(v) },
    },
    series: [
      guides,
      ...lines.map(({ run, points }) => {
        const v = variantOf(run);
        const color = colors.resolve(v.color.token);
        return {
          id: run.id,
          name: v.name,
          type: 'line' as const,
          step: 'end' as const,
          data: points,
          showSymbol: false,
          symbol: v.symbol,
          symbolSize: 6,
          triggerLineEvent: true,
          color,
          lineStyle: { width: 1.5, color, type: LINE_TYPE[v.line] as never, opacity: 0.85 },
          emphasis: { focus: 'series' as const, lineStyle: { width: 2.5 } },
          blur: { lineStyle: { opacity: 0.15 } },
        };
      }),
    ],
  };
}
