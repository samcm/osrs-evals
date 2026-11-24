/**
 * What a run did, in a table row: its one sentence (site/summarize.py), muted, at most two lines.
 * Hovering it shows the whole sentence and its chapters in order.
 */

import type { JSX } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Tooltip } from '@/components/Overlays/Tooltip';
import { runSummaryQuery } from '@/data/queries';
import type { Run } from '@/data/types';

export function RunStory({ run }: { run: Run }): JSX.Element | null {
  const { data: told } = useQuery({ ...runSummaryQuery(run.id), enabled: Boolean(run.summary) });
  const summary = told?.summary ?? run.summary;
  if (!summary) return null;
  return (
    <Tooltip
      side="bottom"
      className="max-w-md"
      content={
        <span className="flex flex-col items-start gap-2">
          <span>{summary}</span>
          {told && told.chapters.length > 0 && (
            <ol className="list-inside list-decimal">
              {told.chapters.map(c => (
                <li key={c.from_tick}>{c.title}</li>
              ))}
            </ol>
          )}
        </span>
      }
    >
      <span className="line-clamp-2 max-w-xl min-w-56 whitespace-normal text-muted">{summary}</span>
    </Tooltip>
  );
}
