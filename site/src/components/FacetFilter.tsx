/**
 * A faceted filter, bound by its caller to a URL list: a button naming the filter and its picks,
 * opening a lab Popover with a CheckboxGroup of the options and their counts.
 */

import type { JSX, ReactNode } from 'react';
import { PlusCircleIcon } from '@heroicons/react/20/solid';
import { Popover, PopoverButton, PopoverPanel } from '@/components/Overlays/Popover';
import { CheckboxGroup } from '@/components/Forms/CheckboxGroup/CheckboxGroup';
import { Button } from '@/components/Elements/Button';

export interface FacetOption {
  value: string;
  label: string;
  mark?: ReactNode;
}

/** A button naming the filter and what it picks, opening a checklist with counts. */
export function FacetFilter({
  title,
  options,
  selected,
  counts,
  onChange,
}: {
  title: string;
  options: FacetOption[];
  selected: string[];
  counts: Map<string, number>;
  onChange: (values: string[]) => void;
}): JSX.Element {
  const picked = options.filter(o => selected.includes(o.value));
  return (
    <Popover>
      <PopoverButton variant="secondary" size="sm" leadingIcon={<PlusCircleIcon />} nowrap>
        {title}
        {picked.length > 0 && (
          <span className="max-w-40 truncate font-normal text-muted">
            {picked.length > 1 ? `${picked.length} selected` : picked[0]?.label}
          </span>
        )}
      </PopoverButton>
      <PopoverPanel anchor={{ to: 'bottom start', gap: 4, padding: 8 }} className="w-64 p-1.5 shadow-lg">
        <CheckboxGroup
          legend={title}
          srOnlyLegend
          variant="menu"
          options={options.map(o => {
            const on = selected.includes(o.value);
            return {
              id: `${title}-${o.value}`,
              name: title,
              label: (
                <>
                  {o.mark}
                  <span className="truncate">{o.label}</span>
                </>
              ),
              description: String(counts.get(o.value) ?? 0),
              checked: on,
              onChange: () => onChange(on ? selected.filter(v => v !== o.value) : [...selected, o.value]),
            };
          })}
        />
        {picked.length > 0 && (
          <div className="mt-1.5 border-t border-border pt-1.5">
            <Button variant="blank" size="xs" className="w-full justify-center" onClick={() => onChange([])}>
              Clear
            </Button>
          </div>
        )}
      </PopoverPanel>
    </Popover>
  );
}
