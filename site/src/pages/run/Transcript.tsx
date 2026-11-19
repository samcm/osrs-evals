/**
 * The agent's thinking, live on the playhead: every model call as one line, and the call running at
 * the playhead open, with what the model wrote in full (markdown) and what it ran one click away
 * (`?code=1`). The list follows the playhead inside its own scroll, never moving the page; clicking a
 * call puts the playhead there (`?t=`, `?turn=`). Tool and error filters are in the URL too.
 */

import { memo, useEffect, useMemo, useRef, type ReactElement, type ReactNode } from 'react';
import Markdown, { type Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { CodeBlock, Disclosure, linkClassName } from '@/components/bits';
import { Swatch } from '@/components/marks';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardAction, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import type { Action, RunDetail, ToolCategory, Turn } from '@/data/types';
import { formatClock, formatCost, formatInt, formatSeconds, formatTokens } from '@/lib/format';
import { useSearchUpdate } from '@/lib/search';
import { TOOL_CATEGORY } from '@/lib/tools';
import { cn } from '@/lib/utils';
import { actionLine, commonTool, currentTurn, turnCategories, turnHasError, turnSummary, turnTick, type Clock } from './model';
import { runSearch, TOOL_CATEGORIES, useSettle, type RunSearch } from './search';

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
    <div className="flex max-w-prose min-w-0 flex-col gap-2 leading-relaxed wrap-break-word">
      <Markdown remarkPlugins={[remarkGfm]} components={MARKDOWN}>
        {text}
      </Markdown>
    </div>
  );
}

function CategoryKey({ category }: { category: ToolCategory }) {
  const info = TOOL_CATEGORY[category];
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
      <Swatch color={info.color} />
      {info.label}
    </span>
  );
}

/** A call's tool categories as swatches, and a red dot for an error. */
function Marks({ turn }: { turn: Turn }) {
  return (
    <span className="flex shrink-0 items-center gap-1">
      {turnHasError(turn) && <span aria-label="Error" title="Error" className="size-2 rounded-full bg-destructive" />}
      {turnCategories(turn).map(cat => (
        <span key={cat} title={TOOL_CATEGORY[cat].label} className="flex">
          <Swatch color={TOOL_CATEGORY[cat].color} />
        </span>
      ))}
    </span>
  );
}

function Fact({ term, children }: { term: string; children: ReactNode }) {
  return (
    <div className="flex gap-1.5">
      <dt className="text-muted-foreground">{term}</dt>
      <dd className="tabular-nums">{children}</dd>
    </div>
  );
}

function ActionView({ action, common }: { action: Action; common: string | null }) {
  const cut = action.output_chars != null && action.output != null && action.output_chars > action.output.length;
  return (
    <div className="flex min-w-0 flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <CategoryKey category={action.category} />
        {action.tool !== common && <span className="font-mono text-muted-foreground">{action.tool}</span>}
        {action.background && <span className="text-muted-foreground">In the background</span>}
        {action.seconds != null && <span className="text-muted-foreground tabular-nums">{formatSeconds(action.seconds)} s</span>}
        {[...new Set(action.sdk_calls)].map(f => (
          <Badge key={f} variant="secondary" className="font-mono font-normal">
            {f}
          </Badge>
        ))}
      </div>
      <CodeBlock>{action.input}</CodeBlock>
      {action.error && <CodeBlock tone="danger">{action.error}</CodeBlock>}
      {action.output != null && action.output !== '' && (
        <Disclosure
          title="Output"
          defaultOpen
          meta={cut || action.truncated ? `${formatInt(action.output.length)} of ${formatInt(action.output_chars)} characters${action.truncated ? ', cut before the model saw it' : ''}` : undefined}
        >
          <CodeBlock>{action.output}</CodeBlock>
        </Disclosure>
      )}
    </div>
  );
}

/** Where a call sits on the page's clock. */
const when = (turn: Turn, clock: Clock, search: RunSearch): string => (search.x === 'ticks' ? formatInt(turnTick(turn, clock)) : formatClock(turn.at));

const ROW = 'flex h-9 w-full items-center gap-3 px-(--card-spacing) text-left';
const TIME = 'w-14 shrink-0 text-right text-xs text-muted-foreground tabular-nums';

