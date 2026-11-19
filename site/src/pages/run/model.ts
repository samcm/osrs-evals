/** What the run page derives from a run: one clock for ticks and seconds, tool category and token colours, turn helpers. */

import { useSyncExternalStore } from 'react';
import type { Action, RunDetail, ToolCategory, Turn } from '@/data/types';
import type { SeriesColor } from '@/lib/series';

export type XMeasure = 'ticks' | 'seconds';

/** Tool categories, keyed by id, with the site-wide label and colour. */
export { TOOL_CATEGORY as CATEGORIES } from '@/lib/tools';

/** A data hue as a series colour, with literal class names so Tailwind generates them. */
const colour = (name: string, swatchClassName: string, borderClassName: string, fillClassName: string): SeriesColor => ({
  token: `--color-${name}`,
  swatchClassName,
  borderClassName,
  fillClassName,
});

/** Kinds of token, cumulative in series.calls, and the price key of each. */
export const TOKEN_KINDS = [
  { id: 'input', label: 'Input', key: 'input_uncached', price: 'input', color: colour('data-blue', 'bg-data-blue', 'border-data-blue', 'fill-data-blue') },
  { id: 'cache_write', label: 'Cache writes', key: 'cache_write', price: 'input_cache_write', color: colour('data-violet', 'bg-data-violet', 'border-data-violet', 'fill-data-violet') },
  { id: 'cache_read', label: 'Cache reads', key: 'cache_read', price: 'input_cache_read', color: colour('data-cyan', 'bg-data-cyan', 'border-data-cyan', 'fill-data-cyan') },
  { id: 'output', label: 'Output', key: 'output', price: 'output', color: colour('data-rose', 'bg-data-rose', 'border-data-rose', 'fill-data-rose') },
] as const;

export const SDK_OK = colour('data-sky', 'bg-data-sky', 'border-data-sky', 'fill-data-sky');
export const SDK_FAILED = colour('danger', 'bg-danger', 'border-danger', 'fill-danger');
export const WALKING = colour('data-sky', 'bg-data-sky', 'border-data-sky', 'fill-data-sky');
export const RUNNING = colour('data-blue', 'bg-data-blue', 'border-data-blue', 'fill-data-blue');

/** The map's path colours from the run's start to its end; also the scrubber's track. */
export const TIME_RAMP = ['--color-data-cyan', '--color-data-violet', '--color-data-orange'] as const;

const ANIMATIONS: Record<string, string> = {
  human_unarmedpunch: 'Punching',
  human_unarmedblock: 'Blocking',
  human_reachforladder: 'Climbing',
  human_pickuptable: 'Taking from a table',
  human_pickupfloor: 'Picking up',
  human_spinningwheel: 'Spinning',
  human_openchest: 'Opening a chest',
  human_firecooking: 'Cooking on a fire',
  human_pickpocket: 'Pickpocketing',
  human_death: 'Dying',
};

/** An rs-sdk animation name as words: human_cooking → Cooking. */
export function animationName(seq: string): string {
  const known = ANIMATIONS[seq];
  if (known) return known;
  const words = seq.replace(/^human_/, '').replace(/_/g, ' ');
  return words.charAt(0).toUpperCase() + words.slice(1);
}

export interface Clock {
  toSeconds: (tick: number) => number;
  toTick: (seconds: number) => number;
  /** The game's end on each clock: the axes stop here */
  maxTicks: number;
  maxSeconds: number;
  /** A tick or a seconds value on the chosen x measure */
  x: (tick: number, measure: XMeasure) => number;
}

/** Piecewise-linear interpolation through sorted [a, b] pairs, extrapolating at `rate` b per a. */
function interpolate(pairs: [number, number][], rate: number): (a: number) => number {
  return a => {
    if (pairs.length === 0) return a * rate;
    let lo = 0;
    let hi = pairs.length - 1;
    if (a <= pairs[0][0]) return pairs[0][1] + (a - pairs[0][0]) * rate;
    if (a >= pairs[hi][0]) return pairs[hi][1] + (a - pairs[hi][0]) * rate;
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (pairs[mid][0] <= a) lo = mid;
      else hi = mid;
    }
    const [a0, b0] = pairs[lo];
    const [a1, b1] = pairs[hi];
    return a1 === a0 ? b0 : b0 + ((a - a0) / (a1 - a0)) * (b1 - b0);
  };
}

