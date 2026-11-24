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
 *
 * The feed's rows are plain buttons, not lab's Button: each is a whole message or chapter (Markdown,
 * a heading over a paragraph) laid out as a row of a list, which no Button size or variant is.
 */

import { createElement, isValidElement, memo, useEffect, useMemo, useRef, type JSX, type ReactNode } from 'react';
import Markdown, { type Components, type ExtraProps } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import clsx from 'clsx';
import { CodeBlock, linkClassName } from '@/components/bits';
import { Card } from '@/components/Layout/Card';
import { ScrollArea } from '@/components/Layout/ScrollArea';
import { Toggle } from '@/components/Forms/Toggle';
import { Table } from '@/components/Lists/Table';
import { useSearchUpdate } from '@/lib/search';
import type { RunDetail, RunSummary, ToolCategory } from '@/data/types';
import { formatInt } from '@/lib/format';
import { TOOL_CATEGORY } from '@/lib/tools';
import { actionClauses, gameSteps, type Clause } from './actionLines';
import { currentTurn, plainLine, turnTick, type Clock } from './model';
import { runSearch, useSettle, type RunSearch } from './search';

const inlineCodeClassName = 'rounded-xs bg-muted-10 px-1 font-mono text-xs';

type HastElement = NonNullable<ExtraProps['node']>;
type HastNode = HastElement['children'][number];

/** The elements under a node with this tag name, at any depth. */
function elementsNamed(node: HastElement, tagName: string): HastElement[] {
  return node.children.flatMap(child =>
    child.type !== 'element' ? [] : child.tagName === tagName ? [child] : elementsNamed(child, tagName)
  );
}

/** A table cell's inline Markdown (text, code, emphasis, links) as React, in the prose's styles. */
function inline(nodes: HastNode[]): ReactNode[] {
  return nodes.map(node => {
    if (node.type === 'text') return node.value;
    if (node.type !== 'element') return null;
    const key = node.position?.start.offset;
    const children = inline(node.children);
    if (node.tagName === 'code')
      return (
        <code key={key} className={inlineCodeClassName}>
          {children}
        </code>
      );
    if (node.tagName === 'a')
      return (
        <a
          key={key}
          href={String(node.properties.href ?? '')}
          target="_blank"
          rel="noopener noreferrer"
          className={linkClassName}
        >
          {children}
        </a>
      );
    if (node.tagName === 'strong')
      return (
        <strong key={key} className="font-medium">
          {children}
        </strong>
      );
    if (node.tagName === 'br') return <br key={key} />;
    return createElement(node.tagName, { key }, ...children);
  });
}

/**
 * A table the agent wrote, as lab's Table. Inside a card it runs to the card's edges by the card's
 * inset, above and below too; the padding here (the card's inset, 4 then 5) gives that back so the
 * table keeps its place among the message's paragraphs.
 */
function MarkdownTable({ node }: { node?: HastElement }): JSX.Element | null {
  if (!node) return null;
  const [head, ...body] = elementsNamed(node, 'tr').map(row =>
    row.children.flatMap(cell => (cell.type === 'element' ? [inline(cell.children)] : []))
  );
  if (!head) return null;
  const columns = head.map((header, i) => ({ header, accessor: (row: ReactNode[][]) => row[i] }));
  return (
    <div className="flex flex-col py-4 sm:py-5">
      <Table variant="nested" data={body} columns={columns} />
    </div>
  );
}

/** Markdown in the page's type: body text, bold headings, code in Plex Mono. */
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
  code: ({ children }) => <code className={inlineCodeClassName}>{children}</code>,
  pre: ({ children }) => (
    <CodeBlock>{isValidElement<{ children?: ReactNode }>(children) ? children.props.children : children}</CodeBlock>
  ),
  table: ({ node }) => <MarkdownTable node={node} />,
};

function Prose({ text }: { text: string }): JSX.Element {
  return (
    <div className="flex min-w-0 flex-col gap-2 wrap-break-word">
      <Markdown remarkPlugins={[remarkGfm]} components={MARKDOWN}>
        {text}
      </Markdown>
    </div>
  );
}

/* The feed ------------------------------------------------------------------------------------- */

