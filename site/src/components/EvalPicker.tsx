/**
 * Pick one eval by its sprite and title, as a shadcn ToggleGroup; with `allLabel`, a first option
 * for every eval (undefined). The selected option takes the accent.
 *
 *   <EvalPicker evals={data.evals} value={search.eval} allLabel="All evals" onChange={e => update({ eval: e }, { resetPage: true })} />
 */

import type { Eval } from '@/data/types';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { EvalMark } from './marks';

const ALL = '__all__';

export function EvalPicker({
  evals,
  value,
  onChange,
  allLabel,
  label = 'Eval',
}: {
  evals: Pick<Eval, 'id' | 'title'>[];
  value: string | undefined;
  onChange: (value: string | undefined) => void;
  allLabel?: string;
  label?: string;
}) {
  return (
    <ToggleGroup
      type="single"
      variant="outline"
      size="sm"
      aria-label={label}
      value={value ?? (allLabel != null ? ALL : '')}
      onValueChange={next => next && onChange(next === ALL ? undefined : next)}
      className="flex-wrap"
    >
      {allLabel != null && <ToggleGroupItem value={ALL}>{allLabel}</ToggleGroupItem>}
      {evals.map(e => (
        <ToggleGroupItem key={e.id} value={e.id}>
          <EvalMark evalId={e.id} size={16} title="" />
          {e.title}
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  );
}