/** The run's one clock, from every moment known on both: timeline points, events and model calls. */
export function makeClock(run: RunDetail): Clock {
  const raw: [number, number][] = [[0, 0]];
  for (const p of run.timeline) raw.push([p.tick, p.seconds]);
  for (const e of run.events) raw.push([e.tick, e.seconds]);
  for (const t of run.turns) if (t.tick != null) raw.push([t.tick, t.at]);
  raw.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  // Both clocks only move forward: keep the pairs that agree
  const pairs: [number, number][] = [];
  for (const p of raw) {
    const last = pairs[pairs.length - 1];
    if (!last || (p[0] > last[0] && p[1] > last[1])) pairs.push(p);
  }
  const rate = run.tick_ms / 1000;
  const toSeconds = interpolate(pairs, rate);
  const toTick = interpolate(
    pairs.map(([a, b]) => [b, a]),
    1 / rate
  );
  const lastTick = run.timeline[run.timeline.length - 1]?.tick ?? 0;
  const maxTicks = Math.min(run.budget_ticks * run.attempts, Math.max(run.game_ticks ?? lastTick, 1));
  const maxSeconds = run.game_seconds ?? toSeconds(maxTicks);
  return { toSeconds, toTick, maxTicks, maxSeconds, x: (tick, measure) => (measure === 'ticks' ? tick : toSeconds(tick)) };
}

/** A turn's tick: its own, or from its seconds. */
export const turnTick = (turn: Turn, clock: Clock): number => turn.tick ?? Math.round(clock.toTick(turn.at));

/** The turn running at a tick: the last that started at or before it (the first before any). */
export function turnAt(turns: Turn[], clock: Clock, tick: number): number {
  let found = 0;
  for (let i = 0; i < turns.length; i++) {
    if (turnTick(turns[i], clock) <= tick) found = i;
    else break;
  }
  return found;
}

/** The tool categories of a turn, each once, in order of first use. */
export function turnCategories(turn: Turn): ToolCategory[] {
  return [...new Set(turn.actions.map(a => a.category))];
}

export const turnHasError = (turn: Turn): boolean => turn.error != null || turn.actions.some(a => a.error != null);

/** What a turn said, in one line: the model's own words, else the game functions its script called, else its command. */
export function turnSummary(turn: Turn): { text: string; kind: 'said' | 'sdk' | 'command' } | null {
  const said = turn.text?.split('\n').find(line => line.trim() !== '');
  if (said) return { text: said.trim().replace(/^#+\s*/, ''), kind: 'said' };
  const sdk = [...new Set(turn.actions.flatMap(a => a.sdk_calls))].filter(f => f !== 'getState');
  if (sdk.length) return { text: sdk.join(' '), kind: 'sdk' };
  // Polling a running process (Codex): what the process printed since, not the poll itself
  if (turn.actions.length > 0 && turn.actions.every(a => a.category === 'wait')) {
    const printed = turn.actions.map(a => processOutput(a.output)).find(Boolean);
    return { text: printed ?? 'No new output', kind: 'command' };
  }
  const command = turn.actions.map(commandLine).find(Boolean);
  if (command) return { text: command, kind: 'command' };
  return turn.stop_reason === 'game_over' ? { text: 'Cut off by the end of the game', kind: 'command' } : null;
}

/** The last line a polled process printed: Codex wraps it in a header ending "Output:". */
function processOutput(output: string | null): string | undefined {
  if (!output) return undefined;
  const at = output.indexOf('Output:');
  const body = at >= 0 ? output.slice(at + 'Output:'.length) : output;
  return body
    .split('\n')
    .map(line => line.trim())
    .filter(Boolean)
    .at(-1);
}

/** The first line of a command worth reading: without a leading `cd somewhere;`. */
function commandLine(action: Action): string {
  for (const line of action.input.split('\n')) {
    const rest = line.replace(/^\s*cd\s+\S+\s*(;|&&)\s*/, '').trim();
    if (rest) return rest;
  }
  return '';
}

/** The most used tool of the run: actions with it don't print their tool's name. */
export function commonTool(run: RunDetail): string | null {
  const names = Object.entries(run.metrics.tool_names);
  if (names.length === 0) return null;
  return names.sort((a, b) => b[1] - a[1])[0][0];
}

/**
 * Transient time on the page, outside React state: the lanes' crosshair (hover) and the map's
 * scrubber while dragging or playing (scrub). Both in game ticks.
 */
interface Moment {
  hover: number | null;
  scrub: number | null;
}

let moment: Moment = { hover: null, scrub: null };
const listeners = new Set<() => void>();

export function setMoment(patch: Partial<Moment>): void {
  const next = { ...moment, ...patch };
  if (next.hover === moment.hover && next.scrub === moment.scrub) return;
  moment = next;
  for (const l of listeners) l();
}

export const getMoment = (): Moment => moment;

export function useMoment(): Moment {
  return useSyncExternalStore(
    l => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => moment
  );
}
