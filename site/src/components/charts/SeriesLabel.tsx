/**
 * A series' name with its marks, in HTML: the vendor's mark (or the baseline's sprite), the short
 * name, the thinking level and the harness's mark. Used by the legend, the tooltip and line-end labels.
 *
 *   <SeriesLabel series={variantSeries(run)} size={14} />
 */

import { cn } from '@/lib/utils';
import type { SeriesSpec } from '@/lib/chartSeries';
import { BrandMark, Sprite, ThinkingLevel, type BrandSize } from '@/components/marks';

export function SeriesLabel({ series, size = 14, className }: { series: SeriesSpec; size?: BrandSize; className?: string }) {
  return (
    <span className={cn('inline-flex min-w-0 items-center gap-1.5 whitespace-nowrap', className)}>
      {series.sprite ? (
        <Sprite src={series.sprite} size={size} alt="" />
      ) : series.vendor ? (
        <BrandMark slug={series.vendor} size={size} />
      ) : (
        // A harness on its own leads with its mark, as a model leads with its vendor's
        series.harness && <BrandMark slug={series.harness.slug} size={size} />
      )}
      {series.label && <span className="truncate">{series.label}</span>}
      {series.thinking && <ThinkingLevel level={series.thinking} />}
    </span>
  );
}
