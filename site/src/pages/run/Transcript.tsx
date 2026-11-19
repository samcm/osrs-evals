/** Every model call as one row: when, what the model said, what kind of tool it used, what it cost. The selected call opens. */

import { useEffect, useMemo, useRef, type ReactNode } from 'react';
import clsx from 'clsx';
import { Card } from '@/components/Card';
import { CodeBlock, Disclosure } from '@/components/bits';
import type { Action, RunDetail, ToolCategory, Turn } from '@/data/types';
import { formatClock, formatCost, formatInt, formatSeconds, formatTokens } from '@/lib/format';
import { useSearchUpdate } from '@/lib/search';
import { CATEGORIES, commonTool, turnCategories, turnHasError, turnSummary, turnTick, type Clock } from './model';
import { runSearch, TOOL_CATEGORIES, type RunSearch } from './search';

function Chip({ selected, onClick, children, title }: { selected: boolean; onClick: () => void; children: ReactNode; title?: string }) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      title={title}
      onClick={onClick}
      className={clsx(
        'inline-flex h-7 items-center gap-1.5 rounded-sm px-2.5 text-xs font-medium whitespace-nowrap outline -outline-offset-1 transition-colors focus-visible:ring-2 focus-visible:ring-primary-50',
        selected ? 'bg-primary-soft text-primary outline-primary-50' : 'bg-surface text-muted outline-border hover:bg-background hover:text-foreground'
      )}
    >
      {children}
    </button>
  );
}

function CategoryKey({ category, count, compact }: { category: ToolCategory; count?: number; compact?: boolean }) {
  const info = CATEGORIES[category];
  return (
    <span className="inline-flex items-center gap-1 whitespace-nowrap" title={compact ? info.label : undefined}>
      <span aria-hidden className={clsx('size-2 shrink-0 rounded-2xs', info.color.swatchClassName)} />
      <span className={clsx(compact && 'sr-only sm:not-sr-only')}>{info.label}</span>
      {count != null && count > 1 && <span className="text-muted tabular-nums">{count}</span>}
    </span>
  );
}

function Fact({ term, children }: { term: string; children: ReactNode }) {
  return (
    <div className="flex gap-1.5">
      <dt className="text-muted">{term}</dt>
      <dd className="text-foreground tabular-nums">{children}</dd>
    </div>
  );
}

