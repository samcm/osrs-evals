import { useEffect, useMemo, type ReactNode } from 'react';
import { getRouteApi, Link, useNavigate } from '@tanstack/react-router';
import { useSuspenseQuery } from '@tanstack/react-query';
import { Outcome } from '@/components/bits';
import { PageHeader, PageSection, type MetaItem } from '@/components/page';
import { Sprite, VariantLabel } from '@/components/marks';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { indexQuery, runQuery } from '@/data/queries';
import type { Eval, Run, RunDetail } from '@/data/types';
import { questSrc, uiSrc } from '@/lib/assets';
import { evalBase } from '@/lib/evals';
import { capitalize, formatDate, formatDuration, formatInt } from '@/lib/format';
import { modelInfo } from '@/lib/series';
import { resultValue } from '@/lib/runResult';
import { useDocumentTitle, useSearchUpdate } from '@/lib/search';
import { cn } from '@/lib/utils';
import { Lanes } from './Lanes';
import { makeClock, turnTick, type XMeasure } from './model';
import { usePlayhead } from './playhead';
import { Player } from './Player';
import { Playback } from './Playback';
import { RunMap } from './RunMap';
import { runSearch } from './search';
import { Transcript } from './Transcript';

const route = getRouteApi('/runs/$runId');

const headSrc = (id: string): string => `/data/runs/${encodeURIComponent(id)}.head.png`;

/** Each quest the run completed, as its icon; an inferred one is underlined and says why. */
function QuestIcons({ quests }: { quests: RunDetail['metrics']['quests'] }) {
  return (
    <ul className="flex items-center gap-1.5">
      {quests.map(q => {
        const inferred = q.source === 'inferred';
        const name = q.name ?? 'A quest';
        return (
          <li key={`${q.quest}-${q.tick}`} className="flex">
            <Tooltip>
              <TooltipTrigger asChild>
                <span tabIndex={0} className={cn('inline-flex rounded-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/50', inferred && 'border-b border-dashed border-muted-foreground')}>
                  <Sprite src={q.quest ? questSrc(q.quest) : uiSrc('quests')} size={20} alt={inferred ? `≈ ${name}` : name} />
                </span>
              </TooltipTrigger>
              <TooltipContent>{inferred ? `≈ ${name}: guessed from the quest-points jump` : name}</TooltipContent>
            </Tooltip>
          </li>
        );
      })}
    </ul>
  );
}

/**
 * The run's result as header meta, each value its own term. A run with a target: whether it
 * finished, then how long it took (in the lanes' unit) and on which attempt, or how far it got. A
 * run without one (quest points): its score, with each quest's icon.
 */
function resultMeta(run: RunDetail, evalInfo: Eval | undefined, measure: XMeasure): MetaItem[] {
  const term = evalInfo?.measure ?? 'Score';
  const value = resultValue(run) ?? 0;
  if (run.target == null) {
    const quests = evalBase(run.eval) === 'quest_points' ? run.metrics.quests : [];
    return [
      {
        term,
        value: (
          <span className="flex items-center gap-3">
            {formatInt(value)}
            {quests.length > 0 && <QuestIcons quests={quests} />}
          </span>
        ),
      },
    ];
  }
  const meta: MetaItem[] = [{ term: 'Result', value: <Outcome run={run} /> }];
  if (run.success) {
    meta.push({ term: 'Time', value: measure === 'ticks' ? `${formatInt(run.ticks)} ticks` : formatDuration(run.seconds) });
    const won = run.attempt_results?.find(a => a.ticks != null);
    if (run.attempts > 1 && won) meta.push({ term: 'Attempt', value: formatInt(won.attempt) });
  } else {
    meta.push({ term, value: `${formatInt(value)} of ${formatInt(run.target)}` });
  }
  return meta;
}

/** The facts a reader rarely needs but a debugger does (where the log is, which commit), behind the run id. */
function RunFacts({ run }: { run: RunDetail }) {
  const mono = (text: string) => <span className="font-mono text-xs break-all">{text}</span>;
  const facts: [string, ReactNode][] = [];
  if (run.model_calls > 0) facts.push(['Model', mono(run.model)]);
  if (run.agent_version) facts.push([run.agent_name, mono(run.agent_version)]);
  facts.push(['Character', mono(run.account)]);
  facts.push(['Started', `${formatDate(run.sample_started ?? run.started)} UTC`]);
  if (run.ended_by) facts.push(['Ended by', capitalize(run.ended_by)]);
  if (run.commit) facts.push(['Commit', mono(run.commit)]);
  facts.push(['Log', mono(run.log)]);
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="sm" className="font-mono text-muted-foreground">
          {run.id}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80">
        <dl className="flex flex-col gap-2">
          {facts.map(([term, value]) => (
            <div key={term} className="flex min-w-0 flex-col">
              <dt className="text-xs text-muted-foreground">{term}</dt>
              <dd>{value}</dd>
            </div>
          ))}
        </dl>
      </PopoverContent>
    </Popover>
  );
}

