/**
 * What the agent was doing, as a conversation, like a coding agent's message feed: the goal it was
 * given, then what the model said and one quiet line per thing it did ("Ran cook.ts", "Read API.md,
 * actions.ts", "Waited"; actionLines.ts), with the game steps its script takes on the right ("walk,
 * talk"). No code, output or token counts: those live in the log. A line's dot is its tool
 * category's colour; the same line repeated across calls folds into one with a count. The call at the playhead is marked and kept in view inside the feed's own
 * scroll; clicking a message or a line puts the playhead at its call (`?t=`, `?turn=`).
 */

import { memo, useEffect, useMemo, useRef, type ReactElement, type ReactNode } from 'react';
import Markdown, { type Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { CodeBlock, linkClassName } from '@/components/bits';
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import type { RunDetail, ToolCategory } from '@/data/types';
import { formatInt } from '@/lib/format';
import { TOOL_CATEGORY } from '@/lib/tools';
import { cn } from '@/lib/utils';
import { actionClauses, gameSteps, type Clause } from './actionLines';
import { currentTurn, plainLine, turnTick, type Clock } from './model';
import { useSettle, type RunSearch } from './search';

/** Markdown in the page's type: body text, bold headings, code in Geist Mono. */
const MARKDOWN: Components = {
  h1: ({ children }) => <p className="font-medium">{children}</p>,
  h2: ({ children }) => <p className="font-medium">{children}</p>,
  h3: ({ children }) => <p className="font-medium">{children}</p>,
  h4: ({ children }) => <p className="font-medium">{children}</p>,
  p: ({ children }) => <p>{children}</p>,
  ul: ({ children }) => <ul className="flex list-disc flex-col gap-1 pl-5">{children}</ul>,
  ol: ({ children }) => <ol className="flex list-decimal flex-col gap-1 pl-5">{children}</ol>,
  strong: ({ children }) => <strong className="font-medium">{children}</strong>,
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
    <div className="flex min-w-0 flex-col gap-2 leading-relaxed wrap-break-word">
      <Markdown remarkPlugins={[remarkGfm]} components={MARKDOWN}>
        {text}
      </Markdown>
    </div>
  );
}

/* The feed ------------------------------------------------------------------------------------- */

type Row =
  | { kind: 'said'; first: number; last: number; text: string }
  | { kind: 'error'; first: number; last: number; text: string }
  | { kind: 'did'; first: number; last: number; clauses: Clause[]; steps: string[]; category: ToolCategory; failed: boolean; count: number; input: string };

const clauseKey = (row: Extract<Row, { kind: 'did' }>): string => JSON.stringify([row.clauses, row.steps, row.failed]);

/** Every message and line, in order; a line the same as the line before it folds into it. */
function feedRows(run: RunDetail): Row[] {
  const rows: Row[] = [];
  run.turns.forEach((turn, i) => {
    if (turn.text?.trim()) rows.push({ kind: 'said', first: i, last: i, text: turn.text });
    if (turn.error) rows.push({ kind: 'error', first: i, last: i, text: plainLine(turn.error.split('\n')[0]) });
    for (const action of turn.actions) {
      const row: Row = { kind: 'did', first: i, last: i, clauses: actionClauses(action), steps: gameSteps(action.sdk_calls), category: action.category, failed: action.error != null, count: 1, input: action.input };
      const before = rows[rows.length - 1];
      if (before?.kind === 'did' && clauseKey(before) === clauseKey(row)) {
        before.last = i;
        before.count += 1;
      } else rows.push(row);
    }
  });
  return rows;
}

/** A line: its category's dot, what it did, then on the right the game steps its script takes and how many calls it folds. */
function Line({ row }: { row: Extract<Row, { kind: 'did' }> }) {
  return (
    <span className={cn('flex w-full min-w-0 items-center gap-2 text-muted-foreground', row.failed && 'text-destructive')}>
      <span aria-hidden className={cn('size-1.5 shrink-0 rounded-full', TOOL_CATEGORY[row.category].color.swatchClassName)} />
      <span className="min-w-0 flex-1 truncate" title={row.input}>
        {row.clauses.map((c, n) => (
          <span key={n}>
            {n > 0 && ', '}
            <span className={cn(!row.failed && 'text-foreground')}>{n > 0 ? c.verb.toLowerCase() : c.verb}</span>
            {c.object && ` ${c.object}`}
          </span>
        ))}
        {row.failed && ' failed'}
      </span>
      {row.steps.length > 0 && <span className="max-w-1/2 shrink-0 truncate text-xs">{row.steps.join(', ')}</span>}
      {row.count > 1 && <span className="shrink-0 text-xs tabular-nums">×{formatInt(row.count)}</span>}
    </span>
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
  const rows = useMemo(() => feedRows(run), [run]);
  // The goal as the agent got it, without the harness's own blocks (<system-reminder>, <environment_context>)
  const prompt = run.prompt?.replace(/<([\w-]+)>[\s\S]*?<\/\1>/g, '').replace(/\n\s*\n/g, '\n').trim();

  const body = useMemo(
    () =>
      rows.map((row, n) => {
        const state = current >= row.first && current <= row.last ? 'current' : row.first > current ? 'future' : 'past';
        return (
          <li key={n} data-current={state === 'current' || undefined} aria-current={state === 'current' ? 'step' : undefined} className={cn(row.kind === 'said' && n > 0 && 'pt-2')}>
            <button
              type="button"
              onClick={() => settle(turnTick(run.turns[row.first], clock), row.first + 1)}
              className={cn(
                'flex w-full min-w-0 border-l-2 border-transparent px-4 text-left transition-colors outline-none hover:bg-muted/50 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:ring-inset',
                row.kind === 'said' ? 'py-1.5' : 'py-0.5',
                state === 'current' && 'border-primary bg-muted/50',
                state === 'future' && 'opacity-50'
              )}
            >
              {row.kind === 'said' && <Prose text={row.text} />}
              {row.kind === 'error' && <span className="min-w-0 truncate text-destructive">{row.text}</span>}
              {row.kind === 'did' && <Line row={row} />}
            </button>
          </li>
        );
      }),
    [rows, current, clock, settle, run.turns]
  );

  useEffect(() => {
    const container = list.current;
    if (!container) return;
    if (current < 0) {
      container.scrollTop = 0;
      return;
    }
    const row = container.querySelector<HTMLElement>('[data-current]');
    if (!row) return;
    const top = row.offsetTop;
    const bottom = top + Math.min(row.offsetHeight, container.clientHeight);
    if (top < container.scrollTop || bottom > container.scrollTop + container.clientHeight) container.scrollTop = Math.max(0, top - container.clientHeight / 3);
  }, [current]);

  return (
    // The feed runs to the card's bottom edge and scrolls inside it
    <Card className="h-full pb-0">
      <CardHeader>
        <CardTitle>Transcript</CardTitle>
        <CardDescription>{formatInt(run.turns.length)} model calls</CardDescription>
      </CardHeader>
      <ol ref={list} aria-label="What the agent was doing" className="relative min-h-0 flex-1 overflow-y-auto pb-3">
        {prompt && (
          <li className="mx-4 mb-2 rounded-lg bg-muted px-3 py-2 text-muted-foreground">
            <p className="line-clamp-3 whitespace-pre-line" title={prompt}>
              {prompt}
            </p>
          </li>
        )}
        {body}
        {run.answer && (
          <li className="mx-4 mt-3 border-t pt-3">
            <Prose text={run.answer} />
          </li>
        )}
      </ol>
    </Card>
  );
});
