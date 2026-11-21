/** What each eval measures and the game art that stands for it. */

import type { Eval, Run } from '@/data/types';
import { itemSrc, questSrc, uiSrc } from './assets';

interface EvalArt {
  /** The eval's one sprite, drawn by EvalMark: its quest icon, an item or a side icon */
  mark: { src: string; name: string } | null;
  /** Item ids under public/assets/items that the eval is about */
  items: { id: string; name: string }[];
  /** What the eval's value counts, for axis names */
  measure: string;
  /** What wins, in a player's terms: the eval page's header and the scoring explainers say it */
  score?: string;
}

const ART: Record<string, EvalArt> = {
  quest_points: {
    mark: { src: uiSrc('quests'), name: 'Quests' },
    items: [],
    measure: 'Quest points',
    score: 'Most quest points',
  },
  dragon_slayer: {
    mark: { src: questSrc('dragon_slayer'), name: 'Dragon Slayer' },
    items: [{ id: '1540', name: 'Anti-dragon shield' }],
    measure: 'Quest stage',
    score: 'Fastest to finish the quest',
  },
  total_level: {
    mark: { src: uiSrc('stats'), name: 'Skills' },
    items: [],
    measure: 'Total level',
    score: 'Highest total level',
  },
  collection: {
    mark: { src: uiSrc('inventory'), name: 'Inventory' },
    items: [],
    measure: 'Different items',
    score: 'Most different items',
  },
  team_wealth: {
    mark: { src: itemSrc('995-10000'), name: 'Coins' },
    items: [{ id: '995-10000', name: 'Coins' }],
    measure: 'Wealth',
    score: 'Richest team',
  },
  coins: { mark: { src: itemSrc(995), name: 'Coins' }, items: [{ id: '995', name: 'Coins' }], measure: 'Coins' },
  gold: { mark: { src: itemSrc('995-10000'), name: 'Coins' }, items: [{ id: '995-10000', name: 'Coins' }], measure: 'Coins' },
};

/** The eval an id is a variant of: quest_points_x5 → quest_points. */
export const evalBase = (evalId: string): string => evalId.replace(/_x\d+$/, '');

export function evalArt(evalId: string): EvalArt {
  return ART[evalBase(evalId)] ?? { mark: null, items: [], measure: 'Value' };
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

/** An eval as it appears in a URL: its id in kebab case (dragon_slayer → dragon-slayer). */
export const evalSlug = (evalId: string): string => evalId.replace(/_/g, '-');

/** The eval id a URL's slug names (dragon-slayer → dragon_slayer). */
export const evalIdOf = (slug: string): string => slug.replace(/-/g, '_');

/** The eval a URL names, by its slug or its old snake-case id. */
export const evalBySlug = <E extends Pick<Eval, 'id'>>(evals: E[], slug: string): E | undefined => evals.find(e => evalSlug(e.id) === evalSlug(slug));
