/**
 * What the agent was doing, as a conversation: the goal it was given, then each model call as what
 * the model said and one quiet line per thing it did ("Ran walkTo, interactLoc"), like a coding
 * agent's message feed. No code, output or token counts: those live in the log. The call at the
 * playhead is marked and kept in view inside the feed's own scroll; clicking a call puts the
 * playhead there (`?t=`, `?turn=`).
 */

import { memo, useEffect, useMemo, useRef, type ReactElement, type ReactNode } from 'react';
import Markdown, { type Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { CodeBlock, linkClassName } from '@/components/bits';
import { Card } from '@/components/ui/card';
import type { Action, RunDetail, Turn } from '@/data/types';
import { cn } from '@/lib/utils';
import { currentTurn, plainLine, turnTick, type Clock } from './model';
import { useSettle, type RunSearch } from './search';

/** Markdown in the page's type: body text, bold headings, code in Geist Mono. */
const MARKDOWN: Components = {
  h1: ({ children }) => <p className="font-semibold">{children}</p>,
  h2: ({ children }) => <p className="font-semibold">{children}</p>,
  h3: ({ children }) => <p className="font-semibold">{children}</p>,
  h4: ({ children }) => <p className="font-semibold">{children}</p>,
  p: ({ children }) => <p>{children}</p>,
  ul: ({ children }) => <ul className="flex list-disc flex-col gap-1 pl-5">{children}</ul>,
  ol: ({ children }) => <ol className="flex list-decimal flex-col gap-1 pl-5">{children}</ol>,
  strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
  a: ({ children, href }) => (
    <a href={href} target="_blank" rel="noopener noreferrer" className={linkClassName}>
      {children}
    </a>
  ),
  code: ({ children }) => <code className="rounded-sm bg-muted px-1 font-mono text-xs">{children}</code>,
  pre: ({ children }) => <CodeBlock>{(children as ReactElement<{ children: ReactNode }>).props.children}</CodeBlock>,
  table: ({ children }) => (
    <div className="overflow-x-auto">
      <table className="text-xs [&_td]:border-t [&_td]:py-1 [&_td]:pr-3 [&_th]:pr-3 [&_th]:text-left [&_th]:font-medium">{children}</table>
    </div>
  ),
};

function Prose({ text }: { text: string }) {
  return (
    <div className="flex min-w-0 flex-col gap-2 text-sm leading-relaxed wrap-break-word">
      <Markdown remarkPlugins={[remarkGfm]} components={MARKDOWN}>
        {text}
      </Markdown>
    </div>
  );
}

const VERBS: Record<Action['category'], string> = {
  'write+run': 'Ran',
  run: 'Ran',
  write: 'Wrote',
  read: 'Read',
  state: 'Checked',
  wait: 'Waited for',
  stdin: 'Typed into',
  plan: 'Planned',
  manage: 'Managed',
  submit: 'Submitted',
  other: 'Used',
};

/** The first line of a command worth reading, without a leading `cd somewhere;` and shortened. */
function commandText(input: string): string {
  for (const line of input.split('\n')) {
    const rest = line.replace(/^\s*cd\s+\S+\s*(;|&&)\s*/, '').trim();
    if (rest) return rest.length > 72 ? `${rest.slice(0, 71)}…` : rest;
  }
  return '';
}

/** One thing the agent did, as a short phrase: the game functions it called, else what it ran. */
function actionPhrase(action: Action): { verb: string; what: string; code: boolean } {
  const sdk = [...new Set(action.sdk_calls)].filter(f => f !== 'getState');
  if (sdk.length) return { verb: 'Ran', what: sdk.join(', '), code: false };
  if (action.category === 'state') return { verb: 'Checked', what: 'the game', code: false };
  if (action.category === 'wait') return { verb: 'Waited for', what: 'its script', code: false };
  if (action.category === 'plan') return { verb: 'Updated', what: 'its plan', code: false };
  const cmd = commandText(action.input);
  return cmd ? { verb: VERBS[action.category], what: cmd, code: true } : { verb: VERBS[action.category], what: action.tool, code: false };
}

function ActionLine({ action }: { action: Action }) {
  const { verb, what, code } = actionPhrase(action);
  const failed = action.error != null;
  return (
    <li className={cn('flex min-w-0 items-baseline gap-1.5 text-xs text-muted-foreground', failed && 'text-destructive')}>
      <span aria-hidden className="shrink-0">
        ›
      </span>
      <span className="shrink-0">{failed ? `${verb} (failed)` : verb}</span>
      <span className={cn('min-w-0 truncate', code && 'font-mono')} title={action.input}>
        {what}
      </span>
    </li>
  );
}

/** One model call: what it said, then what it did. Duplicate consecutive phrases fold into one. */
function Message({ turn, i, state, onPick }: { turn: Turn; i: number; state: 'past' | 'current' | 'future'; onPick: () => void }) {
  const said = turn.text?.trim() ? turn.text : null;
  const lines = useMemo(() => {
    const out: Action[] = [];
    let last = '';
    for (const a of turn.actions) {
      const p = actionPhrase(a);
      const key = `${p.verb}|${p.what}|${a.error != null}`;
      if (key !== last) out.push(a);
      last = key;
    }
    return out;
  }, [turn.actions]);
  if (!said && lines.length === 0 && !turn.error) return null;
  return (
    <li data-turn={i + 1} aria-current={state === 'current' ? 'step' : undefined}>
      <button
        type="button"
        onClick={onPick}
        className={cn(
          'flex w-full min-w-0 flex-col gap-1.5 border-l-2 border-transparent py-2 pr-4 pl-3.5 text-left transition-colors outline-none hover:bg-muted/50 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:ring-inset',
          state === 'current' && 'border-primary bg-muted/50',
          state === 'future' && 'opacity-50'
        )}
      >
        {said && <Prose text={said} />}
        {turn.error && <p className="text-xs text-destructive">{plainLine(turn.error.split('\n')[0])}</p>}
        {lines.length > 0 && (
          <ul className="flex min-w-0 flex-col gap-0.5">
            {lines.map((a, n) => (
              <ActionLine key={n} action={a} />
            ))}
          </ul>
        )}
      </button>
    </li>
  );
}

/**
 * The feed at `tick`, the playhead. It fills its container's height and scrolls inside it, keeping
 * the current call in view without moving the page.
 */
export const Transcript = memo(function Transcript({ run, clock, search, tick }: { run: RunDetail; clock: Clock; search: RunSearch; tick: number }) {
  const settle = useSettle();
  const list = useRef<HTMLOListElement>(null);
  const current = currentTurn(run.turns, clock, tick, search.turn);

  const body = useMemo(
    () =>
      run.turns.map((turn, i) => (
        <Message
          key={i}
          turn={turn}
          i={i}
          state={i === current ? 'current' : i < current ? 'past' : 'future'}
          onPick={() => settle(turnTick(turn, clock), i + 1)}
        />
      )),
    [run.turns, current, clock, settle]
  );

  useEffect(() => {
    const container = list.current;
    if (!container) return;
    if (current < 0) {
      container.scrollTop = 0;
      return;
    }
    const row = container.querySelector<HTMLElement>(`[data-turn="${current + 1}"]`);
    if (!row) return;
    const top = row.offsetTop;
    const bottom = top + Math.min(row.offsetHeight, container.clientHeight);
    if (top < container.scrollTop || bottom > container.scrollTop + container.clientHeight) container.scrollTop = Math.max(0, top - container.clientHeight / 3);
  }, [current]);

  return (
    <Card className="h-full gap-0 overflow-hidden py-0">
      <ol ref={list} aria-label="What the agent was doing" className="relative min-h-0 flex-1 overflow-y-auto py-2">
        {run.prompt && (
          <li className="mx-4 my-2 rounded-lg bg-muted px-3 py-2 text-sm text-muted-foreground">
            <p className="line-clamp-3 whitespace-pre-line" title={run.prompt}>
              {run.prompt}
            </p>
          </li>
        )}
        {body}
        {run.answer && (
          <li className="mx-4 mt-2 mb-2 border-t pt-3">
            <Prose text={run.answer} />
          </li>
        )}
      </ol>
    </Card>
  );
});