/** The call at the playhead, open: what the model wrote, what it ran, what it took. */
function CurrentTurn({ turn, i, run, clock, search, common }: { turn: Turn; i: number; run: RunDetail; clock: Clock; search: RunSearch; common: string | null }) {
  const update = useSearchUpdate(runSearch);
  const ran = turn.actions;
  const actions = (
    <div className="flex min-w-0 flex-col gap-4">
      {ran.map((action, n) => (
        <ActionView key={n} action={action} common={common} />
      ))}
    </div>
  );
  return (
    <section data-turn={i + 1} aria-current="step" aria-label={`Turn ${i + 1}`} className="border-y bg-muted/50">
      <div className={ROW}>
        <span className={cn(TIME, 'text-foreground')}>{when(turn, clock, search)}</span>
        <span className="min-w-0 flex-1 text-xs text-muted-foreground tabular-nums">Turn {formatInt(i + 1)}</span>
        <Marks turn={turn} />
      </div>
      <div className="flex min-w-0 flex-col gap-3 px-(--card-spacing) pb-3">
        {turn.text && <Prose text={turn.text} />}
        {turn.error && <CodeBlock tone="danger">{turn.error}</CodeBlock>}
        {ran.length > 0 &&
          (turn.text ? (
            <Collapsible open={search.code === '1'} onOpenChange={open => update({ code: open ? '1' : undefined })} className="min-w-0">
              <CollapsibleTrigger className="flex w-full min-w-0 flex-col gap-1 rounded-md py-1 text-left text-xs outline-none focus-visible:ring-3 focus-visible:ring-ring/50">
                {ran.map((action, n) => (
                  <span key={n} className="flex w-full min-w-0 items-center gap-2 text-muted-foreground hover:text-foreground">
                    <span aria-hidden className="w-2 shrink-0 font-mono">
                      {n === 0 ? (search.code === '1' ? '−' : '+') : ''}
                    </span>
                    <Swatch color={TOOL_CATEGORY[action.category].color} />
                    <span className="min-w-0 flex-1 truncate font-mono">{actionLine(action)}</span>
                  </span>
                ))}
              </CollapsibleTrigger>
              <CollapsibleContent className="mt-2">{actions}</CollapsibleContent>
            </Collapsible>
          ) : (
            actions
          ))}
        <dl className="flex flex-wrap gap-x-4 gap-y-1 text-xs">
          <Fact term="Model">{formatSeconds(turn.model_seconds)} s</Fact>
          {turn.then_seconds != null && <Fact term="Then">{formatSeconds(turn.then_seconds)} s</Fact>}
          <Fact term="Context">{formatTokens(turn.context_tokens)}</Fact>
          <Fact term="Output">{formatTokens(turn.output_tokens)}</Fact>
          {turn.reasoning_tokens != null && turn.reasoning_tokens > 0 && <Fact term="Reasoning">{formatTokens(turn.reasoning_tokens)}</Fact>}
          {turn.cost != null && <Fact term="Cost">{formatCost(turn.cost)}</Fact>}
          {run.attempts > 1 && turn.attempt != null && <Fact term="Attempt">{turn.attempt}</Fact>}
          {turn.stop_reason && turn.stop_reason !== 'tool_calls' && <Fact term="Stopped">{turn.stop_reason.replace(/_/g, ' ')}</Fact>}
        </dl>
      </div>
    </section>
  );
}

