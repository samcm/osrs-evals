/**
 * What the runs ended with, across the eval (its own tab): on an eval about items (collection, team
 * wealth), the items most runs ended holding, then each run's items in the leaderboard's order (the
 * commonest first for collection, so a run's rare finds stand out at its end; the most valuable first
 * for wealth); on total level, each run's level in every skill it trained, as the game's skill icons;
 * on an eval about quests, the quests in order (Quests.tsx).
 * Read from the eval file's `end` (export.py held_at_end).
 */

import type { JSX } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { createColumnHelper, type ColumnDef } from '@tanstack/react-table';
import clsx from 'clsx';
import { Empty, Tip } from '@/components/bits';
import { DataTable } from '@/components/DataTable';
import { Sprite } from '@/components/marks';
import { PageSection } from '@/components/page';
import type { Eval, EvalRuns } from '@/data/types';
import { skillSrc } from '@/lib/assets';
import { evalBase } from '@/lib/evals';
import { formatInt } from '@/lib/format';
import { itemInfo, itemName, itemSprite, stackCount } from '@/lib/items';
import { resultText } from '@/lib/runResult';
import { variantKey } from '@/lib/series';
import { heldTab, type RankedVariant } from '@/pages/eval/model';
import { QuestsView, RunListTable, RunName, SpriteTile, type RunRow } from './Quests';

/** A level's cell: one hue in tint steps, deeper for a higher level; an untrained skill stays plain. */
const LEVEL_TINTS = ['bg-success-5', 'bg-success-15', 'bg-success-25', 'bg-success-40', 'bg-success-50'];
const levelTint = (level: number): string =>
  LEVEL_TINTS[Math.min(LEVEL_TINTS.length - 1, Math.floor((level / 99) * LEVEL_TINTS.length))];

type Ended = RunRow & { end: NonNullable<EvalRuns['runs'][string]['end']> };

const levelCol = createColumnHelper<Ended>();

/** Each run's level in every skill some run trained, the most trained first. */
function LevelsTable({ e, ended }: { e: Eval; ended: Ended[] }): JSX.Element {
  const navigate = useNavigate();
  const total = new Map<string, number>();
  for (const r of ended) for (const [s, l] of Object.entries(r.end.levels ?? {})) total.set(s, (total.get(s) ?? 0) + l);
  const trained = [...total.keys()]
    .filter(s => ended.some(r => (r.end.levels?.[s] ?? 1) > 1))
    .sort((a, b) => total.get(b)! - total.get(a)!);
  const columns = [
    levelCol.display({
      id: 'run',
      header: () => <span className="sr-only">Run</span>,
      cell: ({ row }) => <RunName run={row.original.run} variant={row.original.variant} />,
    }),
    levelCol.display({
      id: 'result',
      header: e.measure,
      meta: { numeric: true },
      cell: ({ row }) => resultText(row.original.run, e),
    }),
    ...trained.map(s =>
      levelCol.display({
        id: s,
        header: () => (
          <Tip content={s.charAt(0).toUpperCase() + s.slice(1)}>
            <span className="inline-flex">
              <Sprite src={skillSrc(s)} size={20} alt={s} />
            </span>
          </Tip>
        ),
        meta: { numeric: true },
        cell: ({ row }) => {
          const level = row.original.end.levels?.[s] ?? 1;
          return (
            <span
              className={clsx(
                'inline-flex h-6 w-9 items-center justify-center rounded-xs tabular-nums',
                level > 1 ? levelTint(level) : 'text-muted'
              )}
            >
              {level}
            </span>
          );
        },
      })
    ),
  ] as ColumnDef<Ended, unknown>[];
  return (
    <PageSection title="Levels at the end">
      <DataTable
        data={ended}
        columns={columns}
        getRowId={r => r.run.id}
        density="compact"
        hoverId={r => variantKey(r.run)}
        onRowClick={r => navigate({ to: '/runs/$runId', params: { runId: r.run.id }, search: {} as never })}
      />
    </PageSection>
  );
}

export function HeldView({
  e,
  ranked,
  grid,
}: {
  e: Eval;
  ranked: RankedVariant[];
  grid: EvalRuns | undefined;
}): JSX.Element | null {
  if (heldTab(e) === 'Quests') return <QuestsView e={e} ranked={ranked} grid={grid} />;
  if (!grid) return null;
  const wealth = evalBase(e.id) === 'team_wealth';
  // Runs in the leaderboard's order, each pairing's by epoch
  const ended = ranked
    .flatMap(r => r.runs.map(run => ({ run, variant: r.variant, end: grid.runs[run.id]?.end })))
    .filter((r): r is Ended => r.end?.items != null || r.end?.levels != null);
  if (ended.length === 0) return <Empty>These runs were exported without what they held.</Empty>;
  if (evalBase(e.id) === 'total_level') return <LevelsTable e={e} ended={ended} />;

  // How many runs ended holding each item, and each item's value over the runs
  const held = new Map<string, number>();
  for (const r of ended) for (const id of Object.keys(r.end.items ?? {})) held.set(id, (held.get(id) ?? 0) + 1);
  const common = [...held.entries()].sort((a, b) => b[1] - a[1] || Number(a[0]) - Number(b[0]));
  const value = (id: string, n: number): number => n * (itemInfo(id)?.cost ?? 0);
  const order = (items: Record<string, number>): [string, number][] =>
    Object.entries(items).sort(
      wealth
        ? (a, b) => value(b[0], b[1]) - value(a[0], a[1])
        : (a, b) => (held.get(b[0]) ?? 0) - (held.get(a[0]) ?? 0) || Number(a[0]) - Number(b[0])
    );

  return (
    <>
      <PageSection title="Most held" description={`Of ${formatInt(ended.length)} runs, how many ended holding each`}>
        <ol className="flex flex-wrap gap-x-3 gap-y-2">
          {common.slice(0, 48).map(([id, n]) => (
            <Tip key={id} content={`${itemName(id)}: ${formatInt(n)} of ${formatInt(ended.length)} runs`}>
              <li className="flex flex-col items-center gap-0.5">
                <span className="flex size-9 items-center justify-center rounded-xs bg-muted-10">
                  <Sprite src={itemSprite(id)} size={32} alt={itemName(id)} />
                </span>
                <span className="text-xs text-muted tabular-nums">{n}</span>
              </li>
            </Tip>
          ))}
        </ol>
      </PageSection>
      <PageSection
        title="What each run ended with"
        description={wealth ? 'The most valuable first' : 'The commonest first, so rare finds come last'}
      >
        <RunListTable
          e={e}
          rows={ended}
          list={r => (
            <ol className="flex min-w-0 flex-wrap gap-1">
              {order(r.end.items ?? {}).map(([id, n]) => (
                <SpriteTile
                  key={id}
                  src={itemSprite(id, n)}
                  alt={itemName(id)}
                  badge={n > 1 ? stackCount(n) : undefined}
                  tip={`${itemName(id)}${n > 1 ? `, ${formatInt(n)}` : ''}${wealth ? `: ${formatInt(value(id, n))} coins` : ''}`}
                />
              ))}
            </ol>
          )}
        />
      </PageSection>
    </>
  );
}
