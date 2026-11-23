/**
 * What the agent was doing, as a conversation, like a coding agent's message feed (the goal it was
 * given is the eval's, named in the header bar): what the model said and one quiet line per thing it did ("Ran cook.ts", "Read API.md,
 * actions.ts", "Waited"; actionLines.ts), with the game steps its script takes on the right ("walk,
 * talk"). No code, output or token counts: those live in the log. A line's dot is its tool
 * category's colour; the same line repeated across calls folds into one with a count. The call at the playhead is marked and kept in view inside the feed's own
 * scroll; clicking a message or a line puts the playhead at its call (`?t=`, `?turn=`). A run told in
 * chapters (site/summarize.py) shows those instead: each its title and what happened, the one at the
 * playhead marked and kept in view, clicking one starts it; "Every call" (`?calls=1`) puts each
 * chapter's calls under it.
 */

import { memo, useEffect, useMemo, useRef, type ReactElement, type ReactNode } from 'react';
import Markdown, { type Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { CodeBlock, linkClassName } from '@/components/bits';
import { Card, CardAction, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Toggle } from '@/components/ui/toggle';
import { useSearchUpdate } from '@/lib/search';
import type { RunDetail, RunSummary, ToolCategory } from '@/data/types';
import { formatInt } from '@/lib/format';
import { TOOL_CATEGORY } from '@/lib/tools';
import { cn } from '@/lib/utils';
import { actionClauses, gameSteps, type Clause } from './actionLines';
import { currentTurn, plainLine, turnTick, type Clock } from './model';
import { runSearch, useSettle, type RunSearch } from './search';

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
export const Transcript = memo(function Transcript({
  run,
  clock,
  search,
  tick,
  chapters,
}: {
  run: RunDetail;
  clock: Clock;
  search: RunSearch;
  tick: number;
  /** The run's chapters (site/summarize.py): each heads the first line at or after its start */
  chapters?: RunSummary['chapters'];
}) {
  const settle = useSettle();
  const update = useSearchUpdate(runSearch);
  // The chapters alone unless the reader asks for every call; a run without chapters shows its calls
  const told = Boolean(chapters && chapters.length > 0);
  const calls = !told || search.calls === '1';
  const chapterIndex = chapters ? chapters.findLastIndex(c => c.from_tick <= tick) : -1;
  const list = useRef<HTMLOListElement>(null);
  const current = currentTurn(run.turns, clock, tick, search.turn);
  const rows = useMemo(() => feedRows(run), [run]);

  // The feed in chapters: each chapter wraps the rows from the first call at or after its start up
  // to the next chapter's; without chapters, one untitled group holds every row
  const groups = useMemo(() => {
    const starts = (chapters ?? []).map(c => ({ chapter: c, at: rows.findIndex(r => turnTick(run.turns[r.first], clock) >= c.from_tick) })).filter(g => g.at >= 0);
    if (starts.length === 0) return [{ chapter: null, index: -1, from: 0, to: rows.length }];
    if (starts[0].at > 0) starts[0].at = 0;
    return starts.map((g, i) => ({ chapter: g.chapter, index: (chapters ?? []).indexOf(g.chapter), from: g.at, to: starts[i + 1]?.at ?? rows.length }));
  }, [chapters, rows, run.turns, clock]);

  const rowItem = (row: (typeof rows)[number], n: number) => {
    const state = current >= row.first && current <= row.last ? 'current' : row.first > current ? 'future' : 'past';
    return (
      <li key={n} data-current={state === 'current' || undefined} aria-current={state === 'current' ? 'step' : undefined} className={cn(row.kind === 'said' && 'pt-2')}>
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
  };

  const body = useMemo(
    () =>
      groups.map(g => {
        if (!g.chapter) return rows.slice(g.from, g.to).map((row, k) => rowItem(row, g.from + k));
        // By default the feed is the chapters alone, each its title and what happened, the one at the
        // playhead marked and kept in view; with every call shown (`?calls=1`) each chapter wraps its
        // calls, its header pinned to the top of the feed while they scroll by
        const now = g.index === chapterIndex;
        const future = g.index > chapterIndex;
        return (
          <li key={`chapter-${g.chapter.from_tick}`} data-current={(!calls && now) || undefined} className={cn(calls && 'border-b last:border-b-0')}>
            <button
              type="button"
              onClick={() => settle(g.chapter!.from_tick)}
              aria-current={now ? 'step' : undefined}
              className={cn(
                'flex w-full min-w-0 flex-col items-start gap-0.5 border-l-2 border-transparent bg-card px-4 py-2 text-left transition-colors outline-none hover:bg-muted/50 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:ring-inset',
                now && 'border-primary',
                // Pinned over the calls, it stays solid; in the chapters alone the current one is shaded
                now && !calls && 'bg-muted/50',
                calls && 'sticky top-0 z-10 border-b',
                future && 'opacity-50'
              )}
            >
              <span className="flex w-full min-w-0 items-baseline gap-2">
                <span className="min-w-0 flex-1 font-medium">{g.chapter.title}</span>
                <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
                  {formatInt(g.index + 1)} of {formatInt(chapters!.length)}
                </span>
              </span>
              <span className="text-xs text-pretty text-muted-foreground">{g.chapter.text}</span>
            </button>
            {calls && <ol className="pb-2">{rows.slice(g.from, g.to).map((row, k) => rowItem(row, g.from + k))}</ol>}
          </li>
        );
      }),
    [groups, rows, current, clock, settle, run.turns, chapterIndex, chapters, calls]
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
  }, [current, calls, chapterIndex]);

  return (
    // The feed runs to the card's bottom edge and scrolls inside it
    <Card className="h-full pb-0">
      <CardHeader>
        <CardTitle>{told ? 'What it did' : 'Transcript'}</CardTitle>
        <CardDescription>{formatInt(run.turns.length)} model calls</CardDescription>
        {told && (
          <CardAction>
            <Toggle size="sm" variant="outline" pressed={search.calls === '1'} onPressedChange={on => update({ calls: on ? '1' : undefined })} aria-label="Show every call">
              Every call
            </Toggle>
          </CardAction>
        )}
      </CardHeader>
      <ol ref={list} aria-label="What the agent was doing" className="relative min-h-0 flex-1 overflow-y-auto border-t pb-3">
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
