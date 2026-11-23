/** shadcn's faceted filter (the tasks example's DataTableFacetedFilter), bound by its caller to a URL list. */

import type { ReactNode } from 'react';
import { CirclePlus } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from '@/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Separator } from '@/components/ui/separator';

export interface FacetOption {
  value: string;
  label: string;
  mark?: ReactNode;
}

/** shadcn's faceted filter: a dashed button naming the filter and its picks, opening a checklist with counts. */
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
}) {
  const picked = options.filter(o => selected.includes(o.value));
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" className="border-dashed">
          <CirclePlus />
          {title}
          {picked.length > 0 && (
            <>
              <Separator orientation="vertical" className="h-4 data-vertical:self-center" />
              <Badge variant="secondary" className="rounded-sm sm:hidden">
                {picked.length}
              </Badge>
              <Badge variant="secondary" className="max-w-40 rounded-sm max-sm:hidden">
                <span className="truncate">{picked.length > 1 ? `${picked.length} selected` : picked[0].label}</span>
              </Badge>
            </>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-64 p-0" align="start">
        <Command>
          {options.length > 6 && <CommandInput placeholder={title} />}
          <CommandList>
            <CommandEmpty>No match.</CommandEmpty>
            <CommandGroup>
              {options.map(o => {
                const on = selected.includes(o.value);
                return (
                  <CommandItem
                    key={o.value}
                    value={o.label}
                    data-checked={on}
                    onSelect={() => onChange(on ? selected.filter(v => v !== o.value) : [...selected, o.value])}
                  >
                    {o.mark}
                    <span className="flex-1 truncate">{o.label}</span>
                    <span className="text-xs text-muted-foreground tabular-nums">{counts.get(o.value) ?? 0}</span>
                  </CommandItem>
                );
              })}
            </CommandGroup>
            {picked.length > 0 && (
              <>
                <CommandSeparator />
                <CommandGroup>
                  <CommandItem onSelect={() => onChange([])}>Clear</CommandItem>
                </CommandGroup>
              </>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
