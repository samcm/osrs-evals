/**
 * What the runs ended with, across the eval (its own tab): on an eval about items (collection, team
 * wealth), the items most runs ended holding, then each run's items in the leaderboard's order (the
 * commonest first for collection, so a run's rare finds stand out at its end; the most valuable first
 * for wealth); on total level, each run's level in every skill it trained, as the game's skill icons;
 * on an eval about quests, the quests in order (Quests.tsx).
 * Read from the eval file's `end` (export.py held_at_end).
 */

import { Link } from '@tanstack/react-router';
import { Empty } from '@/components/bits';
import { Sprite, VariantLabel } from '@/components/marks';
import { PageSection } from '@/components/page';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import type { Eval, EvalRuns } from '@/data/types';
import { skillSrc } from '@/lib/assets';
import { evalBase } from '@/lib/evals';
import { formatInt } from '@/lib/format';
import { setHovered } from '@/lib/hover';
import { itemInfo, itemName, itemSprite, stackCount } from '@/lib/items';
import { resultText } from '@/lib/runResult';
import { variantKey } from '@/lib/series';
import { cn } from '@/lib/utils';
import { tint } from '../overview/Leaderboard';
import type { RankedVariant } from './model';
import { QuestsView } from './Quests';

/** The tab's name on an eval that has one: what the eval is about. */
export function heldTab(e: Eval): string | null {
  const base = evalBase(e.id);
  if (base === 'collection' || base === 'team_wealth') return 'Items';
  if (base === 'total_level') return 'Skills';
  if (base === 'quest_points' || base === 'dragon_slayer' || base === 'heros_quest') return 'Quests';
  return null;
}

function ItemCell({ id, count, note }: { id: string; count: number; note?: string }) {
  return (
    <li className="relative flex size-9 items-center justify-center rounded-sm bg-muted/60" title={`${itemName(id)}${count > 1 ? `, ${formatInt(count)}` : ''}${note ? `: ${note}` : ''}`}>
      <Sprite src={itemSprite(id, count)} size={32} alt={itemName(id)} />
      {count > 1 && <span className="absolute top-0 left-0.5 text-xs leading-none font-medium tabular-nums text-shadow-sm text-shadow-card">{stackCount(count)}</span>}
    </li>
  );
}

