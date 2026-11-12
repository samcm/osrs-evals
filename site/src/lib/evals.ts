/** What each eval measures and the item sprites that stand for it. */

import type { Eval, Run } from '@/data/types';

interface EvalArt {
  /** Item ids under public/assets/items */
  items: { id: string; name: string }[];
  /** What the eval's value counts, for axis names */
  measure: string;
}

const ART: Record<string, EvalArt> = {
  cooks_assistant: {
    items: [
      { id: '1944', name: 'Egg' },
      { id: '1927', name: 'Bucket of milk' },
      { id: '1933', name: 'Pot of flour' },
    ],
    measure: 'Quest stage',
  },
  shrimps: {
    items: [
      { id: '317', name: 'Raw shrimps' },
      { id: '315', name: 'Shrimps' },
      { id: '323', name: 'Burnt shrimp' },
    ],
    measure: 'Shrimps cooked',
  },
  coins: { items: [{ id: '995', name: 'Coins' }], measure: 'Coins' },
  gold: { items: [{ id: '995-10000', name: 'Coins' }], measure: 'Coins' },
};

/** The eval an id is a variant of: cooks_assistant_x5 → cooks_assistant. */
export const evalBase = (evalId: string): string => evalId.replace(/_x\d+$/, '');

export function evalArt(evalId: string): EvalArt {
  return ART[evalBase(evalId)] ?? { items: [], measure: 'Value' };
}

/** Whether runs of this eval finish (reach a target) rather than score an amount. */
export const hasTarget = (e: Pick<Eval, 'target'>): boolean => e.target != null;

/** The outcome of a run as a word. */
export function outcomeWord(run: Pick<Run, 'success'>): 'Finished' | 'Not finished' | 'Scored' {
  if (run.success == null) return 'Scored';
  return run.success ? 'Finished' : 'Not finished';
}

/** Budget in minutes of wall-clock at the eval's tick rate. */
export const budgetMinutes = (e: Pick<Eval, 'budget_ticks' | 'tick_ms'>): number =>
  (e.budget_ticks * e.tick_ms) / 60_000;
