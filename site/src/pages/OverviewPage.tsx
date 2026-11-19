import { useMemo } from 'react';
import { Link, useNavigate } from '@tanstack/react-router';
import { useSuspenseQuery } from '@tanstack/react-query';
import { createColumnHelper } from '@tanstack/react-table';
import clsx from 'clsx';
import { Card } from '@/components/Card';
import { DataTable } from '@/components/DataTable';
import { Stats } from '@/components/Stats';
import { PageTitle, linkClassName } from '@/components/bits';
import { EvalMark, VariantLabel } from '@/components/marks';
import { indexQuery } from '@/data/queries';
import type { Eval, Run } from '@/data/types';
import { evalArt, hasTarget } from '@/lib/evals';
import { formatCost, formatDuration, formatInt, formatPercent, MISSING } from '@/lib/format';
import { useDocumentTitle } from '@/lib/search';
import { byVariant, sum, type GroupStats, type VariantStats } from '@/lib/stats';

interface EvalRow {
  eval: Eval;
  runs: Run[];
  variants: VariantStats[];
  best: VariantStats | null;
}

/** The best variant: highest finish rate (then fewest ticks), or highest median value without a target. */
function bestVariant(e: Eval, variants: VariantStats[]): VariantStats | null {
  const ranked = [...variants].sort((a, b) =>
    hasTarget(e)
      ? (b.finishRate ?? -1) - (a.finishRate ?? -1) || (a.medianTicks ?? Infinity) - (b.medianTicks ?? Infinity)
      : (b.medianScore ?? -Infinity) - (a.medianScore ?? -Infinity)
  );
  return ranked[0] ?? null;
}

/** A variant's result on an eval as a value and its sample, for tables. */
export function ResultCell({ e, stats }: { e: Eval; stats: GroupStats | undefined }) {
  if (!stats) return <span className="text-muted-50">{MISSING}</span>;
  if (hasTarget(e)) {
    return (
      <div>
        <div>{formatPercent(stats.finishRate)}</div>
        <div className="text-xs text-muted">
          {stats.finished} of {stats.scored}
        </div>
      </div>
    );
  }
  return (
    <div>
      <div>
        {formatInt(stats.medianScore)} {evalArt(e.id).measure.toLowerCase()}
      </div>
      <div className="text-xs text-muted">{stats.n === 1 ? '1 run' : `median of ${stats.n}`}</div>
    </div>
  );
}

const col = createColumnHelper<EvalRow>();

