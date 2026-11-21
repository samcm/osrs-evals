/** `/`'s search params. */

import type { Eval } from '@/data/types';
import type { Pairing } from '@/lib/score';
import { defineSearch, int, legendParams, sortParam, text } from '@/lib/search';

export const overviewSearch = defineSearch({
  /** The featured eval, as its slug (quest-points); absent: the one the most pairings ran */
  eval: text(),
  /** The leaderboard's sort and page */
  sort: sortParam(['-score']),
  page: int(1, { min: 1 }),
  /** The featured chart's hidden or isolated pairings */
  ...legendParams,
});

/** The eval featured when the URL names none: the one the most pairings ran. */
export function defaultFeatured(evals: Eval[], pairings: Pairing[]): Eval | undefined {
  const count = (e: Eval) => pairings.filter(p => p.evals.has(e.id)).length;
  return [...evals].sort((a, b) => count(b) - count(a))[0];
}
