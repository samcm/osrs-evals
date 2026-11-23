/**
 * What a run did, readable beside its neighbours in a table: its one sentence whole, and under it its
 * chapters (site/summarize.py) as one thin bar in its model's colour, a segment per chapter on a time
 * scale shared by the rows (`span`, in ticks), so a quicker run's bar ends sooner. A segment names its
 * chapter on hover and opens the run there.
 */

import { Link } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { runSummaryQuery } from '@/data/queries';
import type { Run } from '@/data/types';
import { variantOf } from '@/lib/series';
import { cn } from '@/lib/utils';

export function RunStory({ run, span }: { run: Run; span?: number }) {
  const { data: told } = useQuery({ ...runSummaryQuery(run.id), enabled: Boolean(run.summary) });
  const summary = told?.summary ?? run.summary;
  if (!summary) return null;
  const chapters = told?.chapters ?? [];
  const end = Math.max(1, span ?? chapters.at(-1)?.to_tick ?? 1);
  const color = variantOf(run).color.swatchClassName;
  return (
    <span className="flex max-w-xl min-w-56 flex-col gap-1.5 whitespace-normal">
      <span>{summary}</span>
      {chapters.length > 0 && (
        <span className="flex h-1.5 gap-0.5 max-md:hidden" aria-label="Chapters">
          {chapters.map(c => (
            <Tooltip key={c.from_tick}>
              <TooltipTrigger asChild>
                <Link
                  to="/runs/$runId"
                  params={{ runId: run.id }}
                  search={{ t: c.from_tick } as never}
                  onClick={event => event.stopPropagation()}
                  aria-label={c.title}
                  className={cn('h-full rounded-full opacity-70 outline-none hover:opacity-100 focus-visible:opacity-100', color)}
                  style={{ width: `${(Math.max(0, c.to_tick - c.from_tick) / end) * 100}%` }}
                />
              </TooltipTrigger>
              <TooltipContent className="max-w-80">
                <span className="font-medium">{c.title}.</span> {c.text}
              </TooltipContent>
            </Tooltip>
          ))}
        </span>
      )}
    </span>
  );
}
