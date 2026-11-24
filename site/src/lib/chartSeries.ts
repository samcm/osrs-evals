/**
 * Series for charts: every model, variant, vendor, agent, tool category and token kind as a
 * `SeriesSpec` (a CSS-safe key, a label, a fixed colour token, a line style and point shape, and its
 * marks), from series.ts, tools.ts and tokens.ts. The chart kit (components/Charts) draws lines,
 * points, legends, tooltips and end labels from specs, resolving the colour for the active theme.
 *
 *   const specs = ranked.map(r => variantSeries(r.variant));
 *   <XYChart lines={specs.map(s => ({ series: s, points: medians.get(s.id) }))} … />
 */

import type { Run, ToolCategory } from '@/data/types';
import {
  agentInfo,
  hashColor,
  modelInfo,
  variantOf,
  type AgentLine,
  type AgentSymbol,
  type SeriesColor,
  type Variant,
} from './series';
import { TOOL_CATEGORY } from './tools';
import { TOKEN_KIND, type TokenKind } from './tokens';

export interface SeriesSpec {
  /** The thing's own id: a model id, a variant key, a tool category … (for `hide=`/`focus=`) */
  id: string;
  /** CSS- and dataKey-safe: the ChartConfig key, the data field, and `--color-<key>` in the chart */
  key: string;
  /** Short name for labels ("Haiku 5.5", "Claude Code", "Write and run") */
  label: string;
  /** Full name for tooltips and accessible names ("Claude Haiku 5.5 in Claude Code") */
  name: string;
  /** A CSS colour: `var(--color-data-…)` */
  color: string;
  /** The same colour as a SeriesColor, for swatch classes */
  swatch: SeriesColor;
  line: AgentLine;
  symbol: AgentSymbol;
  /** Vendor brand slug, drawn before the label */
  vendor?: string;
  /** The harness's mark slug and name, its mark drawn after the label */
  harness?: { slug: string; name: string };
  /** The thinking level, drawn after the label */
  thinking?: string;
  /** A game sprite drawn instead of a vendor mark (the scripted baseline) */
  sprite?: string;
}

/** Any id as a key that is safe as a CSS custom property name and a Recharts dataKey (no dots). */
export function seriesKey(id: string): string {
  return `s-${id.replace(/[^a-zA-Z0-9-]/g, c => `_${c.charCodeAt(0).toString(16)}`)}`;
}

/** A SeriesColor as a CSS colour. */
export const cssColor = (color: SeriesColor): string => `var(${color.token})`;

const PROGRAM_SPRITE = '/assets/brands/program.png';

function spec(id: string, label: string, name: string, color: SeriesColor, rest: Partial<SeriesSpec> = {}): SeriesSpec {
  return {
    id,
    key: seriesKey(id),
    label,
    name,
    color: cssColor(color),
    swatch: color,
    line: 'solid',
    symbol: 'circle',
    ...rest,
  };
}

/** A model: its fixed colour and its vendor's mark. */
export function modelSeries(model: string): SeriesSpec {
  const info = modelInfo(model);
  if (info.vendor.slug === 'program')
    return spec(model, 'Program', 'Program', info.color, { sprite: PROGRAM_SPRITE, symbol: 'triangle' });
  return spec(model, info.short, info.name, info.color, { vendor: info.vendor.slug });
}

/** A variant: its model's colour, its agent's line and shape, the vendor's mark and the harness badge. */
export function variantSeries(source: Variant | Pick<Run, 'model' | 'agent' | 'agent_name' | 'thinking'>): SeriesSpec {
  const v = 'key' in source ? source : variantOf(source);
  const model = modelInfo(v.model);
  const agent = agentInfo(v.agent, 'agent_name' in source ? source.agent_name : undefined);
  const style = { line: v.line, symbol: v.symbol };
  if (agent.slug === 'program') return spec(v.key, 'Program', 'Program', v.color, { ...style, sprite: PROGRAM_SPRITE });
  return spec(v.key, model.short, v.name, v.color, {
    ...style,
    vendor: model.vendor.slug,
    thinking: v.thinking,
    harness: { slug: agent.slug, name: agent.name },
  });
}

/** An agent harness: its mark, its line and shape, and a fixed hashed colour. */
export function agentSeries(agent: string, fallbackName?: string): SeriesSpec {
  const info = agentInfo(agent, fallbackName);
  const style = { line: info.line, symbol: info.symbol };
  if (info.slug === 'program')
    return spec(agent, 'Program', 'Program', hashColor(`agent:${agent}`), { ...style, sprite: PROGRAM_SPRITE });
  return spec(agent, info.name, info.name, hashColor(`agent:${agent}`), {
    ...style,
    harness: { slug: info.slug, name: info.name },
  });
}

/** The width a series label's thinking level and harness mark add after its name, in pixels. */
export const extraLabelWidth = (s: SeriesSpec): number =>
  (s.thinking ? s.thinking.length * 6.5 + 20 : 0) + (s.harness ? 20 : 0);

/** A tool-call category. */
export function toolSeries(category: ToolCategory): SeriesSpec {
  const info = TOOL_CATEGORY[category];
  return spec(category, info.label, info.label, info.color);
}

/** A kind of token. */
export function tokenSeries(kind: TokenKind): SeriesSpec {
  const info = TOKEN_KIND[kind];
  return spec(kind, info.label, info.label, info.color);
}

/** An SVG strokeDasharray for an agent's line style (legend keys, end labels). */
export function dashArray(line: AgentLine): string | undefined {
  return line === 'dashed' ? '6 4' : line === 'dotted' ? '1.5 3' : undefined;
}
