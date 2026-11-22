/**
 * What the followed account held at the playhead, beside the game as the game's own side panel
 * shows it: its inventory (four by seven slots), what it wore, its bank, and its skills (the stats
 * tab's icons and levels). Replayed from the run's changes (`held`), so it moves with the one
 * playhead. The open tab is `?panel=`; an eval's default is what it is about (skills for total
 * level, else the inventory).
 */

import { useMemo } from 'react';
import { Sprite } from '@/components/marks';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import type { RunDetail } from '@/data/types';
import { skillSrc, uiSrc } from '@/lib/assets';
import { evalBase } from '@/lib/evals';
import { formatInt } from '@/lib/format';
import { heldAt, itemName, itemSprite, stackCount } from '@/lib/items';
import { useSearchUpdate } from '@/lib/search';
import type { Clock } from './model';
import { useCommitted, usePlayhead } from './playhead';
import { runSearch, type RunSearch } from './search';

export type PanelTab = 'inv' | 'worn' | 'bank' | 'skills';

/** The stats tab's order, row by row, as the 2004 client lays it out. */
const SKILLS = [
  'attack', 'hitpoints', 'mining',
  'strength', 'agility', 'smithing',
  'defence', 'herblore', 'fishing',
  'ranged', 'thieving', 'cooking',
  'prayer', 'crafting', 'firemaking',
  'magic', 'fletching', 'woodcutting',
  'runecraft',
];
const INVENTORY_SLOTS = 28;

export const defaultPanel = (evalId: string): PanelTab => (evalBase(evalId) === 'total_level' ? 'skills' : 'inv');

function Slot({ id, count }: { id?: string; count?: number }) {
  return (
    <span className="relative flex size-9 items-center justify-center rounded-sm bg-muted/60" title={id ? `${itemName(id)}${count && count > 1 ? `, ${formatInt(count)}` : ''}` : undefined}>
      {id && <Sprite src={itemSprite(id, count)} size={32} alt={itemName(id)} />}
      {id && count != null && count > 1 && <span className="absolute top-0 left-0.5 text-xs leading-none font-medium tabular-nums">{stackCount(count)}</span>}
    </span>
  );
}

export function Held({ run, clock, account, tab }: { run: RunDetail; clock: Clock; account: string; tab: RunSearch['panel'] }) {
  const update = useSearchUpdate(runSearch);
  const [committed] = useCommitted(run, clock);
  const head = usePlayhead(clock, committed);
  const open: PanelTab = tab ?? defaultPanel(run.eval);
  const changes = run.held?.[account];
  // Re-replayed per whole tick, not per frame
  const tick = Math.floor(head.at);
  const held = useMemo(() => heldAt(changes, tick), [changes, tick]);

  // The game's own side-panel icons; the bank has none in the client, so its word
  const tabs: { value: PanelTab; label: string; icon?: string }[] = [
    { value: 'inv', label: 'Inventory', icon: uiSrc('inventory') },
    { value: 'worn', label: 'Worn', icon: uiSrc('equipment') },
    { value: 'bank', label: 'Bank' },
    { value: 'skills', label: 'Skills', icon: uiSrc('stats') },
  ];
  const levels = new Map(held.levels);
  const total = SKILLS.reduce((sum, s) => sum + (levels.get(s) ?? 1), 0);

  return (
    <div className="flex min-h-0 flex-col gap-3">
      <ToggleGroup
        type="single"
        size="sm"
        variant="outline"
        className="w-full"
        value={open}
        onValueChange={v => v && update({ panel: v === defaultPanel(run.eval) ? undefined : (v as PanelTab) })}
        aria-label="What it held"
      >
        {tabs.map(t => (
          <ToggleGroupItem key={t.value} value={t.value} aria-label={t.label} title={t.label} className="flex-1">
            {t.icon ? <Sprite src={t.icon} size={20} alt="" /> : t.label}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {open === 'inv' && (
          <ol className="grid w-max grid-cols-4 gap-1.5 max-md:grid-cols-7" aria-label="Inventory">
            {Array.from({ length: Math.max(INVENTORY_SLOTS, held.inv.length) }, (_, i) => (
              <li key={i}>
                <Slot id={held.inv[i]?.[0]} count={held.inv[i]?.[1]} />
              </li>
            ))}
          </ol>
        )}
        {(open === 'worn' || open === 'bank') &&
          (held[open].length === 0 ? (
            <p className="text-sm text-muted-foreground">{open === 'worn' ? 'Nothing worn.' : 'Nothing banked.'}</p>
          ) : (
            <ol className="grid w-max grid-cols-4 gap-1.5 max-md:grid-cols-7" aria-label={open === 'worn' ? 'Worn' : 'Bank'}>
              {held[open].map(([id, n]) => (
                <li key={id}>
                  <Slot id={id} count={n} />
                </li>
              ))}
            </ol>
          ))}
        {open === 'skills' && (
          <div className="flex w-max flex-col gap-2">
            <ol className="grid grid-cols-3 gap-x-3 gap-y-1" aria-label="Skills">
              {SKILLS.map(s => (
                <li key={s} className="flex items-center gap-1.5 text-sm tabular-nums" title={s.charAt(0).toUpperCase() + s.slice(1)}>
                  <Sprite src={skillSrc(s)} size={20} alt={s} />
                  {levels.get(s) ?? 1}
                </li>
              ))}
            </ol>
            <p className="text-sm">
              <span className="text-muted-foreground">Total level</span> <span className="tabular-nums">{formatInt(total)}</span>
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
