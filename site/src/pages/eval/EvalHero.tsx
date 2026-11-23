/**
 * The eval's header, as a media card: on the left its sprite, the goal as the agents got it (which
 * says what wins) and its facts (budget, team, runs); on the right the game itself, the best run's last
 * moment, captioned with that run's pairing and result and opening it. Without a screenshot the card
 * is the text alone.
 */

import { Link } from '@tanstack/react-router';
import { EvalMark, VariantLabel } from '@/components/marks';
import { Card } from '@/components/ui/card';
import type { MetaItem } from '@/components/page';
import type { Eval, Run } from '@/data/types';
import { resultText, resultValue } from '@/lib/runResult';

/** The eval's best run with a screenshot: the fastest finish, else the most reached. */
function bestShown(e: Eval, runs: Run[]): Run | undefined {
  const shown = runs.filter(r => r.screenshot);
  const finished = shown.filter(r => r.success && r.ticks != null).sort((a, b) => a.ticks! - b.ticks!);
  if (e.target != null && finished.length) return finished[0];
  return [...shown].sort((a, b) => (resultValue(b) ?? -1) - (resultValue(a) ?? -1))[0];
}

export function EvalHero({ e, runs, meta }: { e: Eval; runs: Run[]; meta: MetaItem[] }) {
  const best = bestShown(e, runs);
  return (
    <Card className="gap-0 overflow-hidden py-0 md:flex-row">
      <div className="flex min-w-0 flex-1 flex-col justify-center gap-4 p-6 md:py-4">
        <div className="flex items-center gap-4">
          <span className="flex size-16 shrink-0 items-center justify-center rounded-lg bg-muted">
            <EvalMark evalId={e.id} size={40} />
          </span>
          <p className="min-w-0 text-base font-medium text-pretty">{e.goal}</p>
        </div>
        <dl className="flex flex-wrap gap-x-8 gap-y-2 text-sm">
          {meta.map(m => (
            <div key={m.term} className="flex flex-col gap-0.5">
              <dt className="text-muted-foreground">{m.term}</dt>
              <dd className="tabular-nums **:font-normal">{m.value}</dd>
            </div>
          ))}
        </dl>
      </div>
      {best && (
        <Link
          to="/runs/$runId"
          params={{ runId: best.id }}
          search={{} as never}
          className="group relative block shrink-0 outline-none focus-visible:ring-3 focus-visible:ring-ring/50 md:w-2/5"
          title="Open the best run"
        >
          <img src={`/data/${best.screenshot}`} alt="The best run's last moment in the game" className="aspect-video w-full animate-fade-in object-cover md:aspect-auto md:h-44" />
          <span className="absolute bottom-3 left-3 flex max-w-[calc(100%-1.5rem)] items-center gap-2 rounded-md bg-card/90 px-2 py-1 text-sm">
            <span className="text-muted-foreground">Best run</span>
            <VariantLabel run={best} compact className="min-w-0" />
            <span className="tabular-nums">{resultText(best, e)}</span>
          </span>
        </Link>
      )}
    </Card>
  );
}
