/**
 * Tooltip content built from shadcn's ChartTooltipContent: each row is the series' colour, its marks
 * (vendor mark, short name, thinking level, harness mark) and its value, formatted; rows sort by value. The title
 * is the x value, formatted.
 *
 *   <ChartTooltip cursor={crosshairCursor}
 *     content={<SeriesTooltip series={series} format={formatInt} labelFormat={t => `Tick ${formatInt(t)}`} />} />
 */

import type { ReactNode } from 'react';
import type { SeriesSpec } from '@/lib/chartSeries';
import { formatAxisNumber } from '@/lib/format';
import { ChartTooltipContent } from '@/components/ui/chart';
import { SeriesLabel } from './SeriesLabel';

type ContentProps = React.ComponentProps<typeof ChartTooltipContent>;

export function SeriesTooltip({
  series,
  format = v => v.toLocaleString('en-US'),
  labelFormat = label => (typeof label === 'number' ? formatAxisNumber(label) : label),
  sort = 'desc',
  ...props
}: Partial<ContentProps> & {
  series: SeriesSpec[];
  /** A row's value */
  format?: (value: number, series: SeriesSpec) => ReactNode;
  /** The title, from the x value */
  labelFormat?: (label: number | string) => ReactNode;
  /** Order rows by value, or keep the series' order */
  sort?: 'desc' | 'asc' | 'none';
}) {
  const byKey = new Map(series.map(s => [s.key, s]));
  const payload = (props.payload ?? []).filter(item => byKey.has(String(item.dataKey)) && item.value != null);
  if (sort !== 'none') payload.sort((a, b) => (Number(b.value) - Number(a.value)) * (sort === 'desc' ? 1 : -1));
  return (
    <ChartTooltipContent
      {...(props as ContentProps)}
      payload={payload}
      // shadcn titles a numeric x with the first series' label; the title here is always the x value
      hideLabel={props.label == null || props.label === ''}
      labelFormatter={() => labelFormat(props.label as number | string)}
      formatter={(value, _name, item) => {
        const s = byKey.get(String(item.dataKey))!;
        return (
          <div className="flex w-full items-center gap-2">
            <span aria-hidden className="size-2.5 shrink-0 rounded-[2px]" style={{ backgroundColor: s.color }} />
            <SeriesLabel series={s} size={14} className="flex-1" />
            <span className="ml-auto pl-2 font-mono font-medium text-foreground tabular-nums">{format(Number(value), s)}</span>
          </div>
        );
      }}
    />
  );
}
