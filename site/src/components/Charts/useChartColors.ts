import { useMemo } from 'react';
import { useThemeColors, type ThemeColors } from '@/hooks/useThemeColors';
import { resolveCssColorToHex } from '@/utils/color';

export interface ChartColors {
  /** lab's theme colours, for the chrome (axes, grid, tooltip) */
  chrome: ThemeColors;
  /**
   * Any CSS colour a series carries (`var(--color-model-…)`, a thinking level's mix) as a hex for the
   * canvas, in the active theme; cached per theme
   */
  resolve: (css: string) => string;
}

/**
 * The colours a chart draws in: lab's `useThemeColors` for the chrome, and series colours (tokens)
 * resolved for the active theme, so every chart follows light and dark.
 */
export function useChartColors(): ChartColors {
  const chrome = useThemeColors();
  return useMemo(() => {
    const cache = new Map<string, string>();
    const resolve = (css: string): string => {
      let hex = cache.get(css);
      if (hex == null) {
        hex = resolveCssColorToHex(css, chrome.muted);
        cache.set(css, hex);
      }
      return hex;
    };
    return { chrome, resolve };
  }, [chrome]);
}
