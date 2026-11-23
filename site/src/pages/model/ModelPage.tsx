/**
 * `/models/$model`: one model across every eval, the cross-eval counterpart of the model's page on
 * one eval. Its result on each eval at each thinking level and harness, how its score and cost move
 * with thinking level, where it ranks among the models and what each eval cost and took, then its
 * runs. Filtered by thinking level and harness (`level`, `harness`, which a Home row presets) and
 * cut to each harness's best level by the page's `effort`.
 */

import { Fragment, useMemo } from 'react';
import { getRouteApi, Link, useNavigate } from '@tanstack/react-router';
import { useSuspenseQuery } from '@tanstack/react-query';
import { DataTable } from '@/components/DataTable';
import { Empty } from '@/components/bits';
import { BrandMark, EvalMark, HarnessMark, ThinkingLevel, VariantLabel } from '@/components/marks';
import { PairingFilters } from '@/components/PairingFilters';
import { PageHeader, PageSection, PageToolbar, type MetaItem } from '@/components/page';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { indexQuery } from '@/data/queries';
import type { Eval, Run } from '@/data/types';
import { evalSlug } from '@/lib/evals';
import { formatCost, formatDay, formatDuration, formatInt, formatTokens } from '@/lib/format';
import { setHovered } from '@/lib/hover';
import { resultValue } from '@/lib/runResult';
import { bestLevelKeys, blendedScores, modelRank, runScore } from '@/lib/score';
import { inScope, useDocumentTitle, useEffort, useScope, useSearchUpdate } from '@/lib/search';
import { compareThinking, modelFacts, modelInfo, modelSlug, providerInfo, providerLogo, variantKey } from '@/lib/series';
import { median } from '@/lib/stats';
import { cn } from '@/lib/utils';
import { runColumns, type Row } from '../RunsPage';
import { costMeasure, harnessSeries, ThinkingChart, type ThinkingMeasure } from './ThinkingChart';

const route = getRouteApi('/models/$model');
const SECTIONS = 'flex flex-col gap-gutter';
const PAGE_SIZE = 25;
const LINE = { solid: 'border-solid', dashed: 'border-dashed', dotted: 'border-dotted' } as const;

/** "#2 of 7": a place among a field. */
const place = (rank: number, of: number): string => `#${formatInt(rank)} of ${formatInt(of)}`;

/** Each eval's best value, for scoring evals that count how much (lib/score.ts). */
function bests(evals: Eval[], runs: Run[]): Map<string, number> {
  return new Map(evals.map(e => [e.id, Math.max(0, ...runs.filter(r => r.eval === e.id).map(r => resultValue(r) ?? 0))]));
}

/** A set of runs' result on an eval (how many finished, or the median), median time and cost, and count; a phone keeps the result. */
function ResultCells({ e, own }: { e: Eval; own: Run[] }) {
  const target = e.target != null;
  const finished = own.filter(r => r.success);
  return (
    <>
      <TableCell className="text-right tabular-nums">
        {own.length === 0 ? (
          '–'
        ) : target ? (
          <>
            {formatInt(finished.length)}
            <span className="text-muted-foreground">
              {' '}
              of {formatInt(own.length)}
              <span className="max-md:hidden"> finished</span>
            </span>
          </>
        ) : (
          <>
            {formatInt(median(own.map(resultValue)))}
            <span className="text-muted-foreground max-md:hidden"> {e.measure.toLowerCase()}</span>
          </>
        )}
      </TableCell>
      <TableCell className="text-right tabular-nums max-md:hidden">{formatDuration(target ? median(finished.map(r => r.seconds)) : median(own.map(r => r.game_seconds)))}</TableCell>
      <TableCell className="text-right tabular-nums max-md:hidden">{formatCost(median(own.map(r => r.cost)))}</TableCell>
      <TableCell className="text-right tabular-nums max-md:hidden">{formatInt(own.length)}</TableCell>
    </>
  );
}

