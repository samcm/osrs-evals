/**
 * What a run did, readable beside its neighbours in a table: its one sentence whole, then its
 * chapters in order (site/summarize.py), each opening the run at that chapter, its text on hover.
 * A phone keeps the sentences, so runs still compare in a column; the chapters are on the run's page.
 */

import { ChevronRightIcon } from 'lucide-react';
import { Link } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { runSummaryQuery } from '@/data/queries';
import type { Run } from '@/data/types';

export function RunStory({ run }: { run: Run }) {
  const { data: told } = useQuery({ ...runSummaryQuery(run.id), enabled: Boolean(run.summary) });
  const summary = told?.summary ?? run.summary;
  if (!summary) return null;
  return (
    <span className="flex max-w-xl min-w-56 flex-col gap-1 whitespace-normal">
      <span className="text-muted-foreground">{summary}</span>
      {told && told.chapters.length > 0 && (
        <ol className="flex flex-wrap items-center gap-x-1 gap-y-0.5 text-xs max-md:hidden" aria-label="Chapters">
          {told.chapters.map((c, i) => (
            <li key={c.from_tick} className="inline-flex items-center gap-1">
              {i > 0 && <ChevronRightIcon aria-hidden className="size-3 text-muted-foreground" />}
              <Tooltip>
                <TooltipTrigger asChild>
                  <Link
                    to="/runs/$runId"
                    params={{ runId: run.id }}
                    search={{ t: c.from_tick } as never}
                    onClick={event => event.stopPropagation()}
                    className="rounded-sm underline-offset-4 outline-none hover:underline focus-visible:ring-3 focus-visible:ring-ring/50"
                  >
                    {c.title}
                  </Link>
                </TooltipTrigger>
                <TooltipContent className="max-w-80">{c.text}</TooltipContent>
              </Tooltip>
            </li>
          ))}
        </ol>
      )}
    </span>
  );
}
