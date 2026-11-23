/**
 * What the run is doing at the playhead, in the summary's words (site/summarize.py): the chapter's
 * title and text, which of how many. It sits above the map in the column that stays on screen beside
 * the lanes, so it is always in view while the run plays. It reads the playhead itself, as the map does.
 */

import { Card, CardAction, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import type { RunDetail, RunSummary } from '@/data/types';
import { formatInt } from '@/lib/format';
import type { Clock } from './model';
import { useCommitted, usePlayhead } from './playhead';

export function NowCard({ run, clock, chapters }: { run: RunDetail; clock: Clock; chapters: RunSummary['chapters'] }) {
  const [committed] = useCommitted(run, clock);
  const head = usePlayhead(clock, committed);
  const i = chapters.findLastIndex(c => c.from_tick <= head.tick);
  const now = chapters[Math.max(0, i)];
  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle>{now.title}</CardTitle>
        <CardDescription className="text-pretty">{now.text}</CardDescription>
        <CardAction className="text-muted-foreground tabular-nums">
          {formatInt(Math.max(0, i) + 1)} of {formatInt(chapters.length)}
        </CardAction>
      </CardHeader>
    </Card>
  );
}
