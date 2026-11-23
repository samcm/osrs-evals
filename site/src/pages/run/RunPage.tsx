import { useEffect, useMemo, useState, type JSX, type ReactNode } from 'react';
import { getRouteApi, Link, useNavigate } from '@tanstack/react-router';
import { useQuery, useSuspenseQuery } from '@tanstack/react-query';
import clsx from 'clsx';
import { ArrowLeftIcon, ArrowRightIcon } from '@heroicons/react/20/solid';
import { Outcome, Segmented, Tip } from '@/components/bits';
import { PageHero, type MetaItem } from '@/components/page';
import { Sprite } from '@/components/marks';
import { Button, buttonClassName } from '@/components/Elements/Button';
import { Card } from '@/components/Layout/Card';
import { Popover, PopoverButton, PopoverPanel } from '@/components/Overlays/Popover';
import { indexQuery, runQuery, runSummaryQuery } from '@/data/queries';
import type { Eval, Run, RunDetail } from '@/data/types';
import { questSrc, uiSrc } from '@/lib/assets';
import { formatCost, formatDate, formatDuration, formatInt } from '@/lib/format';
import { levelName, modelInfo, variantKey } from '@/lib/series';
import { endedWord, resultValue } from '@/lib/runResult';
import { useDocumentTitle, useSearchUpdate } from '@/lib/search';
import { Lanes } from './Lanes';
import { makeClock, turnTick, type XMeasure } from './model';
import { usePlayhead } from './playhead';
import { Player } from './Player';
import { Playback } from './Playback';
import { RunMap } from './RunMap';
import { runSearch } from './search';
import { Transcript } from './Transcript';
import { Held } from './Held';

const route = getRouteApi('/runs/$runId');

/** Each quest the run completed, as its icon; an inferred one is underlined and says why. */
function QuestIcons({ quests }: { quests: RunDetail['metrics']['quests'] }): JSX.Element {
  return (
    <ul className="flex flex-wrap items-center gap-1.5">
      {quests.map(q => {
        const inferred = q.source === 'inferred';
        const name = q.name ?? 'A quest';
        return (
          <li key={`${q.quest}-${q.tick}`} className="flex">
            <Tip content={inferred ? `≈ ${name}: guessed from the quest-points jump` : name}>
              <span
                tabIndex={0}
                className={clsx(
                  'inline-flex rounded-xs focus:outline-hidden focus-visible:outline-2 focus-visible:outline-primary',
                  inferred && 'border-b border-dashed border-muted'
                )}
              >
                <Sprite
                  src={q.quest ? questSrc(q.quest) : uiSrc('quests')}
                  size={20}
                  alt={inferred ? `≈ ${name}` : name}
                />
              </span>
            </Tip>
          </li>
        );
      })}
    </ul>
  );
}

/**
 * The run's result as header meta, each value its own term. A run with a target: whether it
 * finished, then how long it took (game time, its ticks on hover) and on which attempt, or how far it got. A
 * run without one (quest points): its score, with each quest's icon.
 */
function resultMeta(run: RunDetail, evalInfo: Eval | undefined): MetaItem[] {
  const term = evalInfo?.measure ?? 'Score';
  const value = resultValue(run) ?? 0;
  if (run.target == null) {
    const quests = run.metrics.quests;
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
    // Game time reads as a player's; its ticks, the charts' unit, on hover
    meta.push({
      term: 'Time',
      value: (
        <Tip content={`${formatInt(run.ticks)} game ticks`}>
          <span tabIndex={0} className="cursor-help underline decoration-muted decoration-dotted underline-offset-4">
            {formatDuration(run.seconds)}
          </span>
        </Tip>
      ),
    });
    const won = run.attempt_results?.find(a => a.ticks != null);
    if (run.attempts > 1 && won) meta.push({ term: 'Attempt', value: formatInt(won.attempt) });
  } else {
    meta.push({ term, value: `${formatInt(value)} of ${formatInt(run.target)}` });
  }
  return meta;
}

/** The facts a reader rarely needs but a debugger does (where the log is, which commit), behind the run id. */
function RunFacts({ run }: { run: RunDetail }): JSX.Element {
  const mono = (text: string): JSX.Element => <span className="font-mono text-xs break-all">{text}</span>;
  const facts: [string, ReactNode][] = [];
  if (run.model_calls > 0) facts.push(['Model', mono(run.model)]);
  if (run.agent_version) facts.push([run.agent_name, mono(run.agent_version)]);
  facts.push(['Character', mono(run.account)]);
  facts.push(['Started', `${formatDate(run.sample_started ?? run.started)} UTC`]);
  if (run.ended_by) facts.push(['Ended', endedWord(run.ended_by)]);
  if (run.commit) facts.push(['Commit', mono(run.commit)]);
  facts.push(['Log', mono(run.log)]);
  return (
    <Popover>
      <PopoverButton variant="blank" size="sm" className="font-mono text-muted">
        {run.id}
      </PopoverButton>
      <PopoverPanel anchor={{ to: 'bottom end', gap: 4, padding: 8 }} className="w-80 p-4 shadow-lg">
        <dl className="flex flex-col gap-2 text-sm">
          {facts.map(([term, value]) => (
            <div key={term} className="flex min-w-0 flex-col">
              <dt className="text-xs text-muted">{term}</dt>
              <dd className="text-foreground">{value}</dd>
            </div>
          ))}
        </dl>
      </PopoverPanel>
    </Popover>
  );
}

