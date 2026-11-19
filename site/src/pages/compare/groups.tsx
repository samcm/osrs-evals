/** Grouping runs by model, vendor, agent or variant, with each group's marks for HTML and canvas. */

import type { Run } from '@/data/types';
import { AgentLabel, BrandMark, ModelLabel, VariantLabel } from '@/components/marks';
import { VariantShort } from '@/components/VariantShort';
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

/** The group's short name, for chart labels; `narrow` leaves a variant's harness to its mark. */
export function groupName(sample: Run, by: GroupBy, narrow = false): string {
  if (by === 'model') return modelInfo(sample.model).short;
  if (by === 'vendor') return vendorOf(sample.model).name;
  if (by === 'agent') return agentInfo(sample.agent, sample.agent_name).name;
  const v = variantOf(sample);
  return narrow && v.vendorSlug !== 'program' ? modelInfo(sample.model).short : v.short;
}

/** Mark slugs for canvas labels, in reading order. */
export function groupSlugs(sample: Run, by: GroupBy): string[] {
  const v = variantOf(sample);
  if (by === 'model' || by === 'vendor') return [v.vendorSlug];
  if (by === 'agent') return [v.agentSlug];
  return v.vendorSlug === 'program' ? [v.agentSlug] : [v.vendorSlug, v.agentSlug];
}

/** The group's marks and name in HTML. */
export function GroupLabel({ sample, by, size = 16, short }: { sample: Run; by: GroupBy; size?: 14 | 16 | 20; short?: boolean }) {
  if (by === 'model') return <ModelLabel model={sample.model} size={size} />;
  if (by === 'agent') return <AgentLabel agent={sample.agent} fallback={sample.agent_name} size={size} />;
  if (by === 'variant' && short) {
    // On a phone the harness is its mark alone
    return (
      <>
        <VariantShort variant={variantOf(sample)} size={size} className="max-sm:hidden" />
        <VariantShort variant={variantOf(sample)} size={size} markOnly className="sm:hidden" />
      </>
    );
  }
  if (by === 'variant') return <VariantLabel run={sample} size={size} />;
  const vendor = vendorOf(sample.model);
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
      <BrandMark slug={vendor.slug} size={size} title={vendor.name} />
      <span>{vendor.name}</span>
    </span>
  );
}

/** Scope params that narrow every page to one group. */
export function groupScope(sample: Run, by: GroupBy): { model?: string[]; agent?: string[]; vendor?: string[] } {
  if (by === 'model') return { model: [sample.model] };
  if (by === 'vendor') return { vendor: [vendorOf(sample.model).id] };
  if (by === 'agent') return { agent: [sample.agent] };
  return { model: [sample.model], agent: [sample.agent] };
}
