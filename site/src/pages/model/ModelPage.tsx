/**
 * `/models/$model`: one model across every eval, the cross-eval counterpart of the model's page on
 * one eval. Its result on each eval at each thinking level and harness, how its score and cost move
 * with thinking level, where it ranks among the models and what each eval cost and took, then its
 * runs. Filtered by thinking level and harness (`level`, `harness`, which a Home row presets) and
 * cut to each harness's best level by the page's `effort`.
 */

import { useMemo } from 'react';
import { getRouteApi, Link, useNavigate } from '@tanstack/react-router';
import { useSuspenseQuery } from '@tanstack/react-query';
import { DataTable } from '@/components/DataTable';
import { Empty } from '@/components/bits';
import { BrandMark, EvalMark, HarnessMark, ThinkingLevel, VariantLabel } from '@/components/marks';
import { PairingFilters } from '@/components/PairingFilters';
import { PageHeader, PageSection, PageToolbar, type MetaItem } from '@/components/page';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { indexQuery } from '@/data/queries';
import type { Eval, Run } from '@/data/types';
import { evalSlug } from '@/lib/evals';
import { formatCost, formatDuration, formatInt } from '@/lib/format';
import { setHovered } from '@/lib/hover';
import { resultValue } from '@/lib/runResult';
import { bestLevelKeys, blendedScores, formatScore, runScore, type Pairing } from '@/lib/score';
import { inScope, useDocumentTitle, useEffort, useScope, useSearchUpdate } from '@/lib/search';
import { compareThinking, modelInfo, modelSlug, NOT_RECORDED, thinkingOf, variantKey } from '@/lib/series';
import { median } from '@/lib/stats';
import { cn } from '@/lib/utils';
import { tint } from '../overview/Leaderboard';
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

/**
 * Where a model places among the models on an eval: its best shown pairing's score there against
 * each other model's best pairing.
 */