export function ModelPage() {
  const { model: slug } = route.useParams();
  const search = route.useSearch();
  const update = useSearchUpdate();
  const navigate = useNavigate();
  const scope = useScope();
  const effort = useEffort();
  const { data } = useSuspenseQuery(indexQuery);

  // Every pairing's scores over all runs, as on Home; this model's are the rows
  const all = useMemo(() => blendedScores(data.evals, data.runs), [data]);
  const everyRun = useMemo(() => data.runs.filter(r => modelSlug(r.model) === modelSlug(slug) && inScope(r, scope)), [data, slug, scope]);
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
  const evalOf = (r: Run) => byEval.get(r.eval)?.title ?? r.eval;

  const rows = useMemo<Row[]>(() => runs.map(r => ({ ...r, e: byEval.get(r.eval) })), [runs, byEval]);
  const columns = useMemo(() => runColumns(undefined), []);

  if (!model) return <Empty>No runs of this model.</Empty>;

  const harnesses = [...new Map(everyRun.map(r => [r.agent, r])).values()];
  const allLevels = [...new Set(everyRun.map(r => r.thinking))].sort(compareThinking);
  // What the model is, from models.dev (the header bar names it, its maker's mark leads), then what ran
  const facts = modelFacts(model);
  const named = (id: string, mark = true) => (
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
    ...(facts && facts.provider !== facts.maker ? [{ term: 'Served by', value: named(facts.provider, providerLogo(facts.provider) != null) }] : []),
    {
      term: 'Harnesses',
      value: (
        <span className="inline-flex items-center gap-1.5 align-middle">
          {harnesses.map(r => (
            <HarnessMark key={r.agent} agent={r.agent} fallback={r.agent_name} size={16} className="bg-foreground" />
          ))}
        </span>
      ),
    },
    {
      term: 'Thinking',
      value: <span className="inline-flex flex-wrap items-center gap-x-2 align-middle">{allLevels.map(l => <ThinkingLevel key={l} level={l} />)}</span>,
    },
  ];

  const evalLink = (e: Eval) => ({ to: '/evals/$evalId/$model' as const, params: { evalId: evalSlug(e.id), model: modelSlug(model) } });

  return (
    <div className={SECTIONS}>
      <PageHeader mark={<BrandMark slug={info.vendor.slug} size={40} title={info.vendor.name} />} description={facts?.description} meta={meta} />
      <PageToolbar label="Filters">
        <PairingFilters
          runs={everyRun}
          levels={facts?.levels}
          thinking={search.level}
          agent={search.harness}
          onChange={patch => update({ ...(patch.thinking && { level: patch.thinking }), ...(patch.agent && { harness: patch.agent }) }, { resetPage: true })}
        />
      </PageToolbar>

      {pairings.length === 0 ? (
        <Empty>No runs match these filters.</Empty>
      ) : (
        <>
          {/* Each eval: where the model places among the models, what it got, how long and what it cost; each pairing under it when it ran several */}
          <PageSection title="Per eval">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead>
                    <span className="sr-only">Eval</span>
                  </TableHead>
                  <TableHead className="text-right" title="Among the models, by each one's best pairing">
                    Place
                  </TableHead>
                  <TableHead className="text-right">Result</TableHead>
                  <TableHead className="text-right max-md:hidden" title="Median per run: to the finish, or played">
                    Time
                  </TableHead>
                  <TableHead className="text-right max-md:hidden" title="Median per run">
                    Cost
                  </TableHead>
                  <TableHead className="text-right max-md:hidden">Runs</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {evals.map(e => {
                  const own = runs.filter(r => r.eval === e.id);
                  const rank = modelRank(all, pairings, e, model);
                  // Each pairing it ran here as its own row under the eval's, when there are several
                  const mine = pairings.filter(p => own.some(r => variantKey(r) === p.variant.key));
                  return (
                    <Fragment key={e.id}>
                      <TableRow className="cursor-pointer" onClick={() => navigate(evalLink(e))}>
                        <TableCell>
                          <Link {...evalLink(e)} className="inline-flex max-w-full items-center gap-2 whitespace-nowrap hover:underline hover:underline-offset-4" title={e.title}>
                            <EvalMark evalId={e.id} size={20} title="" />
                            {/* A phone keeps the name short, so the place and result stay in view */}
                            <span className="truncate max-md:max-w-28">{e.title}</span>
                          </Link>
                        </TableCell>
                        <TableCell className="text-right tabular-nums">{rank ? place(rank.rank, rank.of) : '–'}</TableCell>
                        <ResultCells e={e} own={own} />
                      </TableRow>
                      {mine.length > 1 &&
                        mine.map(p => (
                          <TableRow
                            key={p.variant.key}
                            className="cursor-pointer"
                            onMouseEnter={() => setHovered(p.variant.key)}
                            onMouseLeave={() => setHovered(undefined)}
                            onClick={() => navigate({ ...evalLink(e), search: { level: [p.variant.thinking], harness: [p.variant.agent] } as never })}
                          >
                            <TableCell>
                              <span className="flex min-w-0 items-center gap-2 pl-7 max-md:pl-2">
                                <span aria-hidden className={cn('w-4 shrink-0 border-t-2 max-md:hidden', p.variant.color.borderClassName, LINE[p.variant.line])} />
                                <VariantLabel variant={p.variant} run={p.sample} compact />
                              </span>
                            </TableCell>
                            <TableCell />
                            <ResultCells e={e} own={own.filter(r => variantKey(r) === p.variant.key)} />
                          </TableRow>
                        ))}
                    </Fragment>
                  );
                })}
              </TableBody>
            </Table>
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
