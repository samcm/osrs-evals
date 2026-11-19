import clsx from 'clsx';
import { BrandMark, type BrandSize } from './marks';
import { agentInfo, modelInfo, type Variant } from '@/lib/series';

/**
 * A variant where room is short: the vendor's mark and the model's short name ("Haiku 5.5"), then
 * the harness's mark and, unless `markOnly`, its name. The full name is the tooltip.
 */
export function VariantShort({
  variant,
  size = 16,
  markOnly,
  className,
}: {
  variant: Variant;
  size?: BrandSize;
  markOnly?: boolean;
  className?: string;
}) {
  const program = variant.vendorSlug === 'program';
  const model = modelInfo(variant.model);
  const agent = agentInfo(variant.agent);
  return (
    <span className={clsx('inline-flex items-center gap-1.5 whitespace-nowrap', className)} title={variant.name}>
      {!program && <BrandMark slug={variant.vendorSlug} size={size} title={model.vendor.name} />}
      {!program && <span className="mr-0.5">{model.short}</span>}
      <BrandMark slug={variant.agentSlug} size={size} title={agent.name} />
      {(program || !markOnly) && <span>{agent.name}</span>}
    </span>
  );
}
