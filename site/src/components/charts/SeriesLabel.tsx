/**
 * A series' name with its marks, in HTML: the vendor's mark (or the baseline's sprite), the short
 * name, and the harness as a quiet badge. Used by the legend, the tooltip and line-end labels.
 *
 *   <SeriesLabel series={variantSeries(run)} size={14} />
 */

import { cn } from '@/lib/utils';
import type { SeriesSpec } from '@/lib/chartSeries';
import { Badge } from '@/components/ui/badge';
import { BrandMark, Sprite, type BrandSize } from '@/components/marks';

export function SeriesLabel({ series, size = 14, className }: { series: SeriesSpec; size?: BrandSize; className?: string }) {
  return (
    <span className={cn('inline-flex min-w-0 items-center gap-1.5 whitespace-nowrap', className)} title={series.name}>
      {series.sprite ? <Sprite src={series.sprite} size={size} alt="" /> : series.vendor ? <BrandMark slug={series.vendor} size={size} /> : null}
      {series.label && <span className="truncate">{series.label}</span>}
      {series.harness && (
        <Badge variant="outline" className="font-normal text-muted-foreground">
          {series.harness}
        </Badge>
      )}
    </span>
  );
}