function modelRank(all: Pairing[], shown: Pairing[], e: Eval, model: string): { rank: number; of: number } | null {
  const best = new Map<string, number>();
  for (const p of [...all.filter(q => q.variant.model !== model), ...shown]) {
    const s = p.evals.get(e.id)?.score;
    if (s != null) best.set(p.variant.model, Math.max(best.get(p.variant.model) ?? -1, s));
  }
  const own = best.get(model);
  if (own == null) return null;
  return { rank: 1 + [...best.values()].filter(s => s > own).length, of: best.size };
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
        (search.level.length === 0 || search.level.includes(p.variant.thinking ?? '')) &&
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
  const leveled = useMemo(() => runs.filter(r => thinkingOf(r) != null), [runs]);
  const levels = useMemo(() => [...new Set(leveled.map(r => thinkingOf(r)!))].sort(compareThinking), [leveled]);
  const series = useMemo(() => harnessSeries(leveled), [leveled]);
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
  const allLevels = [...new Set(everyRun.map(thinkingOf))].filter(l => l != null).sort(compareThinking);
  const meta: MetaItem[] = [
    { term: 'Evals', value: formatInt(evals.length) },
    { term: 'Runs', value: formatInt(everyRun.length) },
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
      value: <span className="inline-flex flex-wrap items-center gap-x-2 align-middle">{allLevels.length ? allLevels.map(l => <ThinkingLevel key={l} level={l} />) : NOT_RECORDED}</span>,
    },
  ];

  const evalLink = (e: Eval) => ({ to: '/evals/$evalId/$model' as const, params: { evalId: evalSlug(e.id), model: modelSlug(model) } });

  return (
    <div className={SECTIONS}>
      <PageHeader mark={<BrandMark slug={info.vendor.slug} size={40} title={info.vendor.name} />} meta={meta} />
      <PageToolbar label="Filters">
        <PairingFilters
          runs={everyRun}
          thinking={search.level}
          agent={search.harness}
          onChange={patch => update({ ...(patch.thinking && { level: patch.thinking }), ...(patch.agent && { harness: patch.agent }) }, { resetPage: true })}
        />
      </PageToolbar>

      {pairings.length === 0 ? (
        <Empty>No runs match these filters.</Empty>
      ) : (
        <>
          {/* Its result on every eval, a row per thinking level and harness: Home's score, cut by pairing */}
          <PageSection title="On every eval">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead>
                    <span className="sr-only">Pairing</span>
                  </TableHead>
                  <TableHead className="text-right">Score</TableHead>
                  {evals.map(e => (
                    <TableHead key={e.id} className="w-px text-center">
                      <Link {...evalLink(e)} className="inline-flex items-center gap-1.5 whitespace-nowrap hover:underline hover:underline-offset-4" title={e.title}>
                        <EvalMark evalId={e.id} size={16} title="" />
                        {e.title.split(' in ')[0]}
                      </Link>
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {pairings.map(p => (
                  <TableRow key={p.variant.key} onMouseEnter={() => setHovered(p.variant.key)} onMouseLeave={() => setHovered(undefined)}>
                    <TableCell>
                      <span className="flex min-w-0 items-center gap-2">
                        <span aria-hidden className={cn('w-4 shrink-0 border-t-2', p.variant.color.borderClassName, LINE[p.variant.line])} />
                        <VariantLabel variant={p.variant} run={p.sample} compact />
                      </span>
                    </TableCell>
                    <TableCell className="text-right font-medium tabular-nums">{formatScore(p.score)}</TableCell>
                    {evals.map(e => {
                      const s = p.evals.get(e.id);
                      return (
                        <TableCell key={e.id} className="text-center">
                          {s ? (
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Link
                                  {...evalLink(e)}
                                  search={{ ...(p.variant.thinking && { level: [p.variant.thinking] }), harness: [p.variant.agent] } as never}
                                  className={cn('inline-flex h-6 w-10 items-center justify-center rounded-sm tabular-nums', tint(s.score))}
                                >
                                  {formatScore(s.score)}
                                </Link>
                              </TooltipTrigger>
                              <TooltipContent>
                                {e.title}, {s.runs === 1 ? '1 run' : `${formatInt(s.runs)} runs`}
                              </TooltipContent>
                            </Tooltip>
                          ) : (
                            <span className="text-muted-foreground">–</span>
                          )}
                        </TableCell>
                      );
                    })}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </PageSection>

          <div className="grid gap-gutter xl:grid-cols-2">
            <PageSection title="Score by thinking level">
              <ThinkingChart runs={leveled} measure={scoreMeasure} levels={levels} series={series} evalOf={evalOf} />
            </PageSection>
            <PageSection title="Cost by thinking level">
              <ThinkingChart runs={leveled} measure={costMeasure} levels={levels} series={series} evalOf={evalOf} />
            </PageSection>
          </div>

          {/* Each eval: where the model places among the models, what it got, how long and what it cost */}
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
                  <TableHead className="text-right" title="Median per run: to the finish, or played">
                    Time
                  </TableHead>
                  <TableHead className="text-right" title="Median per run">
                    Cost
                  </TableHead>
                  <TableHead className="text-right">Runs</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {evals.map(e => {
                  const own = runs.filter(r => r.eval === e.id);
                  const rank = modelRank(all, pairings, e, model);
                  const target = e.target != null;
                  const finished = own.filter(r => r.success);
                  return (
                    <TableRow key={e.id} className="cursor-pointer" onClick={() => navigate(evalLink(e))}>
                      <TableCell>
                        <Link {...evalLink(e)} className="inline-flex items-center gap-2 whitespace-nowrap hover:underline hover:underline-offset-4">
                          <EvalMark evalId={e.id} size={20} title="" />
                          {e.title}
                        </Link>
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{rank ? place(rank.rank, rank.of) : '–'}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {own.length === 0 ? (
                          '–'
                        ) : target ? (
                          <>
                            {formatInt(finished.length)}
                            <span className="text-muted-foreground"> of {formatInt(own.length)} finished</span>
                          </>
                        ) : (
                          <>
                            {formatInt(median(own.map(resultValue)))}
                            <span className="text-muted-foreground"> {e.measure.toLowerCase()}</span>
                          </>
                        )}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatDuration(target ? median(finished.map(r => r.seconds)) : median(own.map(r => r.game_seconds)))}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{formatCost(median(own.map(r => r.cost)))}</TableCell>
                      <TableCell className="text-right tabular-nums">{formatInt(own.length)}</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </PageSection>

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