/** The run before and after this one of the same eval and variant, by epoch; ← and → go there. */
function Siblings({ run, runs, measure }: { run: RunDetail; runs: Run[]; measure: XMeasure }) {
  const navigate = useNavigate();
  const siblings = useMemo(
    () => runs.filter(r => r.eval === run.eval && r.model === run.model && r.agent === run.agent).sort((a, b) => a.epoch - b.epoch || a.id.localeCompare(b.id)),
    [runs, run.eval, run.model, run.agent]
  );
  const at = siblings.findIndex(r => r.id === run.id);
  const prev = at > 0 ? siblings[at - 1] : undefined;
  const next = at >= 0 && at + 1 < siblings.length ? siblings[at + 1] : undefined;

  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
      if ((event.target as HTMLElement | null)?.closest('input, textarea, select, [contenteditable], [role=slider]')) return;
      const to = event.key === 'ArrowLeft' ? prev : event.key === 'ArrowRight' ? next : undefined;
      if (!to) return;
      event.preventDefault();
      navigate({ to: '/runs/$runId', params: { runId: to.id }, search: { x: measure } as never });
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [navigate, prev, next, measure]);

  if (siblings.length < 2) return null;
  const arrow = (to: Run | undefined, text: string, label: string) =>
    to ? (
      <Tooltip>
        <TooltipTrigger asChild>
          <Button variant="outline" size="icon" asChild>
            <Link to="/runs/$runId" params={{ runId: to.id }} search={{ x: measure } as never} aria-label={`${label}: epoch ${to.epoch}`}>
              {text}
            </Link>
          </Button>
        </TooltipTrigger>
        <TooltipContent>Epoch {to.epoch}</TooltipContent>
      </Tooltip>
    ) : (
      <Button variant="outline" size="icon" disabled aria-label={label}>
        {text}
      </Button>
    );
  return (
    <nav aria-label="Epochs of this pairing" className="flex items-center gap-2">
      {arrow(prev, '←', 'Previous epoch')}
      <span className="text-sm whitespace-nowrap text-muted-foreground tabular-nums">
        <span className="text-foreground">{formatInt(at + 1)}</span> of {formatInt(siblings.length)}
      </span>
      {arrow(next, '→', 'Next epoch')}
    </nav>
  );
}

/** The character, the pairing (vendor mark, model, harness), the eval and epoch, the result as meta; the run id and the other epochs on the right. */
function Header({ run, evalInfo, runs, measure }: { run: RunDetail; evalInfo: Eval | undefined; runs: Run[]; measure: XMeasure }) {
  return (
    <PageHeader
      mark={<img src={headSrc(run.id)} alt={run.account} className="size-10 object-contain" />}
      title={<VariantLabel run={run} size={20} className="flex-wrap gap-2" />}
      description={
        <>
          <Link to="/evals/$evalId" params={{ evalId: run.eval }} className="hover:text-foreground">
            {evalInfo?.title ?? run.eval}
          </Link>
          , epoch {formatInt(run.epoch)}
        </>
      }
      meta={resultMeta(run, evalInfo, measure)}
      actions={
        <>
          <RunFacts run={run} />
          <Siblings run={run} runs={runs} measure={measure} />
        </>
      }
    />
  );
}


export function RunPage() {
  const { runId } = route.useParams();
  const search = route.useSearch();
  const { data: detail } = useSuspenseQuery(runQuery(runId));
  const { data: index } = useSuspenseQuery(indexQuery);
  // The index summary may carry fields the detail file lacks, such as a screenshot added later
  const run = useMemo<RunDetail>(() => {
    const summary = index.runs.find(r => r.id === runId);
    return { ...summary, ...detail, screenshot: detail.screenshot ?? summary?.screenshot, replay_url: detail.replay_url ?? summary?.replay_url };
  }, [detail, index.runs, runId]);
  const evalInfo = index.evals.find(e => e.id === run.eval);
  useDocumentTitle(`${modelInfo(run.model).name}, ${evalInfo?.title ?? run.eval}, epoch ${run.epoch}`);

  const clock = useMemo(() => makeClock(run), [run]);
  const selectedTurn = search.turn != null ? run.turns[search.turn - 1] : undefined;
  const selected = search.t ?? (selectedTurn ? turnTick(selectedTurn, clock) : null);

  const update = useSearchUpdate(runSearch);
  const head = usePlayhead(clock, selected, tick => update({ t: tick }));

  /*
   * The debugger, on one playhead. The lead band is the main screen: the game with its playback bar
   * attached, and the agent's thinking beside it on wide screens (it takes the game's height and
   * scrolls inside; contain-size keeps it from growing the row). Then the timeline: the lanes, with
   * the map beside them, sticking under the site header while the lanes scroll past.
   */
  return (
    <>
      <Header run={run} evalInfo={evalInfo} runs={index.runs} measure={search.x} />
      <PageSection lead>
        <div className="grid gap-gutter xl:grid-cols-5">
          <div className="min-w-0 xl:col-span-3">
            <Player run={run} head={head} />
            <Playback run={run} clock={clock} measure={search.x} />
          </div>
          {run.turns.length > 0 && (
            <div className="h-120 min-w-0 xl:col-span-2 xl:h-auto xl:contain-size">
              <Transcript run={run} clock={clock} search={search} tick={head.tick} />
            </div>
          )}
        </div>
      </PageSection>
      <Lanes
        run={run}
        clock={clock}
        search={search}
        price={index.prices[run.model]}
        aside={<RunMap run={run} clock={clock} view={search.map} height={420} fitHeight />}
      />
    </>
  );
}
