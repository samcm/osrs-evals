/**
 * Legends in the shadcn chart look (a centred row under the chart, small keys, text-xs), bound to
 * the URL: given `legend` (useLegend), a click hides or shows a series (`hide=`, or clears an
 * isolation) and a double click isolates it (`focus=`). Hovering a key hovers its series across the
 * page (lib/hover).
 *
 *   const legend = useLegend();
 *   <SeriesLegend series={series} legend={legend} />                 // keys from specs, with marks
 *   <KeyLegend items={[{ label: 'Not finished', hollow: true }]} />  // plain keys
 *
 * Pairings (model × harness) key the way they are drawn: colour is the model, dash (or point shape)
 * is the harness. So a legend of pairings names each model once, with one key per pairing in its
 * colour and its harness' dash, and then names each harness once with its dash. Ten or twenty
 * pairings stay one or two short rows instead of a block of names and badges.
 */

import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { FADED_OPACITY, hoverProps, useHover, type HoverState } from '@/lib/hover';
import type { LegendState } from '@/lib/legend';
import type { SeriesSpec } from '@/lib/chartSeries';
import type { AgentLine, AgentSymbol, SeriesColor } from '@/lib/series';
import { BrandMark, harnessBadgeClassName, Sprite } from '@/components/marks';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { SeriesLabel } from './SeriesLabel';

export interface LegendItem {
  /** Series id, for a legend bound to `useLegend`; items without one are plain keys */
  id?: string;
  /** Accessible name, when the label is marks rather than text */
  name?: string;
  label: ReactNode;
  /** Marks before the label (BrandMark at 14, a Sprite …) */
  mark?: ReactNode;
  color?: SeriesColor;
  /** A line key in the series' dash; otherwise a block */
  line?: AgentLine;
  /** A hollow ring instead of a filled mark */
  hollow?: boolean;
  /** A block in this colour class instead of a series colour */
  swatchClassName?: string;
  /** The chart's symbol for the series */
  symbol?: AgentSymbol;
  /** Several colour blocks, for one key that stands for every series' colour */
  colors?: SeriesColor[];
}

type Kind = 'line' | 'symbol' | 'swatch';

/** Point shapes as 10px paths. */
const SHAPES: Record<AgentSymbol, string> = {
  circle: 'M5 0a5 5 0 1 1 0 10A5 5 0 0 1 5 0z',
  rect: 'M0.5 0.5h9v9h-9z',
  roundRect: 'M2 0.5h6a1.5 1.5 0 0 1 1.5 1.5v6A1.5 1.5 0 0 1 8 9.5H2A1.5 1.5 0 0 1 0.5 8V2A1.5 1.5 0 0 1 2 0.5z',
  diamond: 'M5 0l5 5-5 5-5-5z',
  triangle: 'M5 0.5l4.5 9h-9z',
  pin: 'M5 0a4 4 0 0 1 4 4c0 3-4 6-4 6S1 7 1 4a4 4 0 0 1 4-4z',
};

const LINE: Record<AgentLine, string> = {
  solid: 'border-solid',
  dashed: 'border-dashed',
  dotted: 'border-dotted',
};

/** The swatch a key draws: a line in its dash, a point shape, a ring or a block (shadcn's 8px). */
export function Key({ item }: { item: Omit<LegendItem, 'label'> }) {
  if (item.colors) {
    return (
      <span aria-hidden className="flex">
        {item.colors.map(color => (
          <span key={color.token} className={cn('h-2 w-1.5 first:rounded-l-[2px] last:rounded-r-[2px]', color.swatchClassName)} />
        ))}
      </span>
    );
  }
  if (item.symbol) {
    return (
      <svg aria-hidden viewBox="0 0 10 10" className={cn('size-2.5 shrink-0', item.color?.fillClassName ?? 'fill-muted-foreground')}>
        <path d={SHAPES[item.symbol]} />
      </svg>
    );
  }
  if (item.line)
    return <span aria-hidden className={cn('w-4 shrink-0 border-t-2', LINE[item.line], item.color?.borderClassName ?? 'border-muted-foreground')} />;
  if (item.hollow)
    return <span aria-hidden className={cn('size-2.5 shrink-0 rounded-full border-2', item.color?.borderClassName ?? 'border-muted-foreground')} />;
  if (item.swatchClassName) return <span aria-hidden className={cn('size-2 shrink-0 rounded-[2px]', item.swatchClassName)} />;
  if (item.color) return <span aria-hidden className={cn('size-2 shrink-0 rounded-[2px]', item.color.swatchClassName)} />;
  return null;
}

