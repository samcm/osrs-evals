/**
 * The game's items as the runs held them: names, store values and sprites, from the index's
 * `items` (site/game/items.json through the export). A stack shows the sprite the game shows for its
 * count (coins as a pile), and its count the way the game writes it.
 */

import type { HeldChange, ItemInfo } from '@/data/types';
import { itemSrc } from './assets';

const ITEMS = new Map<string, ItemInfo>();

export function registerItems(items: Record<string, ItemInfo>): void {
  for (const [id, info] of Object.entries(items)) ITEMS.set(id, info);
}

export const itemInfo = (id: string | number): ItemInfo | undefined => ITEMS.get(String(id));
export const itemName = (id: string | number): string => itemInfo(id)?.name ?? `Item ${id}`;

/** The sprite a stack of an item shows: the last stack sprite whose count it reaches, else its own. */
export function itemSprite(id: string | number, count = 1): string {
  let sprite = String(id);
  for (const [from, other] of itemInfo(id)?.stacks ?? []) if (count >= from) sprite = String(other);
  return itemSrc(sprite);
}

/** A stack's count in its slot: as is below 10,000, then K, then M, at most four characters. */
export function stackCount(count: number): string {
  // At most four characters, so it stays inside its slot: 9999, 245K, 2.2M, 12M
  if (count >= 10_000_000) return `${Math.floor(count / 1_000_000)}M`;
  if (count >= 1_000_000) return `${Math.floor(count / 100_000) / 10}M`;
  if (count >= 10_000) return `${Math.floor(count / 1000)}K`;
  return String(count);
}

export type HeldTable = 'inv' | 'bank' | 'worn' | 'levels';

/**
 * An account's tables at a tick, replayed from its changes; items in the order the account first got
 * them (the save keeps counts, not slots).
 */
export function heldAt(changes: HeldChange[] | undefined, tick: number): Record<HeldTable, [string, number][]> {
  const tables: Record<HeldTable, Map<string, number>> = {
    inv: new Map(),
    bank: new Map(),
    worn: new Map(),
    levels: new Map(),
  };
  for (const c of changes ?? []) {
    if (c.tick > tick) break;
    for (const k of ['inv', 'bank', 'worn', 'levels'] as const)
      for (const [id, n] of Object.entries(c[k] ?? {})) {
        if (n) tables[k].set(id, n);
        else tables[k].delete(id);
      }
  }
  return { inv: [...tables.inv], bank: [...tables.bank], worn: [...tables.worn], levels: [...tables.levels] };
}
