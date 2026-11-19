import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { getRouteApi, Link, useNavigate } from '@tanstack/react-router';
import { useSuspenseQuery } from '@tanstack/react-query';
import { CodeBlock, PageTitle } from '@/components/bits';
import { EvalMark, Sprite, VariantLabel } from '@/components/marks';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { indexQuery, runQuery } from '@/data/queries';
import type { Eval, Run, RunDetail } from '@/data/types';
import { avatarSrc, questSrc, uiSrc } from '@/lib/assets';
import { evalBase } from '@/lib/evals';
import { formatClock, formatDate, formatDuration, formatInt } from '@/lib/format';
import { useDocumentTitle } from '@/lib/search';
import { useWidth } from '@/lib/useWidth';
import { cn } from '@/lib/utils';
import { Lanes } from './Lanes';
import { makeClock, turnTick, type Clock, type XMeasure } from './model';
import { RunMap, Scrubber } from './RunMap';
import { Transcript } from './Transcript';

const route = getRouteApi('/runs/$runId');

/** Where to watch the run: its replay URL, or the live world viewer on this host when a replay was recorded. */
function replayHref(run: RunDetail): string | null {
  if (run.replay_url) return run.replay_url;
  if (!run.has_replay) return null;
  const ws = window.location.protocol === 'https:' ? 'wss' : 'ws';
  const live = `${ws}://${window.location.host}/feed/${run.id}`;
  return `/world/?live=${encodeURIComponent(live)}&follow=${encodeURIComponent(run.account)}`;
}

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
      <p className="text-xl font-semibold tabular-nums">{text}</p>
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
                      <Sprite src={q.quest ? questSrc(q.quest) : uiSrc('quests')} size={32} alt={inferred ? `≈ ${name}` : name} />
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
  const [avatar, setAvatar] = useState(true);
  const replay = replayHref(run);
  return (
    <header className="flex flex-wrap items-end justify-between gap-4">
      <div className="flex min-w-0 items-end gap-6">
        {avatar && <img src={avatarSrc(run.id)} alt="The run's character" onError={() => setAvatar(false)} className="hidden h-32 w-auto shrink-0 sm:block" />}
        <div className="flex min-w-0 flex-col gap-3">
          <div className="flex items-center gap-3">
            <EvalMark evalId={run.eval} size={32} />
            <PageTitle>
              <Link to="/evals/$evalId" params={{ evalId: run.eval }} className="transition-colors hover:text-primary">
                {evalInfo?.title ?? run.eval}
              </Link>
            </PageTitle>
          </div>
          <VariantLabel run={run} size={40} className="flex-wrap gap-y-2 text-lg font-medium" />
          <Headline run={run} evalInfo={evalInfo} measure={measure} />
        </div>
      </div>
      <div className="flex items-center gap-4">
        <Siblings run={run} runs={runs} measure={measure} />
        {replay && (
          <Button asChild>
            <a href={replay} target="_blank" rel="noopener noreferrer">
              Watch in 3D
            </a>
          </Button>
        )}
      </div>
    </header>
  );
}

/** The map with its scrubber, and the end-of-run screenshot: the same height when side by side. */
function World({ run, clock, selected, search }: { run: RunDetail; clock: Clock; selected: number | null; search: ReturnType<typeof route.useSearch> }) {
  const [ref, width] = useWidth();
  const [gridRef, gridWidth] = useWidth();
  const shot = run.screenshot ? `/data/${run.screenshot}` : null;
  const sideBySide = shot != null && gridWidth > width * 1.5;
  const shotHeight = Math.round((width || 400) * (9 / 16));
  const end = search.x === 'ticks' ? formatInt(clock.maxTicks) : formatClock(clock.maxSeconds);
  return (
    <div ref={gridRef} className={cn('grid gap-4 md:gap-6', shot && 'md:grid-cols-2 xl:grid-cols-1')}>
      <Card>
        <CardContent className="flex flex-col gap-4">
          <div ref={ref} className="min-w-0 overflow-hidden rounded-lg">
            {/* Beside the screenshot the map matches its height; stacked, it takes the path's shape */}
            <RunMap run={run} clock={clock} selected={selected} view={search.map} height={sideBySide ? shotHeight : Math.round((width || 400) * 0.75)} fitHeight={!sideBySide} />
          </div>
          <Scrubber clock={clock} selected={selected} measure={search.x} />
        </CardContent>
      </Card>
      {shot && (
        <Card>
          <CardContent className="flex flex-col gap-4">
            <a href={shot} target="_blank" rel="noopener noreferrer" className="block overflow-hidden rounded-lg bg-muted" style={{ height: shotHeight }}>
              <img src={shot} alt="The game at the end of the run" className="size-full object-cover" />
            </a>
            <div className="flex h-8 items-center justify-between gap-3 text-xs text-muted-foreground">
              <span>End of the run</span>
              <span className="tabular-nums">{end}</span>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function Details({ run }: { run: RunDetail }) {
  const mono = (text: string) => <span className="font-mono text-xs break-all">{text}</span>;
  const facts: [string, ReactNode][] = [['Run', mono(run.id)]];
  if (run.model_calls > 0) facts.push(['Model', mono(run.model)]);
  if (run.agent_version) facts.push([`${run.agent_name} version`, mono(run.agent_version)]);
  if (run.agent_params.cmd) facts.push(['Command', mono(run.agent_params.cmd)]);
  facts.push(['Started', `${formatDate(run.sample_started ?? run.started)} UTC`]);
  facts.push(['Account', mono(run.account)]);
  if (run.ended_by) facts.push(['Ended by', run.ended_by.charAt(0).toUpperCase() + run.ended_by.slice(1)]);
  if (run.commit) facts.push(['Commit', mono(run.commit)]);
  facts.push(['Batch', mono(run.batch)]);
  facts.push(['Log', mono(run.log)]);
  return (
    <Card>
      <CardContent>
        <dl className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {facts.map(([term, value]) => (
            <div key={term} className="flex min-w-0 flex-col gap-1">
              <dt className="text-xs text-muted-foreground">{term}</dt>
              <dd>{value}</dd>
            </div>
          ))}
        </dl>
      </CardContent>
    </Card>
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

  return (
    <>
      <Header run={run} evalInfo={evalInfo} runs={index.runs} measure={search.x} />
      <div className="grid gap-4 md:gap-6 xl:grid-cols-5">
        <div className="min-w-0 xl:col-span-3">
          <Lanes run={run} clock={clock} search={search} price={index.prices[run.model]} />
        </div>
        {/* Beside the lanes on wide screens, and kept in view, so the map follows the crosshair */}
        <div className="min-w-0 xl:sticky xl:top-18 xl:col-span-2 xl:col-start-4 xl:row-span-2 xl:row-start-1 xl:self-start">
          <World run={run} clock={clock} selected={selected} search={search} />
        </div>
        <div className="flex min-w-0 flex-col gap-4 md:gap-6 xl:col-span-3">
          {run.turns.length > 0 && <Transcript run={run} clock={clock} search={search} />}
          {run.program_output && (
            <Card>
              <CardHeader>
                <CardTitle>Program output</CardTitle>
              </CardHeader>
              <CardContent>
                <CodeBlock>{run.program_output}</CodeBlock>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
      <Details run={run} />
    </>
  );
}
