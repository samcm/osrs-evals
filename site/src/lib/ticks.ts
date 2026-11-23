/** Round ticks for a linear axis from zero: 0, 10K, 20K, 30K, never 1,883 or 10.9K. */

/** The 1-2-2.5-5 step that gives about `count` intervals up to `max`; at least 1 for counts. */
export function roundStep(max: number, count = 5, integer = true): number {
  if (!(max > 0)) return 1;
  const raw = max / count;
  const e = Math.floor(Math.log10(raw));
  const steps = (integer && e < 1 ? [1, 2, 5, 10] : [1, 2, 2.5, 5, 10]).map(m => m * 10 ** e);
  const fits = steps.filter(s => s >= raw * (1 - 1e-9));
  // Of the next two steps, prefer one that lands on max itself (0, 250, 500 rather than 0, 200, 400, 600)
  const step = fits.slice(0, 2).find(s => Math.abs(max / s - Math.round(max / s)) < 1e-9) ?? fits[0] ?? 10 ** (e + 1);
  return integer ? Math.max(1, step) : step;
}

/** Ticks from 0 by a round step, none past `max` (so an axis that stops at a budget keeps its end). */
export function roundTicks(max: number, count = 5, integer = true): number[] {
  const step = roundStep(max, count, integer);
  const ticks: number[] = [];
  for (let v = 0; v <= max * (1 + 1e-9); v += step) ticks.push(Number(v.toPrecision(12)));
  return ticks;
}

/** `max` rounded up to a whole step, for a domain that ends on a tick. */
export function roundCeil(max: number, count = 5, integer = true): number {
  const step = roundStep(max, count, integer);
  return Math.ceil(max / step - 1e-9) * step;
}

/** A tick label: compact from a thousand up (2.5K, 10K, 1.2M), so one axis never mixes "5,000" and "10K". */
export function formatTick(value: number): string {
  if (Math.abs(value) >= 1000)
    return new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 }).format(value);
  return value.toLocaleString('en-US', { maximumFractionDigits: 2 });
}
