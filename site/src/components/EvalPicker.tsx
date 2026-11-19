import clsx from 'clsx';
import type { Eval } from '@/data/types';
import { EvalMark } from './marks';

/**
 * Pick one eval by its sprite and title; with `allLabel`, a first option for every eval
 * (undefined). The selected option takes the accent, as in a segmented control.
 */
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
  const options: { id: string | undefined; title: string }[] = [...(allLabel != null ? [{ id: undefined, title: allLabel }] : []), ...evals];
  return (
    <div role="radiogroup" aria-label={label} className="flex flex-wrap gap-1.5">
      {options.map(option => {
        const selected = option.id === value;
        return (
          <button
            key={option.id ?? ''}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => onChange(option.id)}
            className={clsx(
              'inline-flex h-8 items-center gap-1.5 rounded-sm px-2.5 text-xs font-medium whitespace-nowrap outline -outline-offset-1 transition-colors focus-visible:ring-2 focus-visible:ring-primary-50',
              selected
                ? 'bg-primary-soft text-primary outline-primary-50'
                : 'bg-surface text-muted outline-border hover:bg-background hover:text-foreground'
            )}
          >
            {option.id && <EvalMark evalId={option.id} size={20} title="" />}
            {option.title}
          </button>
        );
      })}
    </div>
  );
}
