import clsx from 'clsx';

export interface SelectOption {
  value: string;
  label: string;
  /** Options with a group are listed under it (an optgroup), in first-seen order */
  group?: string;
}

/**
 * A labelled native select. With `allLabel`, an empty first option stands for no filter and
 * selecting it passes undefined.
 */
export function SelectField({
  label,
  value,
  options,
  onChange,
  allLabel,
  className,
}: {
  label: string;
  value: string | undefined;
  options: SelectOption[];
  onChange: (value: string | undefined) => void;
  allLabel?: string;
  className?: string;
}) {
  const groups = [...new Set(options.map(o => o.group))];
  const render = (list: SelectOption[]) =>
    list.map(o => (
      <option key={o.value} value={o.value}>
        {o.label}
      </option>
    ));
  return (
    <label className={clsx('flex min-w-0 flex-col gap-1', className)}>
      <span className="text-xs font-medium text-muted">{label}</span>
      <select
        value={value ?? ''}
        onChange={event => onChange(event.target.value || undefined)}
        className="h-8 w-full min-w-0 rounded-sm bg-surface px-2 text-sm text-foreground outline -outline-offset-1 outline-border focus-visible:outline-2 focus-visible:outline-primary"
      >
        {allLabel != null && <option value="">{allLabel}</option>}
        {groups.map(group =>
          group == null ? (
            render(options.filter(o => o.group == null))
          ) : (
            <optgroup key={group} label={group}>
              {render(options.filter(o => o.group === group))}
            </optgroup>
          )
        )}
      </select>
    </label>
  );
}
