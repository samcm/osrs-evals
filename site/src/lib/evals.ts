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
  /** What counts and what makes the eval hard, as plain facts (no "It tests…"): under the goal in the eval page's header */
  why?: string;
  /** The eval's name, for one the site lists before it has runs (the evals the project runs now) */
  title?: string;
}

const ART: Record<string, EvalArt> = {
  quest_points: {
    mark: { src: uiSrc('quests'), name: 'Quests' },
    items: [],
    measure: 'Quest points',
    score: 'Most quest points',
    why: 'Every quest finished adds its quest points. A quest is a chain of errands: talk to someone, fetch what they want, fight what’s in the way. Nothing tells the agent which quests are quick.',
  },
  dragon_slayer: {
    mark: { src: questSrc('dragon_slayer'), name: 'Dragon Slayer' },
    items: [{ id: '1540', name: 'Anti-dragon shield' }],
    measure: 'Quest stage',
    score: 'Fastest to finish the quest',
    title: 'Dragon Slayer',
    why: 'The big quest of the early game. It won’t start until you have 32 quest points, so most of the run is other quests first. Then a ship, a map in three pieces, and a level 83 dragon.',
  },
  heros_quest: {
    mark: { src: questSrc('heros_quest'), name: "Hero's Quest" },
    items: [
      { id: '1583', name: 'Fire feather' },
      { id: '2149', name: 'Lava eel' },
      { id: '1579', name: "Thieves' armband" },
    ],
    measure: 'Quest stage',
    score: 'Fastest to finish the quest',
    title: "Hero's Quest",
    why: 'Hero’s Quest won’t start until a character has 55 quest points and has finished Dragon Slayer, Lost City, Merlin’s Crystal and Shield of Arrav. Its armband needs one character in each rival gang, each helping the other.',
  },
  total_level: {
    mark: { src: uiSrc('stats'), name: 'Skills' },
    items: [],
    measure: 'Total level',
    score: 'Highest total level',
    title: 'Total level',
    why: 'All 19 skill levels added up. A new character starts at 28. Any skill counts, so the score is how much training gets done in half an hour.',
  },
  collection: {
    mark: { src: uiSrc('inventory'), name: 'Inventory' },
    items: [],
    measure: 'Different items',
    score: 'Most different items',
    why: 'Each kind of item held counts once. A second of anything adds nothing, so the agent has to keep finding new things: shops, drops, things it gathers or makes.',
  },
  team_wealth: {
    mark: { src: itemSrc('995-10000'), name: 'Coins' },
    items: [{ id: '995-10000', name: 'Coins' }],
    measure: 'Wealth',
    score: 'Richest team',
    title: 'Team wealth',
    why: 'Four characters, one score: the value of everything they hold between them, at the game’s own prices.',
  },
  coins: { mark: { src: itemSrc(995), name: 'Coins' }, items: [{ id: '995', name: 'Coins' }], measure: 'Coins' },
  gold: {
    mark: { src: itemSrc('995-10000'), name: 'Coins' },
    items: [{ id: '995-10000', name: 'Coins' }],
    measure: 'Coins',
  },
};

/**
 * Every eval the site lists, by title: the data's, and the ones the project runs that have no runs
 * yet (an eval page says so).
 */
export function siteEvals(evals: Pick<Eval, 'id' | 'title'>[]): { id: string; title: string }[] {
  const have = new Set(evals.map(e => evalBase(e.id)));
  const waiting = Object.entries(ART).flatMap(([id, art]) =>
    art.title && !have.has(id) ? [{ id, title: art.title }] : []
  );
  return [...evals, ...waiting].sort((a, b) => a.title.localeCompare(b.title));
}

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
export const evalBySlug = <E extends Pick<Eval, 'id'>>(evals: E[], slug: string): E | undefined =>
  evals.find(e => evalSlug(e.id) === evalSlug(slug));