export function HeldView({ e, ranked, grid }: { e: Eval; ranked: RankedVariant[]; grid: EvalRuns | undefined }) {
  if (heldTab(e) === 'Quests') return <QuestsView e={e} ranked={ranked} grid={grid} />;
  const wealth = evalBase(e.id) === 'team_wealth';
  const skills = evalBase(e.id) === 'total_level';
  // Runs in the leaderboard's order, each pairing's by epoch
  const rows = ranked.flatMap(r => r.runs.map(run => ({ run, variant: r.variant, end: grid?.runs[run.id]?.end })));
  const ended = rows.filter(r => r.end?.items || r.end?.levels);
  if (!grid) return null;
  if (ended.length === 0) return <Empty>These runs were exported without what they held.</Empty>;

  const label = (row: (typeof rows)[number]) => (
    <Link
      to="/runs/$runId"
      params={{ runId: row.run.id }}
      search={{} as never}
      className="inline-flex min-w-0 items-center gap-1.5 rounded-sm whitespace-nowrap outline-none hover:underline hover:underline-offset-4 focus-visible:ring-3 focus-visible:ring-ring/50"
    >
      <VariantLabel run={row.run} variant={row.variant} compact />
      <span className="text-muted-foreground tabular-nums">#{row.run.epoch}</span>
    </Link>
  );

  if (skills) {
    // Every skill some run trained, the most trained first
    const total = new Map<string, number>();
    for (const r of ended) for (const [s, l] of Object.entries(r.end?.levels ?? {})) total.set(s, (total.get(s) ?? 0) + l);
    const trained = [...total.keys()].filter(s => ended.some(r => (r.end?.levels?.[s] ?? 1) > 1)).sort((a, b) => total.get(b)! - total.get(a)!);
    return (
      <PageSection title="Levels at the end">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead>
                <span className="sr-only">Run</span>
              </TableHead>
              <TableHead className="text-right">{e.measure}</TableHead>
              {trained.map(s => (
                <TableHead key={s} className="w-px text-center" title={s.charAt(0).toUpperCase() + s.slice(1)}>
                  <Sprite src={skillSrc(s)} size={20} alt={s} />
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {ended.map(r => (
              <TableRow key={r.run.id} onMouseEnter={() => setHovered(variantKey(r.run))} onMouseLeave={() => setHovered(undefined)}>
                <TableCell>{label(r)}</TableCell>
                <TableCell className="text-right tabular-nums">{resultText(r.run, e)}</TableCell>
                {trained.map(s => {
                  const level = r.end?.levels?.[s] ?? 1;
                  return (
                    <TableCell key={s} className="text-center">
                      <span className={cn('inline-flex h-6 w-9 items-center justify-center rounded-sm tabular-nums', level > 1 ? tint(level / 99) : 'text-muted-foreground')}>{level}</span>
                    </TableCell>
                  );
                })}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </PageSection>
    );
  }

  // How many runs ended holding each item, and each item's value over the runs
  const held = new Map<string, number>();
  for (const r of ended) for (const id of Object.keys(r.end?.items ?? {})) held.set(id, (held.get(id) ?? 0) + 1);
  const common = [...held.entries()].sort((a, b) => b[1] - a[1] || Number(a[0]) - Number(b[0]));
  const value = (id: string, n: number) => n * (itemInfo(id)?.cost ?? 0);
  const order = (items: Record<string, number>) =>
    Object.entries(items).sort(wealth ? (a, b) => value(b[0], b[1]) - value(a[0], a[1]) : (a, b) => (held.get(b[0]) ?? 0) - (held.get(a[0]) ?? 0) || Number(a[0]) - Number(b[0]));

  return (
    <>
      <PageSection title="Most held" description={`Of ${formatInt(ended.length)} runs, how many ended holding each`}>
        <ol className="flex flex-wrap gap-x-3 gap-y-2">
          {common.slice(0, 48).map(([id, n]) => (
            <li key={id} className="flex flex-col items-center gap-0.5" title={`${itemName(id)}: ${formatInt(n)} of ${formatInt(ended.length)} runs`}>
              <span className="flex size-9 items-center justify-center rounded-sm bg-muted/60">
                <Sprite src={itemSprite(id)} size={32} alt={itemName(id)} />
              </span>
              <span className="text-xs text-muted-foreground tabular-nums">{n}</span>
            </li>
          ))}
        </ol>
      </PageSection>
      <PageSection title="What each run ended with" description={wealth ? 'The most valuable first' : 'The commonest first, so rare finds come last'}>
        <ol className="flex flex-col divide-y">
          {ended.map(r => (
            <li
              key={r.run.id}
              className="flex flex-col gap-2 py-3 first:pt-0 last:pb-0 md:flex-row md:items-start md:gap-4"
              onMouseEnter={() => setHovered(variantKey(r.run))}
              onMouseLeave={() => setHovered(undefined)}
            >
              <span className="flex min-w-0 items-center justify-between gap-3 md:w-72 md:shrink-0">
                {label(r)}
                <span className="text-sm tabular-nums" title={e.measure}>
                  {resultText(r.run, e)}
                </span>
              </span>
              <ol className="flex min-w-0 flex-wrap gap-1">
                {order(r.end?.items ?? {}).map(([id, n]) => (
                  <ItemCell key={id} id={id} count={n} note={wealth ? `${formatInt(value(id, n))} coins` : undefined} />
                ))}
              </ol>
            </li>
          ))}
        </ol>
      </PageSection>
    </>
  );
}
