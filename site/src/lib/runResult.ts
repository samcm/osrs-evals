/** A run's headline result: the best value it held, read the same way on every page. */

import type { Eval, Run } from '@/data/types';
import { formatClock, formatInt } from './format';

/**
 * The value a run is judged by: the best value over its attempts (a five-try run that finished in
 * its second try and stalled in its fifth still reached the target), else its final value.
 */
export function resultValue(run: Pick<Run, 'attempt_results' | 'final_value' | 'score'>): number | null {
  const best = (run.attempt_results ?? []).map(a => a.best_value).filter((v): v is number => v != null);
  if (best.length) return Math.max(...best);
  return run.final_value ?? run.score;
}

/**
 * A run's result as the eval scores it: on an eval with a target, its time to finish in game time
 * ("1:09:27", ticks at the eval's tick rate) or how far it got ("6 of 10"); else its value.
 */
export function resultText(
  run: Pick<Run, 'attempt_results' | 'final_value' | 'score' | 'success' | 'ticks' | 'target'>,
  e: Pick<Eval, 'tick_ms'> | undefined
): string {
  const value = formatInt(resultValue(run));
  if (run.target == null) return value;
  if (run.success && run.ticks != null && e) return formatClock((run.ticks * e.tick_ms) / 1000);
  return `${value} of ${formatInt(run.target)}`;
}

/** How a run ended, in a visitor's words: it finished, ran out of time, or stopped itself. */
export function endedWord(reason: string | null | undefined): string {
  if (!reason) return '–';
  if (reason === 'done') return 'Finished';
  if (reason === 'budget' || reason.startsWith('wall clock')) return 'Out of time';
  if (reason === 'agent finished') return 'Stopped';
  if (reason === 'model timed out') return 'Model timed out';
  return reason.charAt(0).toUpperCase() + reason.slice(1);
}
