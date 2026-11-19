/** A run's headline result: the best value it held, read the same way on every page. */

import type { Run } from '@/data/types';

/**
 * The value a run is judged by: the best value over its attempts (a five-try run that finished in
 * its second try and stalled in its fifth still reached the target), else its final value.
 */
export function resultValue(run: Pick<Run, 'attempt_results' | 'final_value' | 'score'>): number | null {
  const best = (run.attempt_results ?? []).map(a => a.best_value).filter((v): v is number => v != null);
  if (best.length) return Math.max(...best);
  return run.final_value ?? run.score;
}
