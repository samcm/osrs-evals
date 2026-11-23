/**
 * Theme colours for code that draws on a canvas (the world maps, the heat map). The theme itself is
 * lab's: ThemeProvider (src/providers) keeps the reader's choice of light, dark or star, `?theme=`
 * overrides it for a shared link, and useTheme / useThemeColors (src/hooks) read it. This adds what
 * a canvas also needs: any token, such as a series colour, resolved to a colour it can draw.
 */

import { useMemo } from 'react';
import { useThemeColors as useLabThemeColors, type ThemeColors as LabThemeColors } from '@/hooks/useThemeColors';

/** Resolve a colour token to rgb() for the canvas, which cannot read oklch, color-mix or light-dark(). */
let probe: HTMLSpanElement | null = null;
let context: CanvasRenderingContext2D | null = null;

export function resolveToken(token: string): string {
  if (!probe) {
    probe = document.createElement('span');
    probe.style.display = 'none';
    document.body.appendChild(probe);
    context = document.createElement('canvas').getContext('2d', { willReadFrequently: true });
  }
  probe.style.color = `var(${token})`;
  const computed = getComputedStyle(probe).color;
  if (!context) return computed;
  context.clearRect(0, 0, 1, 1);
  context.fillStyle = '#000';
  context.fillStyle = computed;
  context.fillRect(0, 0, 1, 1);
  const [r, g, b, a] = context.getImageData(0, 0, 1, 1).data;
  return a === 255 ? `rgb(${r}, ${g}, ${b})` : `rgba(${r}, ${g}, ${b}, ${((a ?? 0) / 255).toFixed(3)})`;
}

export interface ThemeColors extends LabThemeColors {
  /** Resolve any token, such as a series colour, for the active theme */
  resolve: (token: string) => string;
}

/** lab's theme colours, plus `resolve` for any token; recomputed when the theme changes. */
export function useThemeColors(): ThemeColors {
  const colors = useLabThemeColors();
  return useMemo(() => {
    // lab's colours are a new object on each theme change, so this cache lives for one theme
    const cache = new Map<string, string>();
    const resolve = (token: string): string => {
      let value = cache.get(token);
      if (!value) {
        value = resolveToken(token);
        cache.set(token, value);
      }
      return value;
    };
    return { ...colors, resolve };
  }, [colors]);
}
