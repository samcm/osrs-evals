/** Every model call as one row: when, what the model said, what kind of tool it used, what it cost. The selected call opens. */

import { useEffect, useMemo, useRef, type ReactNode } from 'react';
import { CodeBlock, Disclosure } from '@/components/bits';
import { Swatch } from '@/components/marks';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Toggle } from '@/components/ui/toggle';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import type { Action, RunDetail, ToolCategory, Turn } from '@/data/types';
import { formatClock, formatCost, formatInt, formatSeconds, formatTokens } from '@/lib/format';
import { useSearchUpdate } from '@/lib/search';
import { TOOL_CATEGORY } from '@/lib/tools';
import { cn } from '@/lib/utils';
import { commonTool, turnCategories, turnHasError, turnSummary, turnTick, type Clock } from './model';
import { runSearch, TOOL_CATEGORIES, type RunSearch } from './search';

function CategoryKey({ category, count, compact }: { category: ToolCategory; count?: number; compact?: boolean }) {
  const info = TOOL_CATEGORY[category];
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap" title={compact ? info.label : undefined}>
      <Swatch color={info.color} />
      <span className={cn(compact && 'sr-only sm:not-sr-only')}>{info.label}</span>
      {count != null && count > 1 && <span className="text-muted-foreground tabular-nums">{count}</span>}
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

function TurnDetail({ turn, run, common }: { turn: Turn; run: RunDetail; common: string | null }) {
  return (
    <div className="flex min-w-0 flex-col gap-3 px-(--card-spacing) pb-4">
      {turn.text && <p className="max-w-4xl wrap-break-word whitespace-pre-wrap">{turn.text}</p>}
      <dl className="flex flex-wrap gap-x-5 gap-y-1 text-xs">
        <Fact term="Model">{formatSeconds(turn.model_seconds)} s</Fact>
        {turn.then_seconds != null && <Fact term="Then">{formatSeconds(turn.then_seconds)} s</Fact>}
        <Fact term="Context">{formatTokens(turn.context_tokens)}</Fact>
        <Fact term="Output">{formatTokens(turn.output_tokens)}</Fact>
        {turn.reasoning_tokens != null && turn.reasoning_tokens > 0 && <Fact term="Reasoning">{formatTokens(turn.reasoning_tokens)}</Fact>}
        {run.attempts > 1 && turn.attempt != null && <Fact term="Attempt">{turn.attempt}</Fact>}
        {turn.stop_reason && turn.stop_reason !== 'tool_calls' && <Fact term="Stopped">{turn.stop_reason.replace(/_/g, ' ')}</Fact>}
      </dl>
      {turn.error && <CodeBlock tone="danger">{turn.error}</CodeBlock>}
      {turn.actions.map((action, i) => (
        <ActionView key={i} action={action} common={common} />
      ))}
    </div>
  );
}

/** Column widths shared by the header and every row. */
const COLUMN = {
  turn: 'w-8 shrink-0 text-right sm:w-10',
  time: 'w-12 shrink-0 text-right sm:w-14',
  tokens: 'hidden w-14 shrink-0 text-right md:block',
  cost: 'w-14 shrink-0 text-right sm:w-16',
};

export function Transcript({ run, clock, search }: { run: RunDetail; clock: Clock; search: RunSearch }) {
  const update = useSearchUpdate(runSearch);
  const list = useRef<HTMLDivElement>(null);
  const turns = run.turns;
  const common = useMemo(() => commonTool(run), [run]);
  const selected = search.turn != null && search.turn <= turns.length ? search.turn - 1 : null;
  const tools = search.tools as ToolCategory[];
  const errorsOnly = search.errors === '1';

  const counts = useMemo(() => {
    const byCategory = new Map<ToolCategory, number>();
    for (const t of turns) for (const cat of turnCategories(t)) byCategory.set(cat, (byCategory.get(cat) ?? 0) + 1);
    return { byCategory, errors: turns.filter(turnHasError).length };
  }, [turns]);
  // A filter in the URL keeps its toggle, so it can always be turned off
  const present = TOOL_CATEGORIES.filter(c => counts.byCategory.has(c) || tools.includes(c));
  const showTools = present.length > 1 || tools.length > 0;
  const showErrors = counts.errors > 0 || errorsOnly;

  const rows = turns
    .map((turn, i) => ({ turn, i }))
    .filter(
      ({ turn, i }) =>
        i === selected || ((tools.length === 0 || turn.actions.some(a => tools.includes(a.category))) && (!errorsOnly || turnHasError(turn)))
    );

  // The selected call scrolls into view inside the list, never moving the page; after the router
  // has restored scroll positions, so a linked turn wins over a remembered position
  useEffect(() => {
    const container = list.current;
    if (selected == null || !container) return;
    const reveal = (): void => {
      const row = container.querySelector<HTMLElement>(`[data-turn="${selected + 1}"]`);
      if (!row) return;
      // The container is the row's offset parent (relative)
      const top = row.offsetTop;
      if (top < container.scrollTop || top + 40 > container.scrollTop + container.clientHeight) container.scrollTop = Math.max(0, top - 8);
    };
    reveal();
    let frame = requestAnimationFrame(() => {
      frame = requestAnimationFrame(reveal);
    });
    return () => cancelAnimationFrame(frame);
  }, [selected]);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Transcript</CardTitle>
      </CardHeader>
      {(showTools || showErrors || run.prompt) && (
        <CardContent className="flex flex-col gap-2">
          {(showTools || showErrors) && (
            <div className="flex flex-wrap items-center gap-2">
              {showTools && (
                <ToggleGroup
                  type="multiple"
                  variant="outline"
                  size="sm"
                  aria-label="Tool categories"
                  value={tools}
                  onValueChange={value => update({ tools: TOOL_CATEGORIES.filter(c => value.includes(c)) })}
                  className="flex-wrap"
                >
                  {present.map(cat => (
                    <ToggleGroupItem key={cat} value={cat}>
                      <CategoryKey category={cat} />
                      <span className="text-muted-foreground tabular-nums">{formatInt(counts.byCategory.get(cat) ?? 0)}</span>
                    </ToggleGroupItem>
                  ))}
                </ToggleGroup>
              )}
              {showErrors && (
                <Toggle variant="outline" size="sm" pressed={errorsOnly} onPressedChange={pressed => update({ errors: pressed ? '1' : undefined })}>
                  <span aria-hidden className="size-2 rounded-full bg-destructive" />
                  Errors
                  <span className="text-muted-foreground tabular-nums">{formatInt(counts.errors)}</span>
                </Toggle>
              )}
            </div>
          )}
          {run.prompt && (
            <Disclosure title="Prompt">
              <CodeBlock>{run.prompt}</CodeBlock>
            </Disclosure>
          )}
        </CardContent>
      )}
      <CardContent className="px-0">
        <div className="flex h-8 items-center gap-3 border-y px-(--card-spacing) text-xs font-medium whitespace-nowrap text-muted-foreground">
          <span className={COLUMN.turn}>Turn</span>
          <span className={COLUMN.time}>{search.x === 'ticks' ? 'Tick' : 'Time'}</span>
          <span className="min-w-0 flex-1" />
          <span className={COLUMN.tokens}>Tokens</span>
          <span className={COLUMN.cost}>Cost</span>
        </div>
        <div ref={list} className="relative max-h-160 overflow-y-auto">
          {rows.map(({ turn, i }) => {
            const open = i === selected;
            const summary = turnSummary(turn);
            const error = turnHasError(turn);
            return (
              <Collapsible
                key={i}
                data-turn={i + 1}
                open={open}
                onOpenChange={next => update({ turn: next ? i + 1 : undefined, t: undefined })}
                className={cn('border-b last:border-b-0', open && 'bg-muted/50')}
              >
                <CollapsibleTrigger className="flex h-10 w-full items-center gap-3 px-(--card-spacing) text-left transition-colors outline-none hover:bg-muted/50 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:ring-inset">
                  <span className={cn(COLUMN.turn, 'text-muted-foreground tabular-nums')}>{i + 1}</span>
                  <span className={cn(COLUMN.time, 'text-muted-foreground tabular-nums')}>
                    {search.x === 'ticks' ? formatInt(turnTick(turn, clock)) : formatClock(turn.at)}
                  </span>
                  <span className="flex min-w-0 flex-1 items-center gap-2">
                    {error && <span aria-label="Error" title="Error" className="size-2 shrink-0 rounded-full bg-destructive" />}
                    <span className={cn('min-w-0 flex-1 truncate', summary?.kind !== 'said' && 'font-mono text-xs text-muted-foreground')}>{summary?.text}</span>
                  </span>
                  <span className="flex shrink-0 items-center gap-2 text-xs">
                    {turnCategories(turn).map(cat => (
                      <CategoryKey key={cat} category={cat} compact count={turn.actions.filter(a => a.category === cat).length} />
                    ))}
                  </span>
                  <span className={cn(COLUMN.tokens, 'text-muted-foreground tabular-nums')}>{formatTokens((turn.input_tokens ?? 0) + (turn.output_tokens ?? 0))}</span>
                  <span className={cn(COLUMN.cost, 'tabular-nums')}>{formatCost(turn.cost)}</span>
                </CollapsibleTrigger>
                <CollapsibleContent>{open && <TurnDetail turn={turn} run={run} common={common} />}</CollapsibleContent>
              </Collapsible>
            );
          })}
          {rows.length === 0 && <p className="py-6 text-center text-muted-foreground">No call matches these filters.</p>}
        </div>
      </CardContent>
      {run.answer && (
        <CardFooter className="flex-col items-start gap-1">
          <h3 className="text-xs font-medium text-muted-foreground">Answer</h3>
          <p className="max-w-4xl wrap-break-word whitespace-pre-wrap">{run.answer}</p>
        </CardFooter>
      )}
    </Card>
  );
}
