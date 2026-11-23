/**
 * A heat scale in one hue, in tint steps from the surface to the full colour (the site's rule for
 * heat), as the `colorGradient` lab's Heatmap takes. Tokens resolve for the active theme.
 *
 *   <Heatmap colorGradient={heatGradient('--color-data-blue')} … />
 */
export function heatGradient(token: string, steps = 5): string[] {
  return Array.from({ length: steps }, (_, i) => {
    const share = Math.round(8 + (92 * i) / (steps - 1));
    return `color-mix(in oklab, var(${token}) ${share}%, var(--color-surface))`;
  });
}
