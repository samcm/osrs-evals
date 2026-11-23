/** A group's marks and short name, for chart rows and tooltips. */

import type { JSX } from 'react';
import type { Run } from '@/data/types';
import { AgentLabel, BrandMark, ModelLabel, ThinkingLevel, VariantLabel } from '@/components/marks';
import { agentInfo, vendorOf } from '@/lib/series';
import type { GroupBy } from './groups';

/**
 * The group's marks and short name: a pairing's vendor mark, model and thinking level; a harness's
 * mark and name. `stacked` puts a pairing's level under its model, for narrow chart labels.
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
}): JSX.Element {
  if (by === 'model') return <ModelLabel model={sample.model} compact size={size} />;
  if (by === 'agent') return <AgentLabel agent={sample.agent} fallback={sample.agent_name} size={size} />;
  if (by === 'variant' && stacked && agentInfo(sample.agent, sample.agent_name).slug !== 'program') {
    return (
      <span className="flex min-w-0 flex-col items-start gap-0.5">
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
