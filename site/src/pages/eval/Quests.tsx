/**
 * The quests across an eval about quests (quest points, Dragon Slayer, Hero's Quest), in its Quests
 * tab: first the usual order (every quest and step some run reached, by the median game time runs
 * reached it, and how many did), then each run's quests in the order it finished them, in the
 * leaderboard's order. On Dragon Slayer and Hero's Quest the quest's own steps and the quest points
 * it asks for (32, 55) are part of the order, so the route to the requirement and through the quest
 * reads in one line. Read from the eval file's `quests` (export.py).
 *
 * Also the pieces the Items and Skills tabs share (Held.tsx): a run's name in a row, a sprite on its
 * tile, and the table of runs that each list what they ended with under their name.
 */

import type { JSX, ReactNode } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { createColumnHelper, type ColumnDef } from '@tanstack/react-table';
import { Empty, Tip } from '@/components/bits';
import { DataTable } from '@/components/DataTable';
import { Sprite, VariantLabel } from '@/components/marks';
import { PageSection } from '@/components/page';
import type { Eval, EvalRuns, Run } from '@/data/types';
import { questSrc } from '@/lib/assets';
import { formatClock, formatInt } from '@/lib/format';
import { resultText } from '@/lib/runResult';
import { variantKey, type Variant } from '@/lib/series';
import { median } from '@/lib/stats';
import { useIsMobile } from '@/hooks/use-mobile';
import type { RankedVariant } from './model';

type Step = NonNullable<EvalRuns['runs'][string]['quests']>[number];

interface StepInfo {
  key: string;
  label: string;
  quest: string;
  badge?: string;
}

/** One step's key across runs, its label and its icon. */
function stepOf(s: Step): StepInfo {
  if (s.kind === 'qp')
    return {
      key: `qp-${s.qp}`,
      label: `${formatInt(s.qp ?? 0)} quest points`,
      quest: s.quest ?? 'dragon_slayer',
      badge: 'QP',
    };
  if (s.kind === 'stage')
    return {
      key: `${s.quest}-${s.stage}`,
      label: s.name ?? `Stage ${s.stage}`,
      quest: s.quest ?? 'dragon_slayer',
      badge: String(s.stage),
    };
  return { key: s.quest ?? s.name ?? '', label: s.name ?? s.quest ?? '', quest: s.quest ?? '' };
}

/** A game sprite on its tile, with a stack count or step number in its corner and its name on hover. */
export function SpriteTile({
  src,
  alt,
  badge,
  tip,
}: {
  src: string;
  alt: string;
  badge?: string;
  tip: ReactNode;
}): JSX.Element {
  return (
    <Tip content={tip}>
      <li className="relative flex size-9 items-center justify-center rounded-xs bg-muted-10">
        <Sprite src={src} size={32} alt={alt} />
        {/* On a plate, so it reads over a dark sprite as the game's own stack counts do */}
        {badge && (
          <span className="absolute top-0 left-0 rounded-2xs bg-surface px-0.5 text-xs font-medium text-foreground tabular-nums">
            {badge}
          </span>
        )}
      </li>
    </Tip>
  );
}

/** A run in a row: its pairing, compact, and its epoch. */
export function RunName({ run, variant }: { run: Run; variant: Variant }): JSX.Element {
  return (
    <span className="inline-flex min-w-0 items-center gap-1.5 whitespace-nowrap text-foreground">
      <VariantLabel run={run} variant={variant} compact />
      <span className="text-muted tabular-nums">#{run.epoch}</span>
    </span>
  );
}

export interface RunRow {
  run: Run;
  variant: Variant;
}

const runCol = createColumnHelper<RunRow>();

/**
 * Runs in the leaderboard's order, each with its result and what it ended with (`list`): beside it,
 * or on a phone under its name, so the result stays in view. A row opens its run.
 */
