/**
 * A labelled lab SelectMenu. With `allLabel`, a first option stands for no filter and selecting it
 * passes undefined. Options with a `group` are listed under it, in first-seen order.
 *
 *   <SelectField label="Model" value={scope.model[0]} allLabel="All" options={models} onChange={v => …} />
 *   <SelectField label="Model" hideLabel allLabel="All models" … />   in a toolbar
 */

import type { JSX, ReactNode } from 'react';
import clsx from 'clsx';
import { SelectMenu } from '@/components/Forms/SelectMenu';

export interface SelectOption {
  value: string;
  label: string;
  /** Shown before the label (a BrandMark, an EvalMark …) */
  mark?: ReactNode;
  /** Options with a group are listed under it, in first-seen order */
  group?: string;
}

/** The value that stands for "no filter" in the menu */
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
}): JSX.Element {
  return (
    <div className={clsx('flex min-w-0 flex-col', className)}>
      <SelectMenu<string>
        label={label}
        showLabel={!hideLabel}
        placeholder={allLabel ?? label}
        value={value ?? (allLabel != null ? ALL : '')}
        onChange={v => onChange(v === ALL ? undefined : v)}
        options={[
          ...(allLabel != null ? [{ value: ALL, label: allLabel }] : []),
          ...options.map(o => ({ value: o.value, label: o.label, icon: o.mark, group: o.group })),
        ]}
      />
    </div>
  );
}
