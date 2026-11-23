/** Grouping runs by model, vendor, agent or variant, with each group's label. */

import type { Run } from '@/data/types';
import { AgentLabel, BrandMark, ModelLabel, ThinkingLevel, VariantLabel } from '@/components/marks';
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

/**
 * The group's marks and short name: vendor mark and model, the harness as a badge. `stacked` puts a
 * variant's badge under its model, for narrow chart labels.
 */
export function GroupLabel({
  sample,
  by,
  size = 16,
  stacked,
}: {
  sample: Run;
  by: GroupBy;
  size?: 14 | 16 | 20;
  stacked?: boolean;
}) {
  if (by === 'model') return <ModelLabel model={sample.model} compact size={size} />;
  if (by === 'agent') return <AgentLabel agent={sample.agent} fallback={sample.agent_name} size={size} />;
  if (by === 'variant' && stacked && agentInfo(sample.agent, sample.agent_name).slug !== 'program') {
    return (
      <span className="flex flex-col items-end gap-0.5">
        <ModelLabel model={sample.model} compact size={size} />
        <ThinkingLevel level={sample.thinking} />
      </span>
    );
  }
  if (by === 'variant') return <VariantLabel run={sample} compact size={size} />;
  const vendor = vendorOf(sample.model);
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
      <BrandMark slug={vendor.slug} size={size} title={vendor.name} />
      <span>{vendor.name}</span>
    </span>
  );
}

/** Scope params that narrow every page to one group. */
export function groupScope(
  sample: Run,
  by: GroupBy
): { model?: string[]; agent?: string[]; vendor?: string[]; thinking?: string[] } {
  if (by === 'model') return { model: [sample.model] };
  if (by === 'vendor') return { vendor: [vendorOf(sample.model).id] };
  if (by === 'agent') return { agent: [sample.agent] };
  return { model: [sample.model], agent: [sample.agent], thinking: [sample.thinking] };
}
