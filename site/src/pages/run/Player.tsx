/**
 * The game itself, in the browser: the run's recording drawn by rs-world, following the agent's
 * character at the playhead (playhead.ts). Placeholder: the end-of-run screenshot and a link to the
 * full replay. Owned by its own work item (see site/AGENTS.md, "Run page").
 */

import type { RunDetail } from '@/data/types';

export function Player({ run, replay }: { run: RunDetail; replay: string | null }) {
  const shot = run.screenshot ? `/data/${run.screenshot}` : null;
  return (
    <div className="relative aspect-video w-full overflow-hidden rounded-lg bg-muted">
      {shot && <img src={shot} alt="The game at the end of the run" className="size-full object-cover" />}
      {replay && (
        <a href={replay} target="_blank" rel="noopener noreferrer" className="absolute right-3 bottom-3 rounded-md bg-background/90 px-2.5 py-1 text-sm">
          Watch the replay
        </a>
      )}
    </div>
  );
}
