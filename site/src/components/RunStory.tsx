/**
 * What a run did, in a table row: its one sentence (site/summarize.py), muted, at most two lines.
 * Hovering it shows the whole sentence and the run's chapters in order.
 */

import { useQuery } from '@tanstack/react-query';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { runSummaryQuery } from '@/data/queries';
import type { Run } from '@/data/types';

export function RunStory({ run }: { run: Run }) {
  const { data: told } = useQuery({ ...runSummaryQuery(run.id), enabled: Boolean(run.summary) });
  const summary = told?.summary ?? run.summary;
  if (!summary) return null;
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="line-clamp-2 max-w-xl min-w-56 whitespace-normal text-muted-foreground">{summary}</span>
      </TooltipTrigger>
      <TooltipContent align="start" className="flex max-w-96 flex-col gap-2">
        <span>{summary}</span>
        {told && told.chapters.length > 0 && (
          <ol className="list-inside list-decimal">
            {told.chapters.map(c => (
              <li key={c.from_tick}>{c.title}</li>
            ))}
          </ol>
        )}
      </TooltipContent>
    </Tooltip>
  );
}