export function RunListTable<R extends RunRow>({
  e,
  rows,
  list,
}: {
  e: Eval;
  rows: R[];
  list: (row: R) => ReactNode;
}): JSX.Element {
  const navigate = useNavigate();
  const phone = useIsMobile();
  const result = (row: R): string => resultText(row.run, e);
  // A phone has one column: the name and result on a line, the list under them at the full width
  const columns: ColumnDef<RunRow, unknown>[] = phone
    ? [
        runCol.display({
          id: 'run',
          header: 'Run',
          meta: { wrap: true },
          cell: ({ row }) => (
            <span className="flex min-w-0 flex-col gap-2">
              <span className="flex items-center justify-between gap-3">
                <RunName run={row.original.run} variant={row.original.variant} />
                <span className="tabular-nums">{result(row.original as R)}</span>
              </span>
              {list(row.original as R)}
            </span>
          ),
        }),
      ]
    : [
        runCol.display({
          id: 'run',
          header: 'Run',
          meta: { className: 'align-top' },
          cell: ({ row }) => <RunName run={row.original.run} variant={row.original.variant} />,
        }),
        runCol.display({
          id: 'result',
          header: e.target != null ? 'Result' : e.measure,
          meta: { numeric: true, className: 'align-top' },
          cell: ({ row }) => result(row.original as R),
        }),
        runCol.display({
          id: 'list',
          header: () => <span className="sr-only">Ended with</span>,
          meta: { wrap: true },
          cell: ({ row }) => list(row.original as R),
        }),
      ];
  return (
    <DataTable<RunRow>
      data={rows}
      columns={columns}
      getRowId={r => r.run.id}
      hoverId={r => variantKey(r.run)}
      onRowClick={r => navigate({ to: '/runs/$runId', params: { runId: r.run.id }, search: {} as never })}
    />
  );
}

interface UsualStep {
  step: StepInfo;
  ticks: number[];
  at: number;
}

const usualCol = createColumnHelper<UsualStep>();

export function QuestsView({
  e,
  ranked,
  grid,
}: {
  e: Eval;
  ranked: RankedVariant[];
  grid: EvalRuns | undefined;
}): JSX.Element | null {
  if (!grid) return null;
  const time = (tick: number): string => formatClock((tick * e.tick_ms) / 1000);
  // Runs in the leaderboard's order, each pairing's by epoch, with their steps in order
  const rows = ranked.flatMap(r => r.runs.map(run => ({ run, variant: r.variant, steps: grid.runs[run.id]?.quests })));
  const told = rows.filter((r): r is typeof r & { steps: Step[] } => r.steps != null);
  if (told.length === 0) return <Empty>These runs were exported without their quests.</Empty>;

  // Each step some run reached: how many runs did, and the median time they reached it
  const seen = new Map<string, { step: StepInfo; ticks: number[] }>();
  for (const r of told)
    for (const s of r.steps) {
      const step = stepOf(s);
      const at = seen.get(step.key) ?? { step, ticks: [] };
      if (at.ticks.length < told.length) at.ticks.push(s.tick);
      seen.set(step.key, at);
    }
  const usual = [...seen.values()].map(v => ({ ...v, at: median(v.ticks)! })).sort((a, b) => a.at - b.at);

  const usualColumns = [
    usualCol.display({
      id: 'quest',
      header: 'Quest',
      // A phone wraps long names, so the times stay in view
      meta: { className: 'max-md:whitespace-normal' },
      cell: ({ row }) => (
        <span className="flex items-center gap-2">
          <Sprite src={questSrc(row.original.step.quest)} size={20} alt="" />
          {row.original.step.label}
        </span>
      ),
    }),
    usualCol.display({
      id: 'runs',
      header: 'Runs',
      meta: { numeric: true },
      cell: ({ row }) => (
        <>
          {formatInt(row.original.ticks.length)}
          <span className="text-muted"> of {formatInt(told.length)}</span>
        </>
      ),
    }),
    usualCol.display({
      id: 'at',
      header: 'Median time',
      meta: { numeric: true },
      cell: ({ row }) => time(row.original.at),
    }),
  ] as ColumnDef<UsualStep, unknown>[];

  return (
    <>
      <PageSection
        title="The usual order"
        description={`Every quest and step some of the ${formatInt(told.length)} runs reached, by the median time they reached it`}
      >
        <DataTable data={usual} columns={usualColumns} getRowId={u => u.step.key} />
      </PageSection>
      <PageSection title="Each run's quests in order" description="Hover a quest for when it was done">
        <RunListTable
          e={e}
          rows={told}
          list={r =>
            r.steps.length > 0 ? (
              <ol className="flex min-w-0 flex-wrap gap-1">
                {r.steps.map(s => {
                  const step = stepOf(s);
                  return (
                    // A step is reached once per run; the tick tells two quests of the same name apart
                    <SpriteTile
                      key={`${step.key}-${s.tick}`}
                      src={questSrc(step.quest)}
                      alt={step.label}
                      badge={step.badge}
                      tip={`${step.label}, ${time(s.tick)}`}
                    />
                  );
                })}
              </ol>
            ) : (
              <span className="text-muted">No quest done</span>
            )
          }
        />
      </PageSection>
    </>
  );
}
