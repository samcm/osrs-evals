/**
 * The eval's header, as a card: its sprite on a tile, the goal as the agents got it (which says what
 * wins) and its facts (budget, team, runs) as terms over values.
 */

import { EvalMark } from '@/components/marks';
import { Card } from '@/components/ui/card';
import type { MetaItem } from '@/components/page';
import type { Eval } from '@/data/types';

export function EvalHero({ e, meta }: { e: Eval; meta: MetaItem[] }) {
  return (
    <Card className="flex-col gap-4 p-6 md:flex-row md:items-center md:justify-between">
      <div className="flex min-w-0 items-center gap-4">
        <span className="flex size-16 shrink-0 items-center justify-center rounded-lg bg-muted">
          <EvalMark evalId={e.id} size={40} />
        </span>
        <p className="min-w-0 text-base font-medium text-pretty">{e.goal}</p>
      </div>
      <dl className="flex shrink-0 flex-wrap gap-x-8 gap-y-2 text-sm">
        {meta.map(m => (
          <div key={m.term} className="flex flex-col gap-0.5">
            <dt className="text-muted-foreground">{m.term}</dt>
            <dd className="tabular-nums **:font-normal">{m.value}</dd>
          </div>
        ))}
      </dl>
    </Card>
  );
}
