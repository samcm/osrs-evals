/**
 * `/models/$model`: one model across every eval, the cross-eval counterpart of the model's page on
 * one eval. Its result on each eval at each thinking level and harness, how its score and cost move
 * with thinking level, where it ranks among the models and what each eval cost and took, then its
 * runs. Filtered by thinking level and harness (`level`, `harness`, which a Home row presets) and
 * cut to each harness's best level by the page's `effort`.
 */

import { useMemo, type JSX } from 'react';
import { getRouteApi, Link, useNavigate, type LinkProps } from '@tanstack/react-router';
import type { ColumnDef } from '@tanstack/react-table';
import clsx from 'clsx';
import { useSuspenseQuery } from '@tanstack/react-query';
import { DataTable } from '@/components/DataTable';
import { Empty, Tip } from '@/components/bits';
import { AgentLabel, BrandMark, EvalMark, VariantLabel } from '@/components/marks';
import { PairingFilters } from '@/components/PairingFilters';
import { PageHeader, PageSection, PageToolbar, type MetaItem } from '@/components/page';
import { indexQuery } from '@/data/queries';
import type { Eval, Run } from '@/data/types';
import { evalSlug } from '@/lib/evals';
import { formatCost, formatDay, formatDuration, formatInt, formatTokens } from '@/lib/format';
import { resultValue } from '@/lib/runResult';
import { bestLevelKeys, blendedScores, modelRank, runScore, type Pairing } from '@/lib/score';
import { inScope, useDocumentTitle, useEffort, useScope, useSearchUpdate } from '@/lib/search';
import {
  compareThinking,
  levelName,
  modelFacts,
  modelInfo,
  modelSlug,
  providerInfo,
  providerLogo,
  variantKey,
} from '@/lib/series';
import { median } from '@/lib/stats';
import { runColumns, type Row } from '@/pages/runsTable/columns';
import { costMeasure, harnessSeries, type ThinkingMeasure } from '@/pages/model/measures';
import { ThinkingChart } from '@/pages/model/ThinkingChart';

const route = getRouteApi('/models/$model');
const SECTIONS = 'flex flex-col gap-gutter';
const PAGE_SIZE = 25;
/** A pairing's harness line beside it, as in the charts */
const lineClasses = { solid: 'border-solid', dashed: 'border-dashed', dotted: 'border-dotted' } as const;
/** The table's width from which it shows time, cost and runs beside the result */
const COLUMNS_FROM = 560;

/** "#2 of 7": a place among a field. */
const place = (rank: number, of: number): string => `#${formatInt(rank)} of ${formatInt(of)}`;

/** Each eval's best value, for scoring evals that count how much (lib/score.ts). */
function bests(evals: Eval[], runs: Run[]): Map<string, number> {
  return new Map(
    evals.map(e => [e.id, Math.max(0, ...runs.filter(r => r.eval === e.id).map(r => resultValue(r) ?? 0))])
  );
}

/**
 * A row of the per-eval table: an eval, or under an eval it ran as several pairings, one of them.
 * Both carry the runs they stand for; the eval's row its place among the models.
 */
interface EvalRow {
  id: string;
  e: Eval;
  own: Run[];
  rank?: { rank: number; of: number } | null;
  pairing?: Pairing;
}

/** A set of runs' result on an eval: how many finished, or the median; a phone keeps the number. */
function Result({ e, own }: { e: Eval; own: Run[] }): JSX.Element {
  if (own.length === 0) return <>–</>;
  if (e.target != null)
    return (
      <>
        {formatInt(own.filter(r => r.success).length)}
        <span className="text-muted">
          {' '}
          of {formatInt(own.length)}
          <span className="max-md:hidden"> finished</span>
        </span>
      </>
    );
  return (
    <>
      {formatInt(median(own.map(resultValue)))}
      <span className="text-muted max-md:hidden"> {e.measure.toLowerCase()}</span>
    </>
  );
}

/** Median time per run: to the finish on an eval with a target, else the game time played. */
const medianTime = ({ e, own }: EvalRow): number | null =>
  e.target != null ? median(own.filter(r => r.success).map(r => r.seconds)) : median(own.map(r => r.game_seconds));

