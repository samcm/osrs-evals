import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { getRouteApi, Link, useNavigate } from '@tanstack/react-router';
import { useSuspenseQuery } from '@tanstack/react-query';
import { Card } from '@/components/Card';
import { CodeBlock, PageTitle } from '@/components/bits';
import { EvalMark, Sprite, VariantLabel } from '@/components/marks';
import { indexQuery, runQuery } from '@/data/queries';
import type { Eval, Run, RunDetail } from '@/data/types';
import { avatarSrc, questSrc, uiSrc } from '@/lib/assets';
import { evalBase } from '@/lib/evals';
import { formatClock, formatDate, formatDuration, formatInt } from '@/lib/format';
import { useDocumentTitle } from '@/lib/search';
import { useWidth } from '@/lib/useWidth';
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

/** The run's result in one line. */
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
      <p className="text-xl/7 font-semibold text-foreground tabular-nums">{text}</p>
      {quests.length > 0 && evalBase(run.eval) === 'quest_points' && (
        <ul className="flex items-center gap-1.5">
          {quests.map(q => (
            <li key={`${q.quest}-${q.tick}`} className={q.source === 'inferred' ? 'border-b border-dotted border-muted' : undefined}>
              <Sprite
                src={q.quest ? questSrc(q.quest) : uiSrc('quests')}
                size={32}
                alt={`${q.name ?? 'A quest'}${q.source === 'inferred' ? ', inferred from the quest-points jump' : ''}`}
              />
            </li>
          ))}
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
      <Link
        to="/runs/$runId"
        params={{ runId: to.id }}
        search={{ x: measure } as never}
        title={`${label}: epoch ${to.epoch}`}
        aria-label={`${label}: epoch ${to.epoch}`}
        className="inline-flex h-8 w-8 items-center justify-center text-foreground transition-colors hover:bg-background"
      >
        {text}
      </Link>
    ) : (
      <span aria-hidden className="inline-flex h-8 w-8 items-center justify-center text-muted-50">
        {text}
      </span>
    );
  return (
    <nav aria-label="Runs of this variant" className="inline-flex items-center divide-x divide-border rounded-sm bg-surface text-sm outline -outline-offset-1 outline-border">
      {arrow(prev, '←', 'Previous run')}
      <span className="px-3 whitespace-nowrap text-muted tabular-nums">
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
    <header className="flex flex-wrap items-end gap-x-6 gap-y-4">
      <div className="flex min-w-0 flex-1 basis-96 items-end gap-4 sm:gap-6">
        {avatar && (
          <img src={avatarSrc(run.id)} alt="The run's character" onError={() => setAvatar(false)} className="hidden h-32 w-auto shrink-0 sm:block" />
        )}
        <div className="flex min-w-0 flex-col gap-3">
          <div className="flex items-center gap-3">
            <EvalMark evalId={run.eval} size={32} />
            <PageTitle>
              <Link to="/evals/$evalId" params={{ evalId: run.eval }} className="transition-colors hover:text-primary">
                {evalInfo?.title ?? run.eval}
              </Link>
            </PageTitle>
          </div>
          <VariantLabel run={run} size={40} className="flex-wrap gap-y-2 text-lg font-medium text-foreground" />
          <Headline run={run} evalInfo={evalInfo} measure={measure} />
        </div>
      </div>
      <div className="flex items-center gap-3">
        <Siblings run={run} runs={runs} measure={measure} />
        {replay && (
          <a
            href={replay}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex h-8 shrink-0 items-center rounded-sm bg-primary px-3 text-sm font-medium text-on-fill transition-colors hover:bg-primary-hover focus-visible:ring-2 focus-visible:ring-primary-50"
          >
            Watch in 3D
          </a>
        )}
      </div>
    </header>
  );
}

/** The map with its scrubber, and the end-of-run screenshot at the same height. */
function World({ run, clock, selected, search }: { run: RunDetail; clock: Clock; selected: number | null; search: ReturnType<typeof route.useSearch> }) {
  const [ref, width] = useWidth();
  const [gridRef, gridWidth] = useWidth();
  const shot = run.screenshot ? `/data/${run.screenshot}` : null;
  // Side by side, the map takes the screenshot's 16:9 so the two match; stacked, it gets more height
  const sideBySide = shot != null && gridWidth > width * 1.5;
  const height = Math.min(520, Math.max(220, Math.round((width || 400) * (sideBySide ? 9 / 16 : 3 / 4))));
  const shotHeight = Math.round((width || 400) * (9 / 16));
  const panel = 'flex min-w-0 flex-col gap-3 rounded-sm bg-surface p-3 outline -outline-offset-1 outline-border';
  const end = search.x === 'ticks' ? formatInt(clock.maxTicks) : formatClock(clock.maxSeconds);
  return (
    <div ref={gridRef} className={shot ? 'grid gap-6 md:grid-cols-2 xl:grid-cols-1' : 'grid gap-6'}>
      <div className={panel}>
        <div ref={ref} className="min-w-0">
          <RunMap run={run} clock={clock} selected={selected} view={search.map} height={sideBySide ? height : 520} fitHeight={!sideBySide} />
        </div>
        <Scrubber clock={clock} selected={selected} measure={search.x} />
      </div>
      {shot && (
        <figure className={panel}>
          <a href={shot} target="_blank" rel="noopener noreferrer" className="block overflow-hidden rounded-sm bg-background" style={{ height: sideBySide ? height : shotHeight }}>
            <img src={shot} alt="The game at the end of the run" className="size-full object-cover" />
          </a>
          <figcaption className="flex h-7 items-center justify-between gap-3 text-xs text-muted">
            <span>End of the run</span>
            <span className="tabular-nums">{end}</span>
          </figcaption>
        </figure>
      )}
    </div>
  );
}

function Details({ run }: { run: RunDetail }) {
  const mono = (text: string) => <span className="font-mono text-xs/6 break-all">{text}</span>;
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
      <dl className="grid gap-x-8 gap-y-3 sm:grid-cols-2 xl:grid-cols-4">
        {facts.map(([term, value]) => (
          <div key={term} className="min-w-0">
            <dt className="text-xs/5 text-muted">{term}</dt>
            <dd className="text-sm/6 text-foreground">{value}</dd>
          </div>
        ))}
      </dl>
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
    <div className="flex flex-col gap-6">
      <Header run={run} evalInfo={evalInfo} runs={index.runs} measure={search.x} />
      <div className="grid gap-6 xl:grid-cols-5">
        <div className="min-w-0 xl:col-span-3">
          <Lanes run={run} clock={clock} search={search} price={index.prices[run.model]} />
        </div>
        <div className="min-w-0 xl:sticky xl:top-16 xl:col-span-2 xl:col-start-4 xl:row-span-2 xl:row-start-1 xl:self-start">
          <World run={run} clock={clock} selected={selected} search={search} />
        </div>
        <div className="flex min-w-0 flex-col gap-6 xl:col-span-3">
          {run.turns.length > 0 && <Transcript run={run} clock={clock} search={search} />}
          {run.program_output && (
            <Card title="Program output">
              <CodeBlock>{run.program_output}</CodeBlock>
            </Card>
          )}
        </div>
      </div>
      <Details run={run} />
    </div>
  );
}