/** The run before and after this one of the same eval and variant, by epoch; ← and → go there. */
function Siblings({ run, runs, measure }: { run: RunDetail; runs: Run[]; measure: XMeasure }): JSX.Element | null {
  const navigate = useNavigate();
  const siblings = useMemo(
    () =>
      runs
        .filter(r => r.eval === run.eval && variantKey(r) === variantKey(run))
        .sort((a, b) => a.epoch - b.epoch || a.id.localeCompare(b.id)),
    [runs, run]
  );
  const at = siblings.findIndex(r => r.id === run.id);
  const prev = at > 0 ? siblings[at - 1] : undefined;
  const next = at >= 0 && at + 1 < siblings.length ? siblings[at + 1] : undefined;

  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
      if ((event.target as HTMLElement | null)?.closest('input, textarea, select, [contenteditable], [role=slider]'))
        return;
      const to = event.key === 'ArrowLeft' ? prev : event.key === 'ArrowRight' ? next : undefined;
      if (!to) return;
      event.preventDefault();
      navigate({ to: '/runs/$runId', params: { runId: to.id }, search: { x: measure } as never });
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [navigate, prev, next, measure]);

  if (siblings.length < 2) return null;
  return (
    <nav aria-label="Epochs of this pairing" className="flex items-center gap-2">
      <EpochLink to={prev} measure={measure} label="Previous epoch" icon={<ArrowLeftIcon />} />
      <span className="text-sm whitespace-nowrap text-muted tabular-nums">
        Epoch <span className="text-foreground">{formatInt(run.epoch)}</span> of {formatInt(siblings.length)}
      </span>
      <EpochLink to={next} measure={measure} label="Next epoch" icon={<ArrowRightIcon />} />
    </nav>
  );
}

/** An arrow to the run of another epoch, named on hover; a disabled one at either end. */
function EpochLink({
  to,
  measure,
  label,
  icon,
}: {
  to: Run | undefined;
  measure: XMeasure;
  label: string;
  icon: JSX.Element;
}): JSX.Element {
  if (!to) return <Button variant="secondary" size="sm" iconOnly leadingIcon={icon} disabled aria-label={label} />;
  return (
    <Tip content={`Epoch ${to.epoch}`}>
      <Link
        to="/runs/$runId"
        params={{ runId: to.id }}
        search={{ x: measure } as never}
        aria-label={`${label}: epoch ${to.epoch}`}
        className={buttonClassName({ variant: 'secondary', size: 'sm', iconOnly: true })}
      >
        <span aria-hidden className="contents *:size-4">
          {icon}
        </span>
      </Link>
    </Tip>
  );
}

/**
 * Where a run places among every run of its eval, by the eval's score: finished first and sooner,
 * else the higher result. Ties share a place.
 */
function placeAmong(run: Run, runs: Run[]): { place: number; of: number } {
  const own = runs.filter(r => r.eval === run.eval);
  const key = (r: Run): [number, number] => [
    r.success ? 0 : 1,
    r.success ? (r.ticks ?? Infinity) : -(resultValue(r) ?? 0),
  ];
  const [a, b] = key(run);
  const ahead = own.filter(r => {
    const [x, y] = key(r);
    return x < a || (x === a && y < b);
  }).length;
  return { place: ahead + 1, of: own.length };
}

/**
 * The run's opening card: what it did in one sentence (site/summarize.py), then its result, its
 * place among the eval's runs and its cost; the run id (its facts behind it) and the epochs on the
 * right. The header bar already names the eval and the pairing, with its marks.
 */
function Header({
  run,
  evalInfo,
  runs,
  measure,
  summary,
}: {
  run: RunDetail;
  evalInfo: Eval | undefined;
  runs: Run[];
  measure: XMeasure;
  summary?: string;
}): JSX.Element {
  const { place, of } = placeAmong(run, runs);
  return (
    <PageHero
      lead={summary}
      meta={[
        ...resultMeta(run, evalInfo),
        ...(of > 1 ? [{ term: 'Place', value: `#${formatInt(place)} of ${formatInt(of)} runs` }] : []),
        ...(run.cost != null ? [{ term: 'Cost', value: formatCost(run.cost) }] : []),
      ]}
      actions={
        <>
          <RunFacts run={run} />
          <Siblings run={run} runs={runs} measure={measure} />
        </>
      }
    />
  );
}