/** Where the model places, what it got, how long and what it cost, per eval; a phone keeps the first three. */
function evalColumns(model: string): ColumnDef<EvalRow, unknown>[] {
  return [
    {
      id: 'eval',
      header: () => <span className="sr-only">Eval</span>,
      enableSorting: false,
      cell: ({ row: { original: r } }) =>
        r.pairing ? (
          <span className="flex min-w-0 items-center gap-2 pl-7 max-md:pl-2">
            <span
              aria-hidden
              className={clsx(
                'w-4 shrink-0 border-t-2 max-md:hidden',
                r.pairing.variant.color.borderClassName,
                lineClasses[r.pairing.variant.line]
              )}
            />
            <VariantLabel variant={r.pairing.variant} run={r.pairing.sample} compact />
          </span>
        ) : (
          <Link
            {...evalTarget(model, r)}
            className="inline-flex max-w-full items-center gap-2 align-middle whitespace-nowrap hover:underline"
          >
            <EvalMark evalId={r.e.id} size={20} title="" />
            {/* A phone keeps the name short, so the place and result stay in view */}
            <span className="truncate max-md:max-w-28">{r.e.title}</span>
          </Link>
        ),
    },
    {
      id: 'place',
      header: () => (
        <Tip content="Among the models, by each one's best pairing">
          <span>Place</span>
        </Tip>
      ),
      enableSorting: false,
      meta: { numeric: true },
      cell: ({ row: { original: r } }) => (r.pairing ? null : r.rank ? place(r.rank.rank, r.rank.of) : '–'),
    },
    {
      id: 'result',
      header: 'Result',
      enableSorting: false,
      meta: { numeric: true },
      cell: ({ row: { original: r } }) => <Result e={r.e} own={r.own} />,
    },
    {
      id: 'time',
      header: () => (
        <Tip content="Median per run: to the finish, or played">
          <span>Time</span>
        </Tip>
      ),
      enableSorting: false,
      meta: { numeric: true, minWidth: COLUMNS_FROM },
      cell: ({ row: { original: r } }) => formatDuration(medianTime(r)),
    },
    {
      id: 'cost',
      header: () => (
        <Tip content="Median per run">
          <span>Cost</span>
        </Tip>
      ),
      enableSorting: false,
      meta: { numeric: true, minWidth: COLUMNS_FROM },
      cell: ({ row: { original: r } }) => formatCost(median(r.own.map(run => run.cost))),
    },
    {
      id: 'runs',
      header: 'Runs',
      enableSorting: false,
      meta: { numeric: true, minWidth: COLUMNS_FROM },
      cell: ({ row: { original: r } }) => formatInt(r.own.length),
    },
  ];
}

/** The eval's page for this model, at one pairing's level and harness when the row is a pairing. */
function evalTarget(model: string, row: EvalRow): LinkProps {
  return {
    to: '/evals/$evalId/$model',
    params: { evalId: evalSlug(row.e.id), model: modelSlug(model) },
    search: (row.pairing
      ? { level: [row.pairing.variant.thinking], harness: [row.pairing.variant.agent] }
      : {}) as never,
  };
}

