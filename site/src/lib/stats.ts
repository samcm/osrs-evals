/** Aggregates: medians, means and sums, a Pareto frontier, and 1-2-5 steps for log axes. */

export function median(values: (number | null | undefined)[]): number | null {
  const v = values.filter((x): x is number => x != null && !Number.isNaN(x)).sort((a, b) => a - b);
  if (v.length === 0) return null;
  const mid = Math.floor(v.length / 2);
  return v.length % 2 ? v[mid] : (v[mid - 1] + v[mid]) / 2;
}

export function mean(values: (number | null | undefined)[]): number | null {
  const v = values.filter((x): x is number => x != null && !Number.isNaN(x));
  return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
}

export function sum(values: (number | null | undefined)[]): number {
  return values.reduce<number>((a, b) => a + (b ?? 0), 0);
}

/** Keys on the Pareto frontier: no other point is cheaper or equal and higher or equal, with one strict. */
export function paretoFrontier<T>(points: T[], x: (p: T) => number, y: (p: T) => number): T[] {
  return points
    .filter(p => !points.some(o => o !== p && x(o) <= x(p) && y(o) >= y(p) && (x(o) < x(p) || y(o) > y(p))))
    .sort((a, b) => x(a) - x(b));
}

/** 1-2-5 steps between lo and hi, for a log axis. */
export function niceSteps(lo: number, hi: number): number[] {
  const out: number[] = [];
  for (let e = Math.floor(Math.log10(lo)) - 1; e <= Math.ceil(Math.log10(hi)); e++) {
    for (const m of [1, 2, 5]) {
      const v = Number((m * 10 ** e).toPrecision(3));
      if (v >= lo && v <= hi) out.push(v);
    }
  }
  return out;
}

/** The 1-2-5 step at or below v, and at or above v. */
export function stepBelow(v: number): number {
  const e = Math.floor(Math.log10(v));
  const candidates = [5, 2, 1].map(m => m * 10 ** e);
  return Number((candidates.find(c => c <= v * (1 + 1e-9)) ?? 10 ** (e - 1) * 5).toPrecision(3));
}

export function stepAbove(v: number): number {
  const e = Math.floor(Math.log10(v));
  const candidates = [1, 2, 5, 10].map(m => m * 10 ** e);
  return Number((candidates.find(c => c >= v * (1 - 1e-9)) ?? 10 ** (e + 1)).toPrecision(3));
}
