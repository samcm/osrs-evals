/**
 * The blended score: one number per pairing (a model in a harness) across every eval, on 0 to 100.
 *
 * 1. Each run scores 0 to 1 on its eval, head to head: the share of the other pairings' runs of
 *    that eval it beat (a tie is half). On an eval with a target any finish beats any miss, a
 *    faster finish beats a slower one, and between misses the one that got further wins; on an eval
 *    scored by how much, the higher result wins. Nothing is measured against a best run, so one
 *    outlier doesn't squash everyone else (Sam asked whether scoring against the best run was flawed).
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

/** Better first on an eval: a finish before a miss, a faster finish, else the higher result. */
function rank(e: Eval, run: Run): [number, number] | null {
  const value = resultValue(run);
  if (e.target != null && run.success) return [0, run.ticks ?? e.budget_ticks];
  if (value == null) return null;
  return [1, -value];
}

/**
 * One run's score on its eval, 0 to 1, head to head: the share of the other pairings' runs of the
 * eval (`field`, every run of it) that it beat, a tie counting half; null when it has no result.
 */
export function runScore(e: Eval, run: Run, field: Run[]): number | null {
  const mine = rank(e, run);
  if (!mine) return null;
  const key = variantOf(run).key;
  let won = 0;
  let n = 0;
  for (const other of field) {
    if (other.eval !== e.id || variantOf(other).key === key) continue;
    const theirs = rank(e, other);
    if (!theirs) continue;
    n++;
    const d = mine[0] - theirs[0] || mine[1] - theirs[1];
    won += d < 0 ? 1 : d === 0 ? 0.5 : 0;
  }
  return n === 0 ? null : won / n;
}

interface EvalScore {
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
 * (one that ran every core eval) before any partial one, so a pairing that ran one eval well
 * (a thinking-level sweep) never outranks one that ran them all. A core eval is one at least half
 * the pairings ran: a new eval only a few have played (Hero's Quest) shows its cells but neither
 * blends into the score nor makes those few "complete" above everyone else.
 */
export function blendedScores(evals: Eval[], runs: Run[]): Pairing[] {
  const byPairing = new Map<string, Run[]>();
  for (const r of runs) {
    const key = variantOf(r).key;
    byPairing.set(key, [...(byPairing.get(key) ?? []), r]);
  }

  const pairings = [...byPairing.values()].map(list => {
    const scores = new Map<string, EvalScore>();
    for (const e of evals) {
      const own = list.filter(r => r.eval === e.id);
      const s = mean(own.map(r => runScore(e, r, runs)));
      if (s != null) scores.set(e.id, { score: s, runs: own.length });
    }
    return { variant: variantOf(list[0]), sample: list[0], runs: list, evals: scores, score: 0, complete: false };
  });

  // How every pairing did on each core eval, and over all of them
  const core = evals.filter(e => pairings.filter(p => p.evals.has(e.id)).length * 2 >= pairings.length);
  const evalMean = new Map<string, number>();
  for (const e of core) {
    const m = mean(pairings.map(p => p.evals.get(e.id)?.score));
    if (m != null) evalMean.set(e.id, m);
  }
  const overall = mean([...evalMean.values()]) ?? 0;

  for (const p of pairings) {
    p.complete = [...evalMean.keys()].every(id => p.evals.has(id));
    const leads = [...p.evals.entries()]
      .filter(([id]) => evalMean.has(id))
      .map(([id, s]) => s.score - evalMean.get(id)!);
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