export function RunPage(): JSX.Element {
  const { runId } = route.useParams();
  const search = route.useSearch();
  const { data: detail } = useSuspenseQuery(runQuery(runId));
  const { data: index } = useSuspenseQuery(indexQuery);
  // The index summary may carry fields the detail file lacks, such as a screenshot added later
  const run = useMemo<RunDetail>(() => {
    const summary = index.runs.find(r => r.id === runId);
    return {
      ...summary,
      ...detail,
      screenshot: detail.screenshot ?? summary?.screenshot,
      replay_url: detail.replay_url ?? summary?.replay_url,
    };
  }, [detail, index.runs, runId]);
  const evalInfo = index.evals.find(e => e.id === run.eval);
  useDocumentTitle(
    `${modelInfo(run.model).name} ${levelName(run.thinking)}, ${evalInfo?.title ?? run.eval}, epoch ${run.epoch}`
  );

  const clock = useMemo(() => makeClock(run), [run]);
  const selectedTurn = search.turn != null ? run.turns[search.turn - 1] : undefined;
  const selected = search.t ?? (selectedTurn ? turnTick(selectedTurn, clock) : null);

  const update = useSearchUpdate(runSearch);
  const head = usePlayhead(clock, selected, tick => update({ t: tick || undefined }));
  // Opened at no moment in particular (a click into the run), it plays from the start; a link to a
  // moment (`?t=`, `?turn=`) opens paused there. Decided when the run opens, not as `?t=` changes
  const atMoment = search.t != null || search.turn != null;
  const [opened, setOpened] = useState({ runId, autoplay: !atMoment });
  if (opened.runId !== runId) setOpened({ runId, autoplay: !atMoment });
  const autoplay = opened.runId === runId ? opened.autoplay : !atMoment;
  // A team's runs: the game and the map follow one account, the first unless the reader picks another
  const accounts = run.accounts ?? [run.account];
  const account = search.acct && accounts.includes(search.acct) ? search.acct : run.account;
  // What the accounts held over time, in data exported with it
  const held = run.held != null && Object.keys(run.held).length > 0;
  // Its chapters and summary from site/summarize.py, when it has them
  const { data: told } = useQuery(runSummaryQuery(runId));

  /*
   * The debugger, on one playhead. The lead band is the main screen: the game with its playback bar
   * attached, and the transcript beside it on wide screens (it takes the game's height and scrolls
   * inside; contain-size keeps it from growing the row). Then the timeline: its toolbar and a card
   * per lane, with the map's card beside them, sticking under the site header while the lanes
   * scroll past.
   */
  return (
    <>
      <Header
        run={run}
        evalInfo={evalInfo}
        runs={index.runs}
        measure={search.x}
        summary={told?.summary ?? run.summary ?? undefined}
      />
      <div className={clsx('grid gap-6', held ? 'xl:grid-cols-12' : 'xl:grid-cols-5')}>
        <Card
          className={clsx('min-w-0', held ? 'xl:col-span-8' : 'xl:col-span-3')}
          footer={<Playback run={run} clock={clock} measure={search.x} chapters={told?.chapters} />}
        >
          {/* The game edge to edge, and beside it what the followed account held, as the client's side panel */}
          <div className="mx-card-bleed my-card-bleed flex flex-col md:flex-row">
            <div className="relative min-w-0 flex-1">
              <Player key={run.id} run={run} head={head} autoplay={autoplay} account={account} />
              {accounts.length > 1 && (
                <Segmented
                  className="absolute top-2 left-2"
                  label="Account followed"
                  value={account}
                  options={accounts.map(a => ({ value: a, label: a }))}
                  onChange={a => update({ acct: a === run.account ? undefined : a })}
                />
              )}
            </div>
            {held && (
              <div className="border-t border-border md:relative md:w-56 md:shrink-0 md:border-t-0 md:border-l">
                <div className="flex flex-col px-card-inset py-4 md:absolute md:inset-0">
                  <Held run={run} clock={clock} account={account} tab={search.panel} />
                </div>
              </div>
            )}
          </div>
        </Card>
        {run.turns.length > 0 && (
          <div className={clsx('h-120 min-w-0 xl:h-auto xl:contain-size', held ? 'xl:col-span-4' : 'xl:col-span-2')}>
            <Transcript run={run} clock={clock} search={search} tick={head.tick} chapters={told?.chapters} />
          </div>
        )}
      </div>
      <Lanes
        run={run}
        clock={clock}
        search={search}
        price={index.prices[run.model]}
        aside={
          <Card>
            <div className="mx-card-bleed my-card-bleed">
              <RunMap run={run} account={account} clock={clock} view={search.map} zoom={search.mz} height={420} />
            </div>
          </Card>
        }
      />
    </>
  );
}
