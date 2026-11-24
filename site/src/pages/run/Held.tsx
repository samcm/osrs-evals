/**
 * What the followed account held at the playhead, beside the game as the game's own side panel
 * shows it: its inventory (four by seven slots), what it wore, its bank, and its skills (the stats
 * tab's icons and levels). Replayed from the run's changes (`held`), so it moves with the one
 * playhead. The open tab is `?panel=`; an eval's default is what it is about (skills for total
 * level, else the inventory).
 */

import { useMemo, type JSX } from 'react';
import { Segmented, Tip } from '@/components/bits';
import { Sprite } from '@/components/marks';
import { ScrollArea } from '@/components/Layout/ScrollArea';
import type { RunDetail } from '@/data/types';
import { skillSrc, uiSrc } from '@/lib/assets';
import { evalBase } from '@/lib/evals';
import { formatInt } from '@/lib/format';
import { heldAt, itemName, itemSprite, stackCount } from '@/lib/items';
import { useSearchUpdate } from '@/lib/search';
import type { Clock } from './model';
import { useCommitted, usePlayhead } from './playhead';
import { runSearch, type RunSearch } from './search';

type PanelTab = 'inv' | 'worn' | 'bank' | 'skills';

/** The stats tab's order, row by row, as the 2004 client lays it out. */
const SKILLS = [
  'attack',
  'hitpoints',
  'mining',
  'strength',
  'agility',
  'smithing',
  'defence',
  'herblore',
  'fishing',
  'ranged',
  'thieving',
  'cooking',
  'prayer',
  'crafting',
  'firemaking',
  'magic',
  'fletching',
  'woodcutting',
  'runecraft',
];
const INVENTORY_SLOTS = 28;

const defaultPanel = (evalId: string): PanelTab => (evalBase(evalId) === 'total_level' ? 'skills' : 'inv');

/** One slot of the client's grid: the item's sprite, its stack count over its corner as the game draws it. */
function Slot({ id, count }: { id?: string; count?: number }): JSX.Element {
  return (
    <Tip content={id ? `${itemName(id)}${count && count > 1 ? `, ${formatInt(count)}` : ''}` : undefined}>
      <span className="relative flex size-9 items-center justify-center rounded-xs bg-muted-10">
        {id && <Sprite src={itemSprite(id, count)} size={32} alt={itemName(id)} />}
        {id && count != null && count > 1 && (
          <span className="absolute top-0 left-0.5 text-2xs font-medium text-foreground tabular-nums">
            {stackCount(count)}
          </span>
        )}
      </span>
    </Tip>
  );
}

/** A grid of slots, four across beside the game and seven across under it on a phone. */
function Slots({ label, items }: { label: string; items: [string | undefined, number | undefined][] }): JSX.Element {
  return (
    <ol className="grid w-max grid-cols-4 gap-1.5 max-md:grid-cols-7" aria-label={label}>
      {items.map(([id, n], i) => (
        // A slot is its place in the grid: empty slots and repeated items have nothing else to key them
        // eslint-disable-next-line @eslint-react/no-array-index-key
        <li key={i}>
          <Slot id={id} count={n} />
        </li>
      ))}
    </ol>
  );
}

export function Held({
  run,
  clock,
  account,
  tab,
}: {
  run: RunDetail;
  clock: Clock;
  account: string;
  tab: RunSearch['panel'];
}): JSX.Element {
  const update = useSearchUpdate(runSearch);
  const [committed] = useCommitted(run, clock);
  const head = usePlayhead(clock, committed);
  const open: PanelTab = tab ?? defaultPanel(run.eval);
  const changes = run.held?.[account];
  // Re-replayed per whole tick, not per frame
  const tick = Math.floor(head.at);
  const held = useMemo(() => heldAt(changes, tick), [changes, tick]);

  // The game's own side-panel icons; the bank has none in the client, so its word
  const tabs = [
    { value: 'inv', label: <Sprite src={uiSrc('inventory')} size={20} alt="" />, title: 'Inventory' },
    { value: 'worn', label: <Sprite src={uiSrc('equipment')} size={20} alt="" />, title: 'Worn' },
    { value: 'bank', label: 'Bank' },
    { value: 'skills', label: <Sprite src={uiSrc('stats')} size={20} alt="" />, title: 'Skills' },
  ] satisfies { value: PanelTab; label: JSX.Element | string; title?: string }[];
  const levels = new Map(held.levels);
  const total = SKILLS.reduce((sum, s) => sum + (levels.get(s) ?? 1), 0);

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <Segmented
        label="What it held"
        value={open}
        options={tabs}
        onChange={v => update({ panel: v === defaultPanel(run.eval) ? undefined : v })}
      />
      <ScrollArea className="min-h-0 flex-1">
        {open === 'inv' && (
          <Slots
            label="Inventory"
            items={Array.from({ length: Math.max(INVENTORY_SLOTS, held.inv.length) }, (_, i) => [
              held.inv[i]?.[0],
              held.inv[i]?.[1],
            ])}
          />
        )}
        {(open === 'worn' || open === 'bank') &&
          (held[open].length === 0 ? (
            <p className="text-sm text-muted">{open === 'worn' ? 'Nothing worn.' : 'Nothing banked.'}</p>
          ) : (
            <Slots label={open === 'worn' ? 'Worn' : 'Bank'} items={held[open]} />
          ))}
        {open === 'skills' && (
          <div className="flex w-max flex-col gap-2">
            <ol className="grid grid-cols-3 gap-x-3 gap-y-1" aria-label="Skills">
              {SKILLS.map(s => (
                <Tip key={s} content={s.charAt(0).toUpperCase() + s.slice(1)}>
                  <li className="flex items-center gap-1.5 text-sm tabular-nums">
                    <Sprite src={skillSrc(s)} size={20} alt={s} />
                    {levels.get(s) ?? 1}
                  </li>
                </Tip>
              ))}
            </ol>
            <p className="flex gap-2 text-sm">
              <span className="text-muted">Total level</span>
              <span className="tabular-nums">{formatInt(total)}</span>
            </p>
          </div>
        )}
      </ScrollArea>
    </div>
  );
}