const ROW = 'flex flex-wrap items-center justify-center gap-x-4 gap-y-1.5 pt-3 text-xs';
/** A hidden series' key. */
const HIDDEN_OPACITY = 0.4;

const BUTTON = 'flex items-center gap-1.5 rounded-sm outline-none transition-opacity focus-visible:ring-3 focus-visible:ring-ring/50';

/** What a click does, for the key's tooltip. */
const hint = (legend: LegendState, id: string): string =>
  legend.focus === id ? 'Click to show every series' : 'Click to hide, double-click to show only this';

/** A key that toggles series `id`: a click hides or shows it, a double click isolates it; hovering hovers it. */
function Toggle({
  id,
  name,
  legend,
  hover,
  hinted = true,
  className,
  children,
}: {
  id: string;
  name?: string;
  legend: LegendState;
  hover: HoverState;
  /** Say what a click does in a native title (off when a Tooltip says it) */
  hinted?: boolean;
  className?: string;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      {...hoverProps(id)}
      aria-pressed={legend.visible(id)}
      aria-label={name}
      title={hinted ? hint(legend, id) : undefined}
      onClick={event => (event.detail >= 2 ? legend.isolate(id) : legend.toggle(id))}
      className={cn(BUTTON, className)}
      // Hidden keys stay dim; while another series is hovered, every other key fades too
      style={{ opacity: hover.opacity(id) * (legend.visible(id) ? 1 : HIDDEN_OPACITY) }}
    >
      {children}
    </button>
  );
}

/** A row of keys; items with an id toggle their series when `legend` is given. */
export function KeyLegend({ items, legend, className }: { items: LegendItem[]; legend?: LegendState; className?: string }) {
  const hover = useHover();
  return (
    <ul className={cn(ROW, className)}>
      {items.map((item, i) => {
        const content = (
          <>
            <Key item={item} />
            {item.mark && (
              <span aria-hidden={item.name != null} className="inline-flex items-center">
                {item.mark}
              </span>
            )}
            {item.label != null && item.label !== '' && <span>{item.label}</span>}
          </>
        );
        const key = item.id ?? (typeof item.label === 'string' ? item.label : i);
        return (
          <li key={key} className="flex items-center gap-1.5">
            {legend && item.id != null ? (
              <Toggle id={item.id} name={item.name} legend={legend} hover={hover}>
                {content}
              </Toggle>
            ) : (
              content
            )}
          </li>
        );
      })}
    </ul>
  );
}

/** A series' model mark: its vendor's logo, or the baseline's sprite. */
function ModelMark({ series }: { series: SeriesSpec }) {
  if (series.sprite) return <Sprite src={series.sprite} size={14} alt="" />;
  if (series.vendor) return <BrandMark slug={series.vendor} size={14} />;
  return null;
}

const keyOf = (s: SeriesSpec, kind: Kind): Omit<LegendItem, 'label'> =>
  kind === 'line' ? { color: s.swatch, line: s.line } : kind === 'symbol' ? { color: s.swatch, symbol: s.symbol } : { color: s.swatch };

/**
 * A legend from series specs: each key in the series' style (`line` for lines, `symbol` for points,
 * `swatch` for bars and areas) with its marks; toggles through `legend` by `series.id`. Pairings
 * group under their model (see the top of this file). `before` adds plain keys first, such as a
 * median mark.
 */
