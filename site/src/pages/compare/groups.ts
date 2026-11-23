/** Grouping runs by model, vendor, agent or variant, and each group's name. */

import type { Run } from '@/data/types';
import { agentInfo, modelInfo, variantOf, vendorOf } from '@/lib/series';

export type GroupBy = 'model' | 'vendor' | 'agent' | 'variant';

export interface Group {
  key: string;
  /** A run of the group, for its identity */
  sample: Run;
  runs: Run[];
}

export function groupKey(run: Run, by: GroupBy): string {
  if (by === 'model') return run.model;
  if (by === 'vendor') return vendorOf(run.model).id;
  if (by === 'agent') return run.agent;
  return variantOf(run).key;
}

export function groupRuns(runs: Run[], by: GroupBy): Group[] {
  const groups = new Map<string, Group>();
  for (const run of runs) {
    const key = groupKey(run, by);
    const group = groups.get(key) ?? { key, sample: run, runs: [] };
    group.runs.push(run);
    groups.set(key, group);
  }
  return [...groups.values()];
}

/** The group's name as text, for tooltips. */
export function groupName(sample: Run, by: GroupBy): string {
  if (by === 'model') return modelInfo(sample.model).name;
  if (by === 'vendor') return vendorOf(sample.model).name;
  if (by === 'agent') return agentInfo(sample.agent, sample.agent_name).name;
  return variantOf(sample).name;
}
