import { useEffect, useMemo } from 'react';
import { getRouteApi, Link, useNavigate } from '@tanstack/react-router';
import { useSuspenseQuery } from '@tanstack/react-query';
import { PageHeader } from '@/components/page';
import { Sprite, VariantLabel } from '@/components/marks';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { indexQuery, runQuery } from '@/data/queries';
import type { Eval, Run, RunDetail } from '@/data/types';
import { questSrc, uiSrc } from '@/lib/assets';
import { evalBase } from '@/lib/evals';
import { formatDuration, formatInt } from '@/lib/format';
import { useDocumentTitle, useSearchUpdate } from '@/lib/search';
import { cn } from '@/lib/utils';
import { Lanes } from './Lanes';
import { makeClock, turnTick, type XMeasure } from './model';
import { usePlayhead } from './playhead';
import { Player } from './Player';
import { RunMap, Scrubber } from './RunMap';
import { runSearch } from './search';
import { Transcript } from './Transcript';

const route = getRouteApi('/runs/$runId');

const headSrc = (id: string): string => `/data/runs/${encodeURIComponent(id)}.head.png`;

/** The value an eval counts, as words: "308 of 500 shrimps cooked", "4 quest points". */
function valuePhrase(evalId: string, measure: string, value: number, target: number | null): string {
  const of = target != null ? ` of ${formatInt(target)}` : '';
  switch (evalBase(evalId)) {
    case 'shrimps':
      return `${formatInt(value)}${of} shrimps cooked`;
    case 'quest_points':
      return `${formatInt(value)}${of} quest point${value === 1 && !of ? '' : 's'}`;
    case 'cooks_assistant':
      return `Quest stage ${formatInt(value)}${of}`;
    default:
      return `${measure} ${formatInt(value)}${of}`;
  }
}

/** The run's result in one line; a quest-points run also shows each quest's icon. */
function Headline({ run, evalInfo, measure }: { run: RunDetail; evalInfo: Eval | undefined; measure: XMeasure }) {
  const quests = run.metrics.quests;
  let text: string;
  if (run.target != null && run.success) {
    const won = run.attempt_results?.find(a => a.ticks != null);
    const time = measure === 'ticks' ? `${formatInt(run.ticks)} ticks` : formatDuration(run.seconds);
    text = `Finished in ${time}${run.attempts > 1 && won ? ` on attempt ${won.attempt}` : ''}`;
  } else {
    const best = Math.max(run.final_value ?? 0, ...(run.attempt_results ?? []).map(a => a.best_value ?? 0));
    text = valuePhrase(run.eval, evalInfo?.measure ?? 'Value', best, run.target);
  }
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
      <span className="font-medium tabular-nums">{text}</span>
      {quests.length > 0 && evalBase(run.eval) === 'quest_points' && (
        <ul className="flex items-center gap-1.5">
          {quests.map(q => {
            const inferred = q.source === 'inferred';
            const name = q.name ?? 'A quest';
            return (
              <li key={`${q.quest}-${q.tick}`}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span tabIndex={0} className={cn('inline-flex rounded-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/50', inferred && 'border-b border-dashed border-muted-foreground')}>
                      <Sprite src={q.quest ? questSrc(q.quest) : uiSrc("quests")} size={20} alt={inferred ? `≈ ${name}` : name} />
                    </span>
                  </TooltipTrigger>
                  <TooltipContent>{inferred ? `≈ ${name}: guessed from the quest-points jump` : name}</TooltipContent>
                </Tooltip>
              </li>
            );
          })}
        </ul>
      )}
    </div>
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
    <nav aria-label="Runs of this variant" className="flex items-center gap-2">
      {arrow(prev, '←', 'Previous run')}
      <span className="text-sm whitespace-nowrap text-muted-foreground tabular-nums">
        <span className="text-foreground">{formatInt(run.epoch)}</span> of {formatInt(siblings.length)}
      </span>
      {arrow(next, '→', 'Next run')}
    </nav>
  );
}

function Header({ run, evalInfo, runs, measure }: { run: RunDetail; evalInfo: Eval | undefined; runs: Run[]; measure: XMeasure }) {
  return (
    <PageHeader
      mark={<img src={headSrc(run.id)} alt="" className="size-10 object-contain" />}
      title={<VariantLabel run={run} size={20} className="gap-2" />}
      description={
        <>
          <Link to="/evals/$evalId" params={{ evalId: run.eval }} className="hover:text-foreground">
            {evalInfo?.title ?? run.eval}
          </Link>
          , epoch {formatInt(run.epoch)}
        </>
      }
      meta={[{ term: 'Result', value: <Headline run={run} evalInfo={evalInfo} measure={measure} /> }]}
      actions={<Siblings run={run} runs={runs} measure={measure} />}
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
  useDocumentTitle(`${evalInfo?.title ?? run.eval}, epoch ${run.epoch}`);

  const clock = useMemo(() => makeClock(run), [run]);
  const selectedTurn = search.turn != null ? run.turns[search.turn - 1] : undefined;
  const selected = search.t ?? (selectedTurn ? turnTick(selectedTurn, clock) : null);

  const update = useSearchUpdate(runSearch);
  const head = usePlayhead(clock, selected, tick => update({ t: tick }));

  return (
    <>
      <Header run={run} evalInfo={evalInfo} runs={index.runs} measure={search.x} />
      {/* The debugger: the game and the agent's thinking side by side, one playhead under both, then
          the lanes and the map on the same playhead. */}
      <div className="grid gap-4 md:gap-6 xl:grid-cols-5">
        <Card className="min-w-0 xl:col-span-3">
          <CardContent className="flex flex-col gap-4">
            <Player run={run} head={head} />
            <Scrubber clock={clock} selected={selected} measure={search.x} />
          </CardContent>
        </Card>
        <div className="min-w-0 xl:col-span-2">{run.turns.length > 0 && <Transcript run={run} clock={clock} search={search} />}</div>
        <div className="min-w-0 xl:col-span-3">
          <Lanes run={run} clock={clock} search={search} price={index.prices[run.model]} />
        </div>
        <Card className="min-w-0 xl:col-span-2 xl:self-start">
          <CardContent>
            <RunMap run={run} clock={clock} selected={head.tick} view={search.map} height={420} fitHeight />
          </CardContent>
        </Card>
      </div>
    </>
  );
}
