import type { ReactNode } from 'react';
import { getRouteApi, Link } from '@tanstack/react-router';
import { useSuspenseQuery } from '@tanstack/react-query';
import clsx from 'clsx';
import { Card } from '@/components/Card';
import { Stats, type Stat } from '@/components/Stats';
import { AgentLabel, CodeBlock, Disclosure, EvalSprites, ModelLabel, Outcome, PageTitle } from '@/components/bits';
import { indexQuery, runQuery } from '@/data/queries';
import type { Action, RunDetail, Turn } from '@/data/types';
import { evalArt, hasTarget } from '@/lib/evals';
import { formatClock, formatCost, formatDate, formatDecimal, formatInt, formatPercent, formatSeconds, formatTokens } from '@/lib/format';
import { useDocumentTitle } from '@/lib/search';
import { ScoreChart, TurnTimeline } from './charts';

const route = getRouteApi('/runs/$runId');

/** Where to watch the run: its replay URL, or the live world viewer on this host when a replay was recorded. */
function replayHref(run: RunDetail): string | null {
  if (run.replay_url) return run.replay_url;
  if (!run.has_replay) return null;
  const ws = window.location.protocol === 'https:' ? 'wss' : 'ws';
  const live = `${ws}://${window.location.host}/feed/${run.id}`;
  return `/world/?live=${encodeURIComponent(live)}&follow=${encodeURIComponent(run.account)}`;
}

