/** The pairing the eval page lights: the legend's focus (`focus=`), else the page's hover (lib/hover). */

import { useHover } from '@/lib/hover';

export function useLit(focus: string | undefined): string | null {
  const hover = useHover();
  return focus ?? hover.id ?? null;
}

/** Whether a pairing fades: another one is lit. */
export const faded = (lit: string | null, id: string): boolean => lit != null && lit !== id;