export function OverviewPage() {
  useDocumentTitle(undefined);
  const { data } = useSuspenseQuery(indexQuery);
  const navigate = useNavigate();

  const rows = useMemo<EvalRow[]>(
    () =>
      data.evals.map(e => {
        const runs = data.runs.filter(r => r.eval === e.id);
        const variants = byVariant(runs);
        return { eval: e, runs, variants, best: bestVariant(e, variants) };
      }),
    [data]
  );

  const allVariants = useMemo(() => byVariant(data.runs).map(v => v.variant), [data]);

  const models = new Set(data.runs.map(r => r.model).filter(m => m !== 'none/none'));
  const agents = new Set(data.runs.map(r => r.agent));
  const costs = data.runs.map(r => r.cost);

  const columns = useMemo(
    () => [
      col.accessor(r => r.eval.title, {
        id: 'eval',
        header: 'Eval',
        cell: ({ row }) => (
          <span className="flex w-max items-center gap-2">
            <EvalMark evalId={row.original.eval.id} size={24} />
            <Link
              to="/evals/$evalId"
              params={{ evalId: row.original.eval.id }}
              className={clsx(linkClassName, 'font-medium')}
              onClick={event => event.stopPropagation()}
            >
              {row.original.eval.title}
            </Link>
          </span>
        ),
      }),
      col.accessor(r => r.eval.goal, {
        id: 'goal',
        header: 'Goal',
        enableSorting: false,
        meta: { wrap: true },
        cell: ({ getValue }) => <span className="block max-w-md text-muted">{getValue()}</span>,
      }),
      col.accessor(r => r.runs.length, { id: 'runs', header: 'Runs', meta: { numeric: true } }),
      col.accessor(r => r.variants.length, { id: 'variants', header: 'Variants', meta: { numeric: true } }),
      col.accessor(r => r.best?.variant.name ?? '', {
        id: 'best',
        header: 'Best variant',
        cell: ({ row }) => (row.original.best ? <VariantLabel run={row.original.best.runs[0]} /> : MISSING),
      }),
      col.accessor(r => (hasTarget(r.eval) ? r.best?.finishRate : r.best?.medianScore) ?? -1, {
        id: 'result',
        header: 'Best result',
        meta: { numeric: true },
        cell: ({ row }) => <ResultCell e={row.original.eval} stats={row.original.best ?? undefined} />,
      }),
    ],
    []
  );

  return (
    <div className="flex flex-col gap-6">
      <PageTitle>Overview</PageTitle>

      <Stats
        className="grid-cols-2 sm:grid-cols-3 xl:grid-cols-6"
        stats={[
          { name: 'Evals', value: formatInt(data.evals.length) },
          { name: 'Runs', value: formatInt(data.runs.length) },
          { name: 'Models', value: formatInt(models.size) },
          { name: 'Agents', value: formatInt(agents.size) },
          { name: 'Total cost', value: formatCost(costs.some(c => c != null) ? sum(costs) : null), unit: 'at list price' },
          {
            name: 'Game time played',
            value: formatDuration(sum(data.runs.map(r => r.game_seconds))),
            unit: `${formatInt(sum(data.runs.map(r => r.game_ticks)))} ticks`,
          },
        ]}
      />

      <Card title="Evals" flush>
        <DataTable
          data={rows}
          columns={columns}
          getRowId={r => r.eval.id}
          onRowClick={r => navigate({ to: '/evals/$evalId', params: { evalId: r.eval.id } })}
        />
      </Card>

      <Card title="Variants by eval" subtitle="Finish rate, or the median value for evals without a target" flush>
        <div className="scrollbar-thin table-inset inset-from-card overflow-x-auto">
          <table className="min-w-full divide-y divide-border">
            <thead>
              <tr>
                <th scope="col" className="py-2.5 pr-3 pl-table-inset text-left text-xs font-medium whitespace-nowrap text-muted">
                  Variant
                </th>
                {rows.map((r, i) => (
                  <th
                    key={r.eval.id}
                    scope="col"
                    className={clsx(
                      'py-2.5 pl-3 text-right text-xs font-medium whitespace-nowrap text-muted',
                      i === rows.length - 1 ? 'pr-table-inset' : 'pr-3'
                    )}
                  >
                    {r.eval.title}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {allVariants.map(v => (
                <tr key={v.key} className="transition-colors hover:bg-background">
                  <td className="py-2.5 pr-3 pl-table-inset text-sm whitespace-nowrap">
                    <VariantLabel run={{ model: v.model, agent: v.agent, agent_name: '' }} />
                  </td>
                  {rows.map((r, i) => {
                    const stats = r.variants.find(s => s.variant.key === v.key);
                    return (
                      <td
                        key={r.eval.id}
                        className={clsx(
                          'py-2 pl-3 text-right text-sm whitespace-nowrap tabular-nums',
                          i === rows.length - 1 ? 'pr-table-inset' : 'pr-3'
                        )}
                      >
                        {stats ? (
                          <Link
                            to="/runs"
                            search={{ eval: r.eval.id, model: [v.model], agent: [v.agent] }}
                            className="block rounded-xs transition-colors hover:text-primary"
                          >
                            <ResultCell e={r.eval} stats={stats} />
                          </Link>
                        ) : (
                          <ResultCell e={r.eval} stats={undefined} />
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
