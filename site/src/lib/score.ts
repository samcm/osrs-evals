/**
 * The blended score: one number per pairing (a model in a harness) across every eval, on 0 to 100.
 *
 * 1. Each run scores 0 to 1 on its eval, so evals of either kind count the same:
 *    - an eval with a target (finish or not): a finish is worth 0.5 to 1 by how much of the budget
 *      it left (`1 - ticks / budget / 2`); a run that didn't finish gets up to 0.5 by how far it got
 *      (`value / target / 2`). Any finish beats any miss, a faster finish beats a slower one.
 *    - an eval scored by how much (no target): the run's value over the best value any run reached.
 * 2. A pairing's score on an eval is the mean over its runs there.
 * 3. Its blended score is the mean over all evals, plus how far above or below each eval's mean it
 *    scored on the evals it ran, averaged with one more eval at exactly the mean. An eval it didn't
 *    run counts for nothing either way, running only easy evals doesn't lift it, an eval only one
 *    pairing ran leaves it at the average, and a pairing that ran few evals sits nearer the middle
 *    until it has run more (one eval moves it half as far as its lead there).
 *
 * Every number is computed over all runs, whatever the scope, so narrowing the page never changes a
 * pairing's score; the scope only chooses which pairings are shown.
 */

import type { Eval, Run } from '@/data/types';
import { resultValue } from './runResult';
import { mean } from './stats';
import { variantOf, type Variant } from './series';

const clamp01 = (v: number): number => Math.min(1, Math.max(0, v));

/** One run's score on its eval, 0 to 1; null when the run has no result. */
export function runScore(e: Eval, run: Run, best: number): number | null {
  const value = resultValue(run);
  if (e.target != null) {
    if (run.success) {
      // A five-try run's ticks count within its winning try, against one try's budget
      const ticks = run.ticks ?? e.budget_ticks;
      return 1 - clamp01(ticks / e.budget_ticks) / 2;
    }
    if (value == null) return null;
    return clamp01(value / e.target) / 2;
  }
  if (value == null) return null;
  return best > 0 ? clamp01(value / best) : 0;
}

export interface EvalScore {
  /** The pairing's mean run score on the eval, 0 to 1 */
  score: number;
  runs: number;
}

export interface Pairing {
  variant: Variant;
  /** A run of the pairing, for its labels */
  sample: Run;
  runs: Run[];
  /** By eval id; an eval the pairing didn't run is absent */
  evals: Map<string, EvalScore>;
  /** The blended score, 0 to 1 */
  score: number;
  /** It ran every eval that has runs: a partial pairing's score is over fewer evals, so it ranks below every complete one */
  complete: boolean;
}

/**
 * Every pairing's per-eval and blended scores, from all runs; best first, every complete pairing
 * (one that ran every eval with runs) before any partial one, so a pairing that ran one eval well
 * (a thinking-level sweep) never outranks one that ran them all.
 */
export function blendedScores(evals: Eval[], runs: Run[]): Pairing[] {
  const byPairing = new Map<string, Run[]>();
  for (const r of runs) {
    const key = variantOf(r).key;
    byPairing.set(key, [...(byPairing.get(key) ?? []), r]);
  }

  // Each eval's best value, for evals scored by how much
  const best = new Map(
    evals.map(e => [e.id, Math.max(0, ...runs.filter(r => r.eval === e.id).map(r => resultValue(r) ?? 0))])
  );

  const pairings = [...byPairing.values()].map(list => {
    const scores = new Map<string, EvalScore>();
    for (const e of evals) {
      const own = list.filter(r => r.eval === e.id);
      const s = mean(own.map(r => runScore(e, r, best.get(e.id) ?? 0)));
      if (s != null) scores.set(e.id, { score: s, runs: own.length });
    }
    return { variant: variantOf(list[0]), sample: list[0], runs: list, evals: scores, score: 0, complete: false };
  });

  // How every pairing did on each eval, and over all evals
  const evalMean = new Map<string, number>();
  for (const e of evals) {
    const m = mean(pairings.map(p => p.evals.get(e.id)?.score));
    if (m != null) evalMean.set(e.id, m);
  }
  const overall = mean([...evalMean.values()]) ?? 0;

  for (const p of pairings) {
    p.complete = [...evalMean.keys()].every(id => p.evals.has(id));
    const leads = [...p.evals.entries()].map(([id, s]) => s.score - (evalMean.get(id) ?? s.score));
    // One more eval at the mean pulls a pairing with few evals toward the middle
    p.score = clamp01(overall + leads.reduce((a, b) => a + b, 0) / (leads.length + 1));
  }
  return pairings.sort(
    (a, b) =>
      Number(b.complete) - Number(a.complete) || b.score - a.score || a.variant.name.localeCompare(b.variant.name)
  );
}

/** A 0–1 score as the 0–100 the site shows. */
export const formatScore = (score: number | null | undefined): string =>
  score == null ? '–' : String(Math.round(score * 100));

/**
 * EthIQ's "best level" cut: of each model in each harness, only the thinking level that did best.
 * `ranked` is best first; returns the variant keys to keep.
 */
export function bestLevelKeys(ranked: Pick<Variant, 'key' | 'model' | 'agent'>[]): Set<string> {
  const seen = new Set<string>();
  const keep = new Set<string>();
  for (const v of ranked) {
    const group = `${v.model}|${v.agent}`;
    if (seen.has(group)) continue;
    seen.add(group);
    keep.add(v.key);
  }
  return keep;
}

/**
 * Where a model places among the models on an eval: its best shown pairing's score there against
 * each other model's best pairing.
 */
export function modelRank(
  all: Pairing[],
  shown: Pairing[],
  e: Pick<Eval, 'id'>,
  model: string
): { rank: number; of: number } | null {
  const best = new Map<string, number>();
  for (const p of [...all.filter(q => q.variant.model !== model), ...shown]) {
    const s = p.evals.get(e.id)?.score;
    if (s != null) best.set(p.variant.model, Math.max(best.get(p.variant.model) ?? -1, s));
  }
  const own = best.get(model);
  if (own == null) return null;
  return { rank: 1 + [...best.values()].filter(s => s > own).length, of: best.size };
}