export function ModelPage(): JSX.Element {
  const { model: slug } = route.useParams();
  const search = route.useSearch();
  const update = useSearchUpdate();
  const navigate = useNavigate();
  const scope = useScope();
  const effort = useEffort();
  const { data } = useSuspenseQuery(indexQuery);

  // Every pairing's scores over all runs, as on Home; this model's are the rows
  const all = useMemo(() => blendedScores(data.evals, data.runs), [data]);
  const everyRun = useMemo(
    () => data.runs.filter(r => modelSlug(r.model) === modelSlug(slug) && inScope(r, scope)),
    [data, slug, scope]
  );
  const model = everyRun[0]?.model;
  const info = modelInfo(model ?? slug);
  useDocumentTitle(info.name);

  // This page's filters, then EthIQ's cut: each harness at its best level by blended score
  const pairings = useMemo(() => {
    const own = all.filter(
      p =>
        p.variant.model === model &&
        inScope(p.variant, scope) &&
        (search.level.length === 0 || search.level.includes(p.variant.thinking)) &&
        (search.harness.length === 0 || search.harness.includes(p.variant.agent))
    );
    if (effort === 'all') return own;
    const keep = bestLevelKeys(own.map(p => p.variant));
    return own.filter(p => keep.has(p.variant.key));
  }, [all, model, scope, search.level, search.harness, effort]);
  const keys = useMemo(() => new Set(pairings.map(p => p.variant.key)), [pairings]);
  const runs = useMemo(() => everyRun.filter(r => keys.has(variantKey(r))), [everyRun, keys]);
  const evals = useMemo(() => data.evals.filter(e => everyRun.some(r => r.eval === e.id)), [data, everyRun]);
  const best = useMemo(() => bests(data.evals, data.runs), [data]);

  // Score and cost by thinking level, every eval's runs together
  const levels = useMemo(() => [...new Set(runs.map(r => r.thinking))].sort(compareThinking), [runs]);
  const series = useMemo(() => harnessSeries(runs), [runs]);
  const byEval = useMemo(() => new Map(data.evals.map(e => [e.id, e])), [data]);
  const scoreMeasure = useMemo<ThinkingMeasure>(
    () => ({
      label: 'Score',
      value: r => {
        const e = byEval.get(r.eval);
        const s = e ? runScore(e, r, best.get(e.id) ?? 0) : null;
        return s == null ? null : s * 100;
      },
      format: v => formatInt(v),
      max: 100,
      empty: 'No run here has a score.',
    }),
    [byEval, best]
  );
  const evalOf = (r: Run): string => byEval.get(r.eval)?.title ?? r.eval;

  const rows = useMemo<Row[]>(() => runs.map(r => ({ ...r, e: byEval.get(r.eval) })), [runs, byEval]);
  const columns = useMemo(() => runColumns(undefined), []);

  // Each eval it ran, then each pairing it ran there when there are several
  const evalRows = useMemo<EvalRow[]>(
    () =>
      model == null
        ? []
        : evals.flatMap(e => {
            const own = runs.filter(r => r.eval === e.id);
            const mine = pairings.filter(p => own.some(r => variantKey(r) === p.variant.key));
            return [
              { id: e.id, e, own, rank: modelRank(all, pairings, e, model) },
              ...(mine.length > 1
                ? mine.map(p => ({
                    id: `${e.id}:${p.variant.key}`,
                    e,
                    own: own.filter(r => variantKey(r) === p.variant.key),
                    pairing: p,
                  }))
                : []),
            ];
          }),
    [model, evals, runs, pairings, all]
  );
  const perEvalColumns = useMemo(() => evalColumns(model ?? slug), [model, slug]);

  if (!model) return <Empty>No runs of this model.</Empty>;

  const harnesses = [...new Map(everyRun.map(r => [r.agent, r])).values()];
  const allLevels = [...new Set(everyRun.map(r => r.thinking))].sort(compareThinking);
  // What the model is, from models.dev (the header bar names it, its maker's mark leads), then what ran
  const facts = modelFacts(model);
  const named = (id: string, mark = true): JSX.Element => (
    <span className="inline-flex items-center gap-1.5 align-middle">
      {mark && <BrandMark slug={id} size={16} />}
      {providerInfo(id).name}
    </span>
  );
  const meta: MetaItem[] = [
    ...(facts?.maker ? [{ term: 'Maker', value: named(facts.maker) }] : []),
    ...(facts?.released ? [{ term: 'Released', value: formatDay(facts.released) }] : []),
    ...(facts?.open_weights != null ? [{ term: 'Weights', value: facts.open_weights ? 'Open' : 'Closed' }] : []),
    ...(facts?.limit.context ? [{ term: 'Context', value: `${formatTokens(facts.limit.context)} tokens` }] : []),
    ...(facts?.knowledge ? [{ term: 'Knowledge', value: formatDay(facts.knowledge) }] : []),
    ...(facts && facts.provider !== facts.maker
      ? [{ term: 'Served by', value: named(facts.provider, providerLogo(facts.provider) != null) }]
      : []),
    {
      term: 'Harnesses',
      value: (
        <span className="inline-flex items-center gap-3 align-middle">
          {harnesses.map(r => (
            <AgentLabel key={r.agent} agent={r.agent} fallback={r.agent_name} size={16} />
          ))}
        </span>
      ),
    },
    {
      term: 'Thinking',
      value: allLevels.map(levelName).join(', '),
    },
  ];

  return (
    <div className={SECTIONS}>
      <PageHeader
        mark={<BrandMark slug={info.vendor.slug} size={40} title={info.vendor.name} />}
        description={facts?.description}
        meta={meta}
      />
      <PageToolbar label="Filters">
        <PairingFilters
          runs={everyRun}
          levels={facts?.levels}
          thinking={search.level}
          agent={search.harness}
          onChange={patch =>
            update(
              { ...(patch.thinking && { level: patch.thinking }), ...(patch.agent && { harness: patch.agent }) },
              { resetPage: true }
            )
          }
        />
      </PageToolbar>

      {pairings.length === 0 ? (
        <Empty>No runs match these filters.</Empty>
      ) : (
        <>
          {/* Each eval: where the model places among the models, what it got, how long and what it cost; each pairing under it when it ran several */}
          <PageSection title="Per eval">
            <DataTable
              data={evalRows}
              columns={perEvalColumns}
              getRowId={r => r.id}
              hoverId={r => r.pairing?.variant.key}
              onRowClick={r => navigate(evalTarget(model, r))}
            />
          </PageSection>

          {/* Thinking levels side by side only when it ran at more than one */}
          {levels.length > 1 && (
            <div className="grid gap-gutter xl:grid-cols-2">
              <PageSection title="Score by thinking level">
                <ThinkingChart runs={runs} measure={scoreMeasure} levels={levels} series={series} evalOf={evalOf} />
              </PageSection>
              <PageSection title="Cost by thinking level">
                <ThinkingChart runs={runs} measure={costMeasure} levels={levels} series={series} evalOf={evalOf} />
              </PageSection>
            </div>
          )}

          <PageSection title="Runs">
            <div className="@container/runs">
              <DataTable
                data={rows}
                columns={columns}
                getRowId={r => r.id}
                hoverId={variantKey}
                sort={search.sort}
                onSortChange={sort => update({ sort }, { resetPage: true })}
                onRowClick={r => navigate({ to: '/runs/$runId', params: { runId: r.id }, search: {} as never })}
                page={search.page}
                pageSize={PAGE_SIZE}
                onPageChange={page => update({ page: page === 1 ? undefined : page })}
                empty="No runs match these filters."
              />
            </div>
          </PageSection>
        </>
      )}
    </div>
  );
}
