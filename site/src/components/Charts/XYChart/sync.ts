/**
 * Charts that share an x measure share one crosshair: the x value under the pointer in any chart of
 * a group, which every other chart of the group shows its crosshair and tooltip at. Synced by value,
 * not pixel, so charts of different widths or right margins still line up on the same x.
 */

type Listener = (x: number | null, from: object) => void;

const groups = new Map<string, Set<Listener>>();

export function subscribeSync(group: string, listener: Listener): () => void {
  let set = groups.get(group);
  if (!set) groups.set(group, (set = new Set()));
  set.add(listener);
  return () => {
    set.delete(listener);
    if (set.size === 0) groups.delete(group);
  };
}

/** The pointer's x in a chart of the group (null when it left); `from` is that chart, which isn't told. */
export function publishSync(group: string, x: number | null, from: object): void {
  for (const listener of groups.get(group) ?? []) listener(x, from);
}