/** Tool categories and errors, as checkboxes in a menu; each choice is in the URL. */
function Filters({ turns, search }: { turns: Turn[]; search: RunSearch }) {
  const update = useSearchUpdate(runSearch);
  const tools = search.tools as ToolCategory[];
  const errorsOnly = search.errors === '1';
  const counts = useMemo(() => {
    const byCategory = new Map<ToolCategory, number>();
    for (const t of turns) for (const cat of turnCategories(t)) byCategory.set(cat, (byCategory.get(cat) ?? 0) + 1);
    return { byCategory, errors: turns.filter(turnHasError).length };
  }, [turns]);
  // A filter in the URL keeps its item, so it can always be turned off
  const present = TOOL_CATEGORIES.filter(c => counts.byCategory.has(c) || tools.includes(c));
  const showErrors = counts.errors > 0 || errorsOnly;
  if (present.length < 2 && tools.length === 0 && !showErrors) return null;
  const active = tools.length + (errorsOnly ? 1 : 0);
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm">
          Filter
          {active > 0 && <span className="text-muted-foreground tabular-nums">{active}</span>}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-auto">
        {present.map(cat => (
          <DropdownMenuCheckboxItem
            key={cat}
            checked={tools.includes(cat)}
            onSelect={e => e.preventDefault()}
            onCheckedChange={on => update({ tools: TOOL_CATEGORIES.filter(c => (c === cat ? on : tools.includes(c))) })}
          >
            <CategoryKey category={cat} />
            <span className="ml-auto text-muted-foreground tabular-nums">{formatInt(counts.byCategory.get(cat) ?? 0)}</span>
          </DropdownMenuCheckboxItem>
        ))}
        {showErrors && present.length > 0 && <DropdownMenuSeparator />}
        {showErrors && (
          <DropdownMenuCheckboxItem checked={errorsOnly} onSelect={e => e.preventDefault()} onCheckedChange={on => update({ errors: on ? '1' : undefined })}>
            <span aria-hidden className="size-2 rounded-full bg-destructive" />
            Errors
            <span className="ml-auto text-muted-foreground tabular-nums">{formatInt(counts.errors)}</span>
          </DropdownMenuCheckboxItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function Prompt({ prompt }: { prompt: string }) {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          Prompt
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Prompt</DialogTitle>
        </DialogHeader>
        <CodeBlock>{prompt}</CodeBlock>
      </DialogContent>
    </Dialog>
  );
}

/**
 * The transcript at `tick`, the playhead (scrubbing, then the lanes' hover, then `?t=`). It fills its
 * container's height and scrolls inside it.
 */
export const Transcript = memo(function Transcript({ run, clock, search, tick }: { run: RunDetail; clock: Clock; search: RunSearch; tick: number }) {
  const settle = useSettle();
  const list = useRef<HTMLDivElement>(null);
  const turns = run.turns;
  const common = useMemo(() => commonTool(run), [run]);
  const current = currentTurn(turns, clock, tick, search.turn);
  const tools = search.tools as ToolCategory[];
  const errorsOnly = search.errors === '1';

  const body = useMemo(() => {
    const rows = turns
      .map((turn, i) => ({ turn, i }))
      .filter(({ turn, i }) => i === current || ((tools.length === 0 || turn.actions.some(a => tools.includes(a.category))) && (!errorsOnly || turnHasError(turn))));
    return (
      <>
        {rows.map(({ turn, i }) => {
          if (i === current) return <CurrentTurn key={i} turn={turn} i={i} run={run} clock={clock} search={search} common={common} />;
          const summary = turnSummary(turn);
          return (
            <button
              key={i}
              type="button"
              data-turn={i + 1}
              onClick={() => settle(turnTick(turn, clock), i + 1)}
              className={cn(ROW, 'transition-colors outline-none hover:bg-muted/50 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:ring-inset', i > current && 'text-muted-foreground')}
            >
              <span className={TIME}>{when(turn, clock, search)}</span>
              <span className={cn('min-w-0 flex-1 truncate', summary?.kind !== 'said' && 'font-mono text-xs text-muted-foreground')}>{summary?.text}</span>
              <Marks turn={turn} />
            </button>
          );
        })}
        {rows.length === 0 && <p className="py-6 text-center text-muted-foreground">No call matches these filters.</p>}
        {run.answer && (
          <section aria-label="Answer" className="flex flex-col gap-1 border-t px-(--card-spacing) py-3">
            <h3 className="text-xs text-muted-foreground">Answer</h3>
            <Prose text={run.answer} />
          </section>
        )}
      </>
    );
  }, [turns, current, tools, errorsOnly, run, clock, search, common, settle]);

  // The current call comes into view inside the list, never moving the page
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
    if (top < container.scrollTop || bottom > container.scrollTop + container.clientHeight) container.scrollTop = Math.max(0, top - 36);
  }, [current]);

  return (
    <Card className="h-full">
      <CardHeader>
        <CardTitle>Transcript</CardTitle>
        <CardAction className="flex items-center gap-2">
          {run.prompt && <Prompt prompt={run.prompt} />}
          <Filters turns={turns} search={search} />
        </CardAction>
      </CardHeader>
      <CardContent className="flex min-h-0 flex-1 flex-col px-0">
        <div ref={list} className="relative min-h-0 flex-1 overflow-y-auto border-t">
          {body}
        </div>
      </CardContent>
    </Card>
  );
});
