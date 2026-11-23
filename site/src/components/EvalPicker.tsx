/**
 * Pick one eval by its sprite and title, as lab's SegmentedControl; with `allLabel`, a first option
 * for every eval (undefined). The selected option takes the primary tint.
 *
 *   <EvalPicker evals={data.evals} value={search.eval} allLabel="All evals" onChange={e => update({ eval: e }, { resetPage: true })} />
 */

import type { JSX } from 'react';
import type { Eval } from '@/data/types';
import { SegmentedControl } from '@/components/Forms/SegmentedControl';
import { EvalMark } from '@/components/marks';

/** The value that stands for every eval */
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
}): JSX.Element {
  return (
    <SegmentedControl
      ariaLabel={label}
      value={value ?? (allLabel != null ? ALL : '')}
      onChange={next => onChange(next === ALL ? undefined : next)}
      options={[
        ...(allLabel != null ? [{ value: ALL, label: allLabel }] : []),
        ...evals.map(e => ({
          value: e.id,
          label: (
            <span className="inline-flex items-center gap-1.5">
              <EvalMark evalId={e.id} size={16} title="" />
              {e.title}
            </span>
          ),
        })),
      ]}
    />
  );
}
