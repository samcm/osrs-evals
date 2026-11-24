/** Kinds of token and SDK outcomes: one name and one fixed colour each, on every page. */

import type { SeriesColor } from './series';

// Literal class names so Tailwind generates them:
// bg-data-blue border-data-blue fill-data-blue bg-data-violet border-data-violet fill-data-violet
// bg-data-cyan border-data-cyan fill-data-cyan bg-data-rose border-data-rose fill-data-rose
// bg-data-sky border-data-sky fill-data-sky bg-danger border-danger fill-danger
const hue = (name: string): SeriesColor => ({
  token: `--color-data-${name}`,
  swatchClassName: `bg-data-${name}`,
  borderClassName: `border-data-${name}`,
  fillClassName: `fill-data-${name}`,
});

export type TokenKind = 'input' | 'cache_write' | 'cache_read' | 'output';

export interface TokenKindInfo {
  id: TokenKind;
  label: string;
  color: SeriesColor;
}

/** In the order stacks draw them. */
export const TOKEN_KINDS: TokenKindInfo[] = [
  { id: 'input', label: 'Input', color: hue('blue') },
  { id: 'cache_write', label: 'Cache writes', color: hue('violet') },
  { id: 'cache_read', label: 'Cache reads', color: hue('cyan') },
  { id: 'output', label: 'Output', color: hue('rose') },
];

export const TOKEN_KIND = Object.fromEntries(TOKEN_KINDS.map(k => [k.id, k])) as Record<TokenKind, TokenKindInfo>;

/** An SDK call that worked, and one that failed. */
export const SDK_OUTCOMES = {
  ok: { id: 'ok', label: 'Worked', color: hue('sky') },
  failed: {
    id: 'failed',
    label: 'Failed',
    color: {
      token: '--color-danger',
      swatchClassName: 'bg-danger',
      borderClassName: 'border-danger',
      fillClassName: 'fill-danger',
    },
  },
} as const;