export function SeriesLegend({
  series,
  legend,
  kind = 'line',
  before = [],
  className,
}: {
  series: SeriesSpec[];
  legend?: LegendState;
  kind?: Kind;
  before?: LegendItem[];
  className?: string;
}) {
  const hover = useHover();
  // Only lines and points carry the harness in their style; blocks of one colour can't tell pairings apart
  const paired = kind !== 'swatch' && series.some(s => s.harness && s.label);
  if (!paired) {
    return (
      <KeyLegend
        legend={legend}
        className={className}
        items={[
          ...before,
          ...series.map(s => ({
            id: s.id,
            name: s.name,
            label: null,
            mark: <SeriesLabel series={s} size={14} />,
            ...keyOf(s, kind),
          })),
        ]}
      />
    );
  }

  // One group per model, in the order the series come (a ranking stays a ranking)
  const groups = new Map<string, SeriesSpec[]>();
  for (const s of series) {
    const model = `${s.vendor ?? s.sprite ?? ''}|${s.label}`;
    groups.set(model, [...(groups.get(model) ?? []), s]);
  }
  const harnesses = new Map<string, SeriesSpec>();
  for (const s of series) if (s.harness && !harnesses.has(s.harness)) harnesses.set(s.harness, s);

  const key = (s: SeriesSpec) => <Key item={keyOf(s, kind)} />;
  // Models first, then the harnesses on their own row: the second row says what the dashes mean
  return (
    <div className={cn('flex flex-col gap-1.5 pt-3', className)}>
      <ul className={cn(ROW, 'pt-0')}>
        {before.map((item, i) => (
          <li key={`before-${i}`} className="flex items-center gap-1.5">
            <Key item={item} />
            {item.label}
          </li>
        ))}
        {[...groups.entries()].map(([model, members]) => {
          const first = members[0];
          const label = (
            <>
              <ModelMark series={first} />
              <span className="whitespace-nowrap">{first.label}</span>
            </>
          );
          // A model with one pairing is one key; with several, a key per pairing and then the name
          if (members.length === 1) {
            return (
              <li key={model}>
                {legend ? (
                  <Toggle id={first.id} name={first.name} legend={legend} hover={hover}>
                    {key(first)}
                    {label}
                  </Toggle>
                ) : (
                  <span className="flex items-center gap-1.5" title={first.name}>
                    {key(first)}
                    {label}
                  </span>
                )}
              </li>
            );
          }
          // The model's name fades with its keys: while another series is hovered, or when every one is hidden
          const lit = hover.id == null || members.some(s => s.id === hover.id);
          const shown = !legend || members.some(s => legend.visible(s.id));
          return (
            <li key={model} className="flex items-center gap-1.5">
              <span className="flex items-center gap-1">
                {members.map(s => (
                  <Tooltip key={s.key}>
                    <TooltipTrigger asChild>
                      <span className="flex">
                        {legend ? (
                          <Toggle id={s.id} name={s.name} legend={legend} hover={hover} hinted={false} className="h-4">
                            {key(s)}
                          </Toggle>
                        ) : (
                          <span className="flex h-4 items-center" aria-label={s.name}>
                            {key(s)}
                          </span>
                        )}
                      </span>
                    </TooltipTrigger>
                    <TooltipContent side="bottom" className="flex-col items-start gap-0.5">
                      <span>{s.name}</span>
                      {legend && <span className="opacity-60">{hint(legend, s.id)}</span>}
                    </TooltipContent>
                  </Tooltip>
                ))}
              </span>
              <span className="flex items-center gap-1.5 transition-opacity" style={{ opacity: (lit ? 1 : FADED_OPACITY) * (shown ? 1 : HIDDEN_OPACITY) }}>
                {label}
              </span>
            </li>
          );
        })}
      </ul>
      <ul className={cn(ROW, 'pt-0')}>
        {[...harnesses.entries()].map(([name, s]) => (
          <li key={`harness-${name}`} className="flex items-center gap-1.5">
            <Key item={kind === 'line' ? { line: s.line } : { symbol: s.symbol }} />
            <Badge variant="secondary" className={harnessBadgeClassName}>
              {name}
            </Badge>
          </li>
        ))}
      </ul>
    </div>
  );
}
