/**
 * A labelled shadcn Select. With `allLabel`, a first option stands for no filter and selecting it
 * passes undefined. Options with a `group` are listed under it, in first-seen order.
 *
 *   <SelectField label="Model" value={scope.model[0]} allLabel="All" options={models} onChange={v => …} />
 *   <SelectField label="Model" hideLabel allLabel="All models" … />   in a toolbar
 */

import { useId, type ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from '@/components/ui/select';

export interface SelectOption {
  value: string;
  label: string;
  /** Shown before the label (a BrandMark, an EvalMark …) */
  mark?: ReactNode;
  /** Options with a group are listed under it, in first-seen order */
  group?: string;
}

/** Radix Select can't hold an empty value: this stands for "no filter". */
const ALL = '__all__';

export function SelectField({
  label,
  value,
  options,
  onChange,
  allLabel,
  hideLabel,
  className,
}: {
  label: string;
  /** Keep the label for screen readers only, as in a toolbar where the value names itself */
  hideLabel?: boolean;
  value: string | undefined;
  options: SelectOption[];
  onChange: (value: string | undefined) => void;
  allLabel?: string;
  className?: string;
}) {
  const id = useId();
  const groups = [...new Set(options.map(o => o.group))];
  const items = (list: SelectOption[]) =>
    list.map(o => (
      <SelectItem key={o.value} value={o.value}>
        {o.mark}
        {o.label}
      </SelectItem>
    ));
  return (
    <div className={cn('flex min-w-0 flex-col gap-1.5', className)}>
      <label htmlFor={id} className={cn('text-xs font-medium text-muted-foreground', hideLabel && 'sr-only')}>
        {label}
      </label>
      <Select value={value ?? (allLabel != null ? ALL : undefined)} onValueChange={v => onChange(v === ALL ? undefined : v)}>
        <SelectTrigger id={id} className="w-full min-w-0">
          <SelectValue placeholder={allLabel ?? label} />
        </SelectTrigger>
        <SelectContent>
          {allLabel != null && <SelectItem value={ALL}>{allLabel}</SelectItem>}
          {groups.map(group =>
            group == null ? (
              items(options.filter(o => o.group == null))
            ) : (
              <SelectGroup key={group}>
                <SelectLabel>{group}</SelectLabel>
                {items(options.filter(o => o.group === group))}
              </SelectGroup>
            )
          )}
        </SelectContent>
      </Select>
    </div>
  );
}
