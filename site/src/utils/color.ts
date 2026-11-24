/**
 * Colour Utilities
 *
 * Helper functions for working with CSS colors, including modern color formats like oklch.
 * Uses culori library for robust color parsing and conversion.
 */

import { formatHex } from 'culori';

/**
 * Resolve any CSS color to hex format
 *
 * Converts modern CSS colors (oklch, color-mix, etc.) to hex format
 * that libraries like ECharts can understand. Uses culori for robust
 * color parsing across all modern CSS color formats.
 *
 * @param color - Any valid CSS color string
 * @param fallback - Fallback color if resolution fails
 * @returns Hex color string (e.g., '#06b6d4')
 *
 * @example
 * ```ts
 * resolveCssColorToHex('oklch(78.9% 0.154 211.53)') // '#06b6d4'
 * resolveCssColorToHex('color-mix(in srgb, red 50%, blue)') // '#800080'
 * resolveCssColorToHex('rgb(255, 0, 0)') // '#ff0000'
 * resolveCssColorToHex('invalid', '#000000') // '#000000'
 * ```
 */
export function resolveCssColorToHex(color: string, fallback = '#000000'): string {
  // If already a valid 6-digit hex color, return as-is
  if (/^#[0-9A-Fa-f]{6}$/.test(color)) {
    return color;
  }

  // Create a temporary element to resolve the color via browser's computed styles
  const temp = document.createElement('div');
  temp.style.color = color;

  // Append to body to ensure computed styles work
  document.body.appendChild(temp);

  // Get the computed color value (browser resolves oklch, color-mix, etc. to rgb)
  const computedColor = window.getComputedStyle(temp).color;

  // Clean up
  document.body.removeChild(temp);

  // Use culori to parse any CSS color format (oklch, rgb, rgba, hsl, etc.) and convert to hex
  const hexColor = formatHex(computedColor);

  // formatHex returns undefined if color is invalid
  if (!hexColor) {
    console.warn(
      `[resolveCssColorToHex] Failed to resolve CSS color "${color}". ` +
        `Computed color: "${computedColor}". Falling back to ${fallback}.`
    );
    return fallback;
  }

  return hexColor;
}
