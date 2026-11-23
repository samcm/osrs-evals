/**
 * The eval's header: the goal first, as the agents got it, then what counts and what makes it hard,
 * then its facts, then what happened across its runs (site/summarize.py's note), then a Setup section, closed unless `?setup=1`, with the exact prompt every agent got and
 * the eval's settings.
 */

import { Fragment, type JSX, type ReactNode } from 'react';
import { Disclosure, DisclosureButton, DisclosurePanel } from '@headlessui/react';
import { ChevronRightIcon } from '@heroicons/react/16/solid';
import { CodeBlock, linkClassName } from '@/components/bits';
import { EvalMark } from '@/components/marks';
import { PageHero, type MetaItem } from '@/components/page';
import type { Eval, Run } from '@/data/types';
import { evalArt } from '@/lib/evals';
import { formatDuration, formatInt } from '@/lib/format';
import { compareThinking, levelName } from '@/lib/series';

/** Where the eval's definition lives, to read every detail the page leaves out. */
const SOURCE = 'https://github.com/samcm/osrs-evals/blob/main/evals';

export function EvalHero({
  e,
  runs,
  meta,
  setup,
  onSetup,
}: {
  e: Eval;
  runs: Run[];
  meta: MetaItem[];
  setup: boolean;
  onSetup: (open: boolean) => void;
}): JSX.Element {
  const art = evalArt(e.id);
  return (
    <PageHero mark={<EvalMark evalId={e.id} size={40} />} lead={e.goal} detail={art.why} meta={meta}>
      {/* What happened across its runs (site/summarize.py's cross-run pass), lined up with the lead past the mark's tile */}
      {e.note && (
        <div className="flex flex-col gap-1 border-t border-border px-card-inset py-4 sm:pl-26">
          <h3 className="text-xs text-muted">What happened</h3>
          <p className="max-w-3xl text-sm/6 text-pretty text-foreground">{e.note}</p>
        </div>
      )}
      {/* Headless UI's Disclosure, as lab's is built, flush in the card; keyed on `?setup=` so the URL opens it */}
      <Disclosure key={String(setup)} defaultOpen={setup}>
        <DisclosureButton
          onClick={() => onSetup(!setup)}
          className="group flex w-full items-center gap-2 border-t border-border px-card-inset py-3 text-left text-sm font-medium text-foreground transition-colors hover:bg-surface-hover focus:outline-hidden focus-visible:bg-surface-hover"
        >
          <ChevronRightIcon className="size-4 text-muted transition-transform group-data-open:rotate-90" />
          Setup
          <span className="hidden font-normal text-muted sm:inline">The prompt and settings every run got</span>
        </DisclosureButton>
        <DisclosurePanel className="grid gap-6 border-t border-border px-card-inset py-5 lg:grid-cols-fill-3-2">
          <section className="flex min-w-0 flex-col gap-2">
            <h3 className="text-sm font-medium text-foreground">Prompt</h3>
            <CodeBlock className="max-h-none">{e.prompt ?? e.goal}</CodeBlock>
          </section>
          <section className="flex min-w-0 flex-col gap-2">
            <h3 className="text-sm font-medium text-foreground">Settings</h3>
            <dl className="grid grid-cols-auto-fill gap-x-6 gap-y-2 text-sm">
              {settings(e, runs).map(([term, value]) => (
                <div key={term} className="contents">
                  <dt className="text-muted">{term}</dt>
                  <dd className="text-pretty text-foreground">{value}</dd>
                </div>
              ))}
            </dl>
          </section>
        </DisclosurePanel>
      </Disclosure>
    </PageHero>
  );
}

/** The eval's settings as term and value, in the order a reader rebuilding the eval needs them. */
function settings(e: Eval, runs: Run[]): [string, ReactNode][] {
  const art = evalArt(e.id);
  const seconds = (e.budget_ticks * e.tick_ms) / 1000;
  const versions = [...new Set(runs.map(r => `${r.agent_name} ${r.agent_version ?? ''}`.trim()))];
  const levels = [...new Set(runs.map(r => r.thinking).filter((l): l is string => !!l))].sort(compareThinking);
  const ge = e.world?.GE_ENABLED;
  const mono = (s: string): JSX.Element => <span className="font-mono text-xs">{s}</span>;
  return [
    [
      'Start',
      <Fragment key="start">
        New {e.accounts.length > 1 ? 'characters' : 'character'} from {mono(e.start?.save ?? 'a fresh save')}
        {e.start?.tile ? `, at tile ${e.start.tile.join(', ')}` : ''}
      </Fragment>,
    ],
    ['Accounts', mono(e.accounts.join(', '))],
    [
      'Budget',
      `${formatDuration(seconds)} of game time${e.attempts > 1 ? ' per attempt' : ''}: ${formatInt(e.budget_ticks)} ticks of ${formatInt(e.tick_ms)} ms`,
    ],
    ['Attempts', formatInt(e.attempts)],
    [
      'Score',
      e.target != null
        ? `${art.score ?? 'Fastest to the target'}: done when the ${e.measure.toLowerCase()} reaches ${formatInt(e.target)}`
        : `${art.score ?? e.measure}, at the end of the budget`,
    ],
    [
      'Game',
      `2004scape on rs-sdk: faster XP, unlimited run energy, no random events${ge === 'false' ? ', no Grand Exchange' : ''}`,
    ],
    ['Agent', `${versions.join(', ')}, in print mode, the run’s model doing everything, its helpers too`],
    ['Thinking', levels.map(levelName).join(', ')],
    [
      'Definition',
      <a key="definition" className={linkClassName} href={`${SOURCE}/${e.base}.py`} target="_blank" rel="noreferrer">
        {mono(`evals/${e.base}.py`)}
      </a>,
    ],
  ];
}