function ActionView({ action, common }: { action: Action; common: string | null }) {
  const cut = action.output_chars != null && action.output != null && action.output_chars > action.output.length;
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
        <CategoryKey category={action.category} />
        {action.tool !== common && <span className="font-mono text-muted">{action.tool}</span>}
        {action.background && <span className="text-muted">In the background</span>}
        {action.seconds != null && <span className="text-muted tabular-nums">{formatSeconds(action.seconds)} s</span>}
        {action.sdk_calls.length > 0 && (
          <span className="flex min-w-0 flex-wrap gap-1">
            {[...new Set(action.sdk_calls)].map(f => (
              <span key={f} className="rounded-xs bg-muted-10 px-1.5 font-mono text-2xs/5 text-foreground">
                {f}
              </span>
            ))}
          </span>
        )}
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
    <div className="flex min-w-0 flex-col gap-3 pt-1 pr-4 pb-4 pl-15 sm:pr-5 sm:pl-18">
      {turn.text && <p className="max-w-4xl text-sm/6 wrap-break-word whitespace-pre-wrap text-foreground">{turn.text}</p>}
      <dl className="flex flex-wrap gap-x-5 gap-y-1 text-xs/5">
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

const COLUMN = {
  turn: 'w-8 shrink-0 text-right sm:w-10',
  time: 'w-12 shrink-0 text-right sm:w-14',
  tokens: 'hidden w-14 shrink-0 text-right md:block',
  cost: 'w-14 shrink-0 text-right sm:w-16',
};

export function Transcript({ run, clock, search }: { run: RunDetail; clock: Clock; search: RunSearch }) {
  const update = useSearchUpdate(runSearch);
  const list = useRef<HTMLOListElement>(null);
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
  const present = TOOL_CATEGORIES.filter(c => counts.byCategory.has(c) || tools.includes(c));
  // A filter in the URL keeps its chip, so it can always be turned off
  const showErrors = counts.errors > 0 || errorsOnly;

  const rows = turns
    .map((turn, i) => ({ turn, i }))
    .filter(
      ({ turn, i }) =>
        i === selected || ((tools.length === 0 || turn.actions.some(a => tools.includes(a.category))) && (!errorsOnly || turnHasError(turn)))
    );

  // The selected call scrolls into view inside the list, never moving the page
  useEffect(() => {
    const container = list.current;
    if (selected == null || !container) return;
    const row = container.querySelector<HTMLElement>(`[data-turn="${selected + 1}"]`);
    if (!row) return;
    const top = row.offsetTop - container.offsetTop;
    if (top < container.scrollTop || top + 40 > container.scrollTop + container.clientHeight) container.scrollTo({ top: Math.max(0, top - 8), behavior: 'smooth' });
  }, [selected]);

  const toggleTool = (cat: ToolCategory): void =>
    update({ tools: tools.includes(cat) ? tools.filter(t => t !== cat) : [...tools, cat] });

  return (
    <Card title="Transcript" flush>
      {(present.length > 1 || tools.length > 0 || showErrors) && (
        <div role="group" aria-label="Filter calls" className="flex flex-wrap gap-1.5 border-b border-border px-4 py-2.5 sm:px-5">
          {(present.length > 1 || tools.length > 0) &&
            present.map(cat => (
              <Chip key={cat} selected={tools.includes(cat)} onClick={() => toggleTool(cat)}>
                <CategoryKey category={cat} />
                <span className="text-muted tabular-nums">{formatInt(counts.byCategory.get(cat))}</span>
              </Chip>
            ))}
          {showErrors && (
            <Chip selected={errorsOnly} onClick={() => update({ errors: errorsOnly ? undefined : '1' })}>
              <span aria-hidden className="size-2 rounded-full bg-danger" />
              Errors
              <span className="text-muted tabular-nums">{formatInt(counts.errors)}</span>
            </Chip>
          )}
        </div>
      )}
      {run.prompt && (
        <div className="border-b border-border px-4 py-2 sm:px-5">
          <Disclosure title="Prompt">
            <CodeBlock>{run.prompt}</CodeBlock>
          </Disclosure>
        </div>
      )}
      <div className="flex items-center gap-3 border-b border-border px-4 py-2 text-xs font-medium whitespace-nowrap text-muted sm:px-5">
        <span className={COLUMN.turn}>Turn</span>
        <span className={COLUMN.time}>{search.x === 'ticks' ? 'Tick' : 'Time'}</span>
        <span className="min-w-0 flex-1" />
        <span className={COLUMN.tokens}>Tokens</span>
        <span className={COLUMN.cost}>Cost</span>
      </div>
      <ol ref={list} className="scrollbar-thin relative max-h-160 divide-y divide-border overflow-y-auto">
        {rows.map(({ turn, i }) => {
          const open = i === selected;
          const summary = turnSummary(turn);
          const error = turnHasError(turn);
          const categories = turnCategories(turn);
          return (
            <li key={i} data-turn={i + 1} className={clsx(open && 'bg-row-active')}>
              <button
                type="button"
                aria-expanded={open}
                onClick={() => update({ turn: open ? undefined : i + 1, t: undefined })}
                className="flex h-10 w-full items-center gap-3 px-4 text-left text-sm transition-colors hover:bg-background focus-visible:ring-2 focus-visible:ring-primary-50 focus-visible:outline-none focus-visible:ring-inset sm:px-5"
              >
                <span className={clsx(COLUMN.turn, 'text-muted tabular-nums')}>{i + 1}</span>
                <span className={clsx(COLUMN.time, 'text-muted tabular-nums')}>
                  {search.x === 'ticks' ? formatInt(turnTick(turn, clock)) : formatClock(turn.at)}
                </span>
                <span className="flex min-w-0 flex-1 items-center gap-2">
                  {error && <span aria-label="Error" title="Error" className="size-2 shrink-0 rounded-full bg-danger" />}
                  <span
                    className={clsx(
                      'min-w-0 flex-1 truncate',
                      summary?.kind === 'said' ? 'text-foreground' : 'font-mono text-xs text-muted'
                    )}
                  >
                    {summary?.text}
                  </span>
                </span>
                <span className="flex shrink-0 items-center gap-2 text-xs text-foreground">
                  {categories.map(cat => (
                    <CategoryKey key={cat} category={cat} compact count={turn.actions.filter(a => a.category === cat).length} />
                  ))}
                </span>
                <span className={clsx(COLUMN.tokens, 'text-muted tabular-nums')}>{formatTokens((turn.input_tokens ?? 0) + (turn.output_tokens ?? 0))}</span>
                <span className={clsx(COLUMN.cost, 'tabular-nums')}>{formatCost(turn.cost)}</span>
              </button>
              {open && <TurnDetail turn={turn} run={run} common={common} />}
            </li>
          );
        })}
        {rows.length === 0 && <li className="py-6 text-center text-sm text-muted">No call matches these filters.</li>}
      </ol>
      {run.answer && (
        <div className="flex flex-col gap-1 border-t border-border px-4 py-3 sm:px-5">
          <h3 className="text-xs font-medium text-muted">Answer</h3>
          <p className="max-w-4xl text-sm/6 wrap-break-word whitespace-pre-wrap text-foreground">{run.answer}</p>
        </div>
      )}
    </Card>
  );
}