function Header({ run, evalTitle, replay }: { run: RunDetail; evalTitle: string; replay: string | null }) {
  const facts: [string, ReactNode][] = [
    ['Model', <ModelLabel model={run.model} />],
    ['Agent', <AgentLabel agent={run.agent} fallback={run.agent_name} />],
    ['Epoch', formatInt(run.epoch)],
    ['Outcome', <Outcome run={run} />],
    ['Started', `${formatDate(run.started)} UTC`],
    ['Account', <span className="font-mono text-xs/6">{run.account}</span>],
  ];
  if (run.commit) facts.push(['Commit', <span className="font-mono text-xs/6">{run.commit}</span>]);
  if (run.agent_params.cmd) facts.push(['Command', <span className="font-mono text-xs/6 break-all">{run.agent_params.cmd}</span>]);
  if (run.agent_params.version) facts.push(['Agent version', <span className="font-mono text-xs/6">{run.agent_params.version}</span>]);
  facts.push(['Log', <span className="font-mono text-xs/6 break-all">{run.log}</span>]);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <EvalSprites evalId={run.eval} size="lg" />
        <div className="min-w-0 flex-1 basis-60">
          <PageTitle>
            <Link to="/evals/$evalId" params={{ evalId: run.eval }} className="transition-colors hover:text-primary">
              {evalTitle}
            </Link>
          </PageTitle>
          <div className="font-mono text-xs/5 break-all text-muted">{run.id}</div>
        </div>
        {replay && <WatchLink href={replay} />}
      </div>
      <dl className="flex flex-wrap gap-x-8 gap-y-3">
        {facts.map(([term, value]) => (
          <div key={term} className="min-w-0">
            <dt className="text-xs/5 text-muted">{term}</dt>
            <dd className="text-sm/6 text-foreground">{value}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

function WatchLink({ href }: { href: string }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex h-8 shrink-0 items-center rounded-sm bg-primary px-3 text-sm font-medium text-on-fill transition-colors hover:bg-primary-hover focus-visible:ring-2 focus-visible:ring-primary-50"
    >
      Watch in 3D
    </a>
  );
}

function kpis(run: RunDetail): Stat[] {
  const finishedCell: Stat = hasTarget(run)
    ? run.success
      ? { name: 'Ticks to finish', value: formatInt(run.ticks), unit: `${formatSeconds(run.seconds)} s wall-clock` }
      : { name: 'Ticks to finish', value: 'Not finished', valueClassName: 'text-danger', unit: `${formatInt(run.game_ticks)} ticks played` }
    : { name: evalArt(run.eval).measure, value: formatInt(run.final_value ?? run.score), unit: 'at the end' };
  const common: Stat[] = [
    finishedCell,
    { name: 'Run length', value: formatSeconds(run.game_seconds), unit: 's wall-clock' },
    { name: 'Cost', value: formatCost(run.cost), unit: 'at list price' },
  ];
  // A program that never calls a model has no model numbers to show
  if (run.model_calls === 0) return common;
  return [
    ...common,
    { name: 'Model calls', value: formatInt(run.model_calls) },
    { name: 'Tool calls', value: formatInt(run.tool_calls) },
    { name: 'Input tokens', value: formatTokens(run.input_tokens) },
    { name: 'Output tokens', value: formatTokens(run.output_tokens) },
    { name: 'Output tok/s', value: formatDecimal(run.output_tokens_per_second) },
    {
      name: 'Waiting on model',
      value: formatPercent(run.game_seconds ? Math.min(1, run.model_seconds / run.game_seconds) : null),
      unit: `${formatSeconds(run.model_seconds)} s`,
    },
  ];
}

function TurnFacts({ index, turn }: { index: number; turn: Turn }) {
  const facts: [string, string][] = [
    ['At', formatClock(turn.at)],
    ['Model', `${formatSeconds(turn.model_seconds)} s`],
    ['Input', formatTokens(turn.input_tokens)],
    ['Output', formatTokens(turn.output_tokens)],
  ];
  return (
    <div className="flex flex-wrap items-baseline gap-x-5 gap-y-1">
      <h3 className="text-sm font-semibold text-foreground">Turn {index + 1}</h3>
      <dl className="flex flex-wrap gap-x-4 gap-y-1 text-xs/5 tabular-nums">
        {facts.map(([term, value]) => (
          <div key={term} className="flex gap-1.5">
            <dt className="text-muted">{term}</dt>
            <dd className="text-foreground">{value}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

function ActionBlock({ action }: { action: Action }) {
  const lines = action.output ? action.output.split('\n').length : 0;
  return (
    <div className="flex flex-col gap-1.5">
      <div className="font-mono text-xs/5 text-muted">{action.tool}</div>
      <CodeBlock>{action.input}</CodeBlock>
      {action.error && <CodeBlock tone="danger">Error: {action.error}</CodeBlock>}
      {action.output != null && action.output !== '' && (
        <Disclosure title="Output" meta={lines === 1 ? '1 line' : `${formatInt(lines)} lines`}>
          <CodeBlock>{action.output}</CodeBlock>
        </Disclosure>
      )}
    </div>
  );
}

function Transcript({ run }: { run: RunDetail }) {
  return (
    <Card title="Transcript" subtitle={`${formatInt(run.turns.length)} model calls`}>
      <div className="flex flex-col gap-6">
        {run.prompt && (
          <Disclosure title="Initial prompt">
            <CodeBlock>{run.prompt}</CodeBlock>
          </Disclosure>
        )}
        <ol className="flex flex-col divide-y divide-border">
          {run.turns.map((turn, i) => (
            <li key={i} id={`turn-${i + 1}`} className="flex scroll-mt-16 flex-col gap-3 py-5 first:pt-0 last:pb-0">
              <TurnFacts index={i} turn={turn} />
              {turn.text && <p className="max-w-4xl text-sm/6 wrap-break-word whitespace-pre-wrap text-foreground">{turn.text}</p>}
              {turn.error && <CodeBlock tone="danger">Error: {turn.error}</CodeBlock>}
              {turn.actions.map((action, j) => (
                <ActionBlock key={j} action={action} />
              ))}
            </li>
          ))}
        </ol>
      </div>
    </Card>
  );
}

function AttemptsTable({ run }: { run: RunDetail }) {
  const results = run.attempt_results ?? [];
  const cell = 'py-2.5 pl-3 pr-3 text-sm whitespace-nowrap tabular-nums';
  return (
    <Card title="Attempts" flush>
      <div className="scrollbar-thin table-inset inset-from-card overflow-x-auto">
        <table className="min-w-full divide-y divide-border">
          <thead>
            <tr className="text-xs font-medium text-muted">
              <th scope="col" className="py-2.5 pr-3 pl-table-inset text-left font-medium">Attempt</th>
              <th scope="col" className="px-3 py-2.5 text-left font-medium">Outcome</th>
              <th scope="col" className="px-3 py-2.5 text-right font-medium">Ticks to finish</th>
              <th scope="col" className="px-3 py-2.5 text-right font-medium">Seconds to finish</th>
              <th scope="col" className="py-2.5 pr-table-inset pl-3 text-right font-medium">Best {evalArt(run.eval).measure.toLowerCase()}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {results.map(a => (
              <tr key={a.attempt} className="transition-colors hover:bg-background">
                <td className={clsx(cell, 'pl-table-inset')}>{a.attempt}</td>
                <td className={cell}>
                  <Outcome run={{ success: a.ticks != null }} />
                </td>
                <td className={clsx(cell, 'text-right')}>{formatInt(a.ticks)}</td>
                <td className={clsx(cell, 'text-right')}>{formatSeconds(a.seconds)}</td>
                <td className={clsx(cell, 'pr-table-inset text-right')}>{formatInt(a.best_value)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

export function RunPage() {
  const { runId } = route.useParams();
  const { data: run } = useSuspenseQuery(runQuery(runId));
  const { data: index } = useSuspenseQuery(indexQuery);
  // The index summary may carry fields the detail file lacks, such as a screenshot added later
  const summary = index.runs.find(r => r.id === runId);
  const merged: RunDetail = { ...summary, ...run, screenshot: run.screenshot ?? summary?.screenshot, replay_url: run.replay_url ?? summary?.replay_url };
  const evalTitle = index.evals.find(e => e.id === run.eval)?.title ?? run.eval;
  useDocumentTitle(`${evalTitle} run ${run.id}`);

  const replay = replayHref(merged);
  const showShot = Boolean(merged.screenshot);

  const scrollToTurn = (turn: number): void => {
    document.getElementById(`turn-${turn}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  return (
    <div className="flex flex-col gap-6">
      <Header run={merged} evalTitle={evalTitle} replay={replay} />
      <Stats stats={kpis(merged)} className="grid-cols-2 sm:grid-cols-3" />

      <div className={clsx('grid gap-6', showShot && 'xl:grid-cols-3')}>
        <div className={clsx('min-w-0', showShot && 'xl:col-span-2')}>
          <ScoreChart run={merged} />
        </div>
        {showShot && (
          <Card title="End of the run">
            <img
              src={`/data/${merged.screenshot}`}
              alt="The game at the end of the run"
              className="w-full rounded-sm outline -outline-offset-1 outline-border"
            />
          </Card>
        )}
      </div>

      {merged.turns.length > 0 && <TurnTimeline run={merged} onTurn={scrollToTurn} />}

      {merged.attempts > 1 && (merged.attempt_results?.length ?? 0) > 0 && <AttemptsTable run={merged} />}

      {merged.turns.length > 0 && <Transcript run={merged} />}

      {merged.answer && (
        <Card title="Final answer">
          <p className="max-w-4xl text-sm/6 wrap-break-word whitespace-pre-wrap text-foreground">{merged.answer}</p>
        </Card>
      )}

      {merged.program_output && (
        <Card title="Program output">
          <CodeBlock>{merged.program_output}</CodeBlock>
        </Card>
      )}

    </div>
  );
}
