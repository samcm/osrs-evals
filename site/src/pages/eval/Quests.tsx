/**
 * The quests across an eval about quests (quest points, Dragon Slayer, Hero's Quest), in its Quests
 * tab: first the usual order (every quest and step some run reached, by the median game time runs
 * reached it, and how many did), then each run's quests in the order it finished them, in the
 * leaderboard's order. On Dragon Slayer and Hero's Quest the quest's own steps and the quest points
 * it asks for (32, 55) are part of the order, so the route to the requirement and through the quest
 * reads in one line. Read from the eval file's `quests` (export.py).
 */

import { Link } from '@tanstack/react-router';
import { Empty } from '@/components/bits';
import { Sprite, VariantLabel } from '@/components/marks';
import { PageSection } from '@/components/page';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import type { Eval, EvalRuns } from '@/data/types';
import { questSrc } from '@/lib/assets';
import { formatClock, formatInt } from '@/lib/format';
import { setHovered } from '@/lib/hover';
import { resultText } from '@/lib/runResult';
import { variantKey } from '@/lib/series';
import { median } from '@/lib/stats';
import type { RankedVariant } from './model';

type Step = NonNullable<EvalRuns['runs'][string]['quests']>[number];

/** One step's key across runs, its label and its icon. */
function stepOf(s: Step): { key: string; label: string; quest: string; badge?: string } {
  if (s.kind === 'qp') return { key: `qp-${s.qp}`, label: `${formatInt(s.qp ?? 0)} quest points`, quest: s.quest ?? 'dragon_slayer', badge: 'QP' };
  if (s.kind === 'stage') return { key: `${s.quest}-${s.stage}`, label: s.name ?? `Stage ${s.stage}`, quest: s.quest ?? 'dragon_slayer', badge: String(s.stage) };
  return { key: s.quest ?? s.name ?? '', label: s.name ?? s.quest ?? '', quest: s.quest ?? '' };
}

function StepCell({ step, time }: { step: ReturnType<typeof stepOf>; time?: string }) {
  return (
    <li className="relative flex size-9 items-center justify-center rounded-sm bg-muted/60" title={time ? `${step.label}, ${time}` : step.label}>
      <Sprite src={questSrc(step.quest)} size={32} alt={step.label} />
      {step.badge && <span className="absolute top-0 left-0.5 text-xs leading-none font-medium tabular-nums text-shadow-sm text-shadow-card">{step.badge}</span>}
    </li>
  );
}

export function QuestsView({ e, ranked, grid }: { e: Eval; ranked: RankedVariant[]; grid: EvalRuns | undefined }) {
  if (!grid) return null;
  const time = (tick: number) => formatClock((tick * e.tick_ms) / 1000);
  // Runs in the leaderboard's order, each pairing's by epoch, with their steps in order
  const rows = ranked.flatMap(r => r.runs.map(run => ({ run, variant: r.variant, steps: grid.runs[run.id]?.quests })));
  const told = rows.filter(r => r.steps != null);
  if (told.length === 0) return <Empty>These runs were exported without their quests.</Empty>;

  // Each step some run reached: how many runs did, and the median time they reached it
  const seen = new Map<string, { step: ReturnType<typeof stepOf>; ticks: number[] }>();
  for (const r of told)
    for (const s of r.steps!) {
      const step = stepOf(s);
      const at = seen.get(step.key) ?? { step, ticks: [] };
      if (at.ticks.length < told.length) at.ticks.push(s.tick);
      seen.set(step.key, at);
    }
  const usual = [...seen.values()].map(v => ({ ...v, at: median(v.ticks)! })).sort((a, b) => a.at - b.at);

  return (
    <>
      <PageSection title="The usual order" description={`Every quest and step some of the ${formatInt(told.length)} runs reached, by the median time they reached it`}>
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead>Quest</TableHead>
              <TableHead className="text-right">Runs</TableHead>
              <TableHead className="text-right">Median time</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {usual.map(({ step, ticks, at }) => (
              <TableRow key={step.key}>
                <TableCell>
                  <span className="inline-flex items-center gap-2">
                    <Sprite src={questSrc(step.quest)} size={20} alt="" />
                    {step.label}
                  </span>
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {formatInt(ticks.length)}
                  <span className="text-muted-foreground"> of {formatInt(told.length)}</span>
                </TableCell>
                <TableCell className="text-right tabular-nums">{time(at)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </PageSection>
      <PageSection title="Each run's quests in order" description="Hover a quest for when it was done">
        <ol className="flex flex-col divide-y">
          {told.map(r => (
            <li
              key={r.run.id}
              className="flex flex-col gap-2 py-3 first:pt-0 last:pb-0 md:flex-row md:items-start md:gap-4"
              onMouseEnter={() => setHovered(variantKey(r.run))}
              onMouseLeave={() => setHovered(undefined)}
            >
              <span className="flex min-w-0 items-center justify-between gap-3 md:w-72 md:shrink-0">
                <Link
                  to="/runs/$runId"
                  params={{ runId: r.run.id }}
                  search={{} as never}
                  className="inline-flex min-w-0 items-center gap-1.5 rounded-sm whitespace-nowrap outline-none hover:underline hover:underline-offset-4 focus-visible:ring-3 focus-visible:ring-ring/50"
                >
                  <VariantLabel run={r.run} variant={r.variant} compact />
                  <span className="text-muted-foreground tabular-nums">#{r.run.epoch}</span>
                </Link>
                <span className="text-sm tabular-nums" title={e.measure}>
                  {resultText(r.run, e)}
                </span>
              </span>
              {r.steps!.length > 0 ? (
                <ol className="flex min-w-0 flex-wrap gap-1">
                  {r.steps!.map((s, i) => (
                    <StepCell key={i} step={stepOf(s)} time={time(s.tick)} />
                  ))}
                </ol>
              ) : (
                <span className="text-sm text-muted-foreground">No quest done</span>
              )}
            </li>
          ))}
        </ol>
      </PageSection>
    </>
  );
}