type Row = { id: number; first: number; last: number } & (
  | { kind: 'said'; text: string }
  | { kind: 'error'; text: string }
  | {
      kind: 'did';
      clauses: Clause[];
      steps: string[];
      category: ToolCategory;
      failed: boolean;
      count: number;
      input: string;
    }
);
type DidRow = Extract<Row, { kind: 'did' }>;

const clauseKey = (row: DidRow): string => JSON.stringify([row.clauses, row.steps, row.failed]);

/** Every message and line, in order; a line the same as the line before it folds into it. */
function feedRows(run: RunDetail): Row[] {
  const rows: Row[] = [];
  run.turns.forEach((turn, i) => {
    if (turn.text?.trim()) rows.push({ id: rows.length, kind: 'said', first: i, last: i, text: turn.text });
    if (turn.error)
      rows.push({ id: rows.length, kind: 'error', first: i, last: i, text: plainLine(turn.error.split('\n')[0]) });
    for (const action of turn.actions) {
      const row: DidRow = {
        id: rows.length,
        kind: 'did',
        first: i,
        last: i,
        clauses: actionClauses(action),
        steps: gameSteps(action.sdk_calls),
        category: action.category,
        failed: action.error != null,
        count: 1,
        input: action.input,
      };
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
function Line({ row }: { row: DidRow }): JSX.Element {
  return (
    <span className={clsx('flex w-full min-w-0 items-center gap-2', row.failed ? 'text-danger' : 'text-muted')}>
      <span
        aria-hidden
        className={clsx('size-1.5 shrink-0 rounded-full', TOOL_CATEGORY[row.category].color.swatchClassName)}
      />
      <span className="min-w-0 flex-1 truncate">
        {row.clauses.map((c, n) => (
          <span key={`${c.verb}-${c.object ?? ''}`}>
            {n > 0 && ', '}
            <span className={clsx(!row.failed && 'text-foreground')}>{n > 0 ? c.verb.toLowerCase() : c.verb}</span>
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

/** A row of the feed: its left edge marks the one at the playhead, and what is still to come is faint. */
const rowClassName =
  'flex w-full min-w-0 border-l-2 px-card-inset text-left text-sm transition-colors hover:bg-muted-10 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-primary';

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
}): JSX.Element {
  const settle = useSettle();
  const update = useSearchUpdate(runSearch);
  // The chapters alone unless the reader asks for every call; a run without chapters shows its calls
  const told = Boolean(chapters && chapters.length > 0);
  const calls = !told || search.calls === '1';
  const chapterIndex = chapters ? chapters.findLastIndex(c => c.from_tick <= tick) : -1;
  const listRef = useRef<HTMLOListElement>(null);
  const current = currentTurn(run.turns, clock, tick, search.turn);
  const rows = useMemo(() => feedRows(run), [run]);

  // The feed in chapters: each chapter wraps the rows from the first call at or after its start up
  // to the next chapter's; without chapters, one untitled group holds every row
  const groups = useMemo(() => {
    const starts = (chapters ?? [])
      .map(c => ({ chapter: c, at: rows.findIndex(r => turnTick(run.turns[r.first], clock) >= c.from_tick) }))
      .filter(g => g.at >= 0);
    if (starts.length === 0) return [{ chapter: null, index: -1, from: 0, to: rows.length }];
    if (starts[0].at > 0) starts[0].at = 0;
    return starts.map((g, i) => ({
      chapter: g.chapter,
      index: (chapters ?? []).indexOf(g.chapter),
      from: g.at,
      to: starts[i + 1]?.at ?? rows.length,
    }));
  }, [chapters, rows, run.turns, clock]);

  const body = useMemo(() => {
    const rowItem = (row: Row): JSX.Element => {
      const state = current >= row.first && current <= row.last ? 'current' : row.first > current ? 'future' : 'past';
      return (
        <li
          key={row.id}
          data-current={state === 'current' || undefined}
          aria-current={state === 'current' ? 'step' : undefined}
          className={clsx(row.kind === 'said' && 'pt-2')}
        >
          <button
            type="button"
            onClick={() => settle(turnTick(run.turns[row.first], clock), row.first + 1)}
            className={clsx(
              rowClassName,
              row.kind === 'said' ? 'py-1.5 text-foreground' : 'py-0.5',
              state === 'current' ? 'border-primary bg-row-active' : 'border-transparent',
              state === 'future' && 'opacity-50'
            )}
          >
            {row.kind === 'said' && <Prose text={row.text} />}
            {row.kind === 'error' && <span className="min-w-0 truncate text-danger">{row.text}</span>}
            {row.kind === 'did' && <Line row={row} />}
          </button>
        </li>
      );
    };
    return groups.map(g => {
      if (!g.chapter) return rows.slice(g.from, g.to).map(rowItem);
      const chapter = g.chapter;
      // By default the feed is the chapters alone, each its title and what happened, the one at the
      // playhead marked and kept in view; with every call shown (`?calls=1`) each chapter wraps its
      // calls, its header pinned to the top of the feed while they scroll by
      const now = g.index === chapterIndex;
      const future = g.index > chapterIndex;
      return (
        <li
          key={`chapter-${chapter.from_tick}`}
          data-current={(!calls && now) || undefined}
          className={clsx(calls && 'border-b border-border last:border-b-0')}
        >
          <button
            type="button"
            onClick={() => settle(chapter.from_tick)}
            aria-current={now ? 'step' : undefined}
            className={clsx(
              rowClassName,
              'flex-col items-start gap-0.5 py-2',
              now ? 'border-primary' : 'border-transparent',
              // Pinned over the calls, it stays solid; in the chapters alone the current one is shaded
              calls ? 'sticky top-0 z-10 border-b border-b-border bg-surface' : now && 'bg-row-active',
              future && 'opacity-50'
            )}
          >
            <span className="flex w-full min-w-0 items-baseline gap-2">
              <span className="min-w-0 flex-1 font-medium text-foreground">{chapter.title}</span>
              <span className="shrink-0 text-xs text-muted tabular-nums">
                {formatInt(g.index + 1)} of {formatInt(chapters?.length ?? 0)}
              </span>
            </span>
            <span className="text-xs text-pretty text-muted">{chapter.text}</span>
          </button>
          {calls && <ol className="pb-2">{rows.slice(g.from, g.to).map(rowItem)}</ol>}
        </li>
      );
    });
  }, [groups, rows, current, clock, settle, run.turns, chapterIndex, chapters, calls]);

  // Keep the row at the playhead in view, scrolling the feed, never the page
  useEffect(() => {
    const viewport = listRef.current?.closest<HTMLElement>('[data-slot=scroll-area-viewport]');
    if (!viewport) return;
    if (current < 0) {
      viewport.scrollTop = 0;
      return;
    }
    const row = viewport.querySelector<HTMLElement>('[data-current]');
    if (!row) return;
    const top = row.getBoundingClientRect().top - viewport.getBoundingClientRect().top + viewport.scrollTop;
    const bottom = top + Math.min(row.offsetHeight, viewport.clientHeight);
    if (top < viewport.scrollTop || bottom > viewport.scrollTop + viewport.clientHeight)
      viewport.scrollTop = Math.max(0, top - viewport.clientHeight / 3);
  }, [current, calls, chapterIndex]);

  return (
    // The feed runs to the card's edges and scrolls inside the card's body
    <Card
      className="flex h-full flex-col"
      title={told ? 'What it did' : 'Transcript'}
      subtitle={`${formatInt(run.turns.length)} model calls`}
      actions={
        told && (
          <label className="flex cursor-pointer items-center gap-2 text-xs text-muted">
            Every call
            <Toggle
              size="small"
              srLabel="Every call"
              checked={search.calls === '1'}
              onChange={on => update({ calls: on ? '1' : undefined })}
            />
          </label>
        )
      }
    >
      <div className="absolute inset-0">
        <ScrollArea className="size-full">
          <ol ref={listRef} aria-label="What the agent was doing" className="pb-3">
            {body}
            {run.answer && (
              <li className="mt-3 px-card-inset text-sm">
                <div className="border-t border-border pt-3">
                  <Prose text={run.answer} />
                </div>
              </li>
            )}
          </ol>
        </ScrollArea>
      </div>
    </Card>
  );
});
