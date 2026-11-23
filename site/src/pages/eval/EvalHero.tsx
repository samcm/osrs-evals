/**
 * The eval's header: the goal first, as the agents got it, then what counts and what makes it hard,
 * then its facts, then what happened across its runs (site/summarize.py's note), then a Setup section, closed unless `?setup=1`, with the exact prompt every agent got and
 * the eval's settings.
 */

import { ChevronRight } from 'lucide-react';
import { CodeBlock, linkClassName } from '@/components/bits';
import { EvalMark } from '@/components/marks';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
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
}) {
  const art = evalArt(e.id);
  return (
    <PageHero mark={<EvalMark evalId={e.id} size={40} />} lead={e.goal} detail={art.why} meta={meta}>
      {/* What happened across its runs (site/summarize.py's cross-run pass) */}
      {e.note && (
        <div className="flex flex-col gap-1 border-t px-6 py-4 sm:pl-[calc(--spacing(6)+--spacing(16)+--spacing(5))]">
          <h3 className="text-sm text-muted-foreground">What happened</h3>
          <p className="max-w-3xl text-pretty">{e.note}</p>
        </div>
      )}
      <Collapsible open={setup} onOpenChange={onSetup}>
        <CollapsibleTrigger className="group flex w-full items-center gap-2 border-t px-6 py-3 text-left text-sm font-medium transition-colors hover:bg-muted/50">
          <ChevronRight className="size-4 text-muted-foreground transition-transform group-data-[state=open]:rotate-90" />
          Setup
          <span className="hidden font-normal text-muted-foreground sm:inline">
            The prompt and settings every run got
          </span>
        </CollapsibleTrigger>
        <CollapsibleContent className="border-t">
          <div className="grid gap-6 p-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
            <section className="flex min-w-0 flex-col gap-2">
              <h3 className="text-sm font-medium">Prompt</h3>
              <CodeBlock className="max-h-none">{e.prompt ?? e.goal}</CodeBlock>
            </section>
            <section className="flex min-w-0 flex-col gap-2">
              <h3 className="text-sm font-medium">Settings</h3>
              <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-6 gap-y-2 text-sm">
                {settings(e, runs).map(([term, value]) => (
                  <div key={term} className="contents">
                    <dt className="text-muted-foreground">{term}</dt>
                    <dd className="text-pretty">{value}</dd>
                  </div>
                ))}
              </dl>
            </section>
          </div>
        </CollapsibleContent>
      </Collapsible>
    </PageHero>
  );
}

/** The eval's settings as term and value, in the order a reader rebuilding the eval needs them. */
function settings(e: Eval, runs: Run[]): [string, React.ReactNode][] {
  const art = evalArt(e.id);
  const seconds = (e.budget_ticks * e.tick_ms) / 1000;
  const versions = [...new Set(runs.map(r => `${r.agent_name} ${r.agent_version ?? ''}`.trim()))];
  const levels = [...new Set(runs.map(r => r.thinking).filter((l): l is string => !!l))].sort(compareThinking);
  const ge = e.world?.GE_ENABLED;
  const mono = (s: string) => <span className="font-mono text-xs">{s}</span>;
  return [
    [
      'Start',
      <>
        New {e.accounts.length > 1 ? 'characters' : 'character'} from {mono(e.start?.save ?? 'a fresh save')}
        {e.start?.tile ? `, at tile ${e.start.tile.join(', ')}` : ''}
      </>,
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
      <a className={linkClassName} href={`${SOURCE}/${e.base}.py`} target="_blank" rel="noreferrer">
        {mono(`evals/${e.base}.py`)}
      </a>,
    ],
  ];
}
