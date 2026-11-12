/**
 * Names and fixed colours for every model and agent. A colour is a data hue token from tokens.css;
 * a model or agent not listed here gets a stable hash of its id into the chart palette, never a
 * colour by position.
 */

import type { Run } from '@/data/types';

export interface SeriesColor {
  /** The token, as a CSS custom property name, for charts to resolve */
  token: string;
  /** A background class for swatches */
  swatchClassName: string;
  /** A border class for line keys */
  borderClassName: string;
  /** A fill class for symbol keys */
  fillClassName: string;
}

const HUES = {
  orange: { token: '--color-data-orange', swatchClassName: 'bg-data-orange', borderClassName: 'border-data-orange', fillClassName: 'fill-data-orange' },
  teal: { token: '--color-data-teal', swatchClassName: 'bg-data-teal', borderClassName: 'border-data-teal', fillClassName: 'fill-data-teal' },
  slate: { token: '--color-data-slate', swatchClassName: 'bg-data-slate', borderClassName: 'border-data-slate', fillClassName: 'fill-data-slate' },
  sky: { token: '--color-data-sky', swatchClassName: 'bg-data-sky', borderClassName: 'border-data-sky', fillClassName: 'fill-data-sky' },
  pink: { token: '--color-data-pink', swatchClassName: 'bg-data-pink', borderClassName: 'border-data-pink', fillClassName: 'fill-data-pink' },
  lime: { token: '--color-data-lime', swatchClassName: 'bg-data-lime', borderClassName: 'border-data-lime', fillClassName: 'fill-data-lime' },
} satisfies Record<string, SeriesColor>;

/** The chart palette, chart-0 to chart-14, for ids without a fixed colour. */
const PALETTE: SeriesColor[] = [
  { token: '--color-chart-0', swatchClassName: 'bg-chart-0', borderClassName: 'border-chart-0', fillClassName: 'fill-chart-0' },
  { token: '--color-chart-1', swatchClassName: 'bg-chart-1', borderClassName: 'border-chart-1', fillClassName: 'fill-chart-1' },
  { token: '--color-chart-2', swatchClassName: 'bg-chart-2', borderClassName: 'border-chart-2', fillClassName: 'fill-chart-2' },
  { token: '--color-chart-3', swatchClassName: 'bg-chart-3', borderClassName: 'border-chart-3', fillClassName: 'fill-chart-3' },
  { token: '--color-chart-4', swatchClassName: 'bg-chart-4', borderClassName: 'border-chart-4', fillClassName: 'fill-chart-4' },
  { token: '--color-chart-5', swatchClassName: 'bg-chart-5', borderClassName: 'border-chart-5', fillClassName: 'fill-chart-5' },
  { token: '--color-chart-6', swatchClassName: 'bg-chart-6', borderClassName: 'border-chart-6', fillClassName: 'fill-chart-6' },
  { token: '--color-chart-7', swatchClassName: 'bg-chart-7', borderClassName: 'border-chart-7', fillClassName: 'fill-chart-7' },
  { token: '--color-chart-8', swatchClassName: 'bg-chart-8', borderClassName: 'border-chart-8', fillClassName: 'fill-chart-8' },
  { token: '--color-chart-9', swatchClassName: 'bg-chart-9', borderClassName: 'border-chart-9', fillClassName: 'fill-chart-9' },
  { token: '--color-chart-10', swatchClassName: 'bg-chart-10', borderClassName: 'border-chart-10', fillClassName: 'fill-chart-10' },
  { token: '--color-chart-11', swatchClassName: 'bg-chart-11', borderClassName: 'border-chart-11', fillClassName: 'fill-chart-11' },
  { token: '--color-chart-12', swatchClassName: 'bg-chart-12', borderClassName: 'border-chart-12', fillClassName: 'fill-chart-12' },
  { token: '--color-chart-13', swatchClassName: 'bg-chart-13', borderClassName: 'border-chart-13', fillClassName: 'fill-chart-13' },
  { token: '--color-chart-14', swatchClassName: 'bg-chart-14', borderClassName: 'border-chart-14', fillClassName: 'fill-chart-14' },
];

/** A stable non-negative hash of a string (FNV-1a). */
function hash(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** A colour for any key: the same key always gets the same palette entry. */
export function hashColor(key: string): SeriesColor {
  return PALETTE[hash(key) % PALETTE.length];
}

interface ModelInfo {
  name: string;
  /** For chart labels, where space is short */
  short: string;
  color: SeriesColor;
}

const MODELS: Record<string, ModelInfo> = {
  'anthropic/claude-haiku-5-5': { name: 'Claude Haiku 5.5', short: 'Haiku 5.5', color: HUES.orange },
  'openai/openai-codex/gpt-5.6-luna': { name: 'GPT-5.6 Luna', short: 'GPT-5.6 Luna', color: HUES.teal },
  'none/none': { name: 'No model', short: 'No model', color: HUES.slate },
};

/** "claude-sonnet-5-1" → "Claude Sonnet 5.1", "gpt-5.6-mini" → "GPT-5.6 Mini". */
function guessModelName(id: string): string {
  const last = id.split('/').pop() ?? id;
  const words: string[] = [];
  for (const part of last.split('-')) {
    const previous = words[words.length - 1];
    if (/^\d{1,2}$/.test(part) && previous && /\d$/.test(previous) && !previous.includes('.')) {
      words[words.length - 1] = `${previous}.${part}`;
    } else if (/^gpt/i.test(part)) {
      words.push(part.toUpperCase());
    } else if (/^\d/.test(part) && words[words.length - 1] === 'GPT') {
      words[words.length - 1] = `GPT-${part}`;
    } else {
      words.push(part.charAt(0).toUpperCase() + part.slice(1));
    }
  }
  return words.join(' ');
}

export function modelInfo(id: string): ModelInfo {
  const known = MODELS[id];
  if (known) return known;
  const name = guessModelName(id);
  return { name, short: name, color: hashColor(id) };
}

export const modelName = (id: string): string => modelInfo(id).name;

/** How a variant is drawn in charts: the model's colour, with the agent's symbol and line. */
export type AgentSymbol = 'circle' | 'rect' | 'diamond' | 'triangle' | 'roundRect' | 'pin';
export type AgentLine = 'solid' | 'dashed' | 'dotted';

interface AgentInfo {
  name: string;
  color: SeriesColor;
  symbol: AgentSymbol;
  line: AgentLine;
  /** The variant's name from its model's name */
  variant: (model: string) => string;
}

const AGENTS: Record<string, AgentInfo> = {
  react: {
    name: 'Model + bash',
    color: HUES.sky,
    symbol: 'circle',
    line: 'solid',
    variant: model => `${model} + bash`,
  },
  'inspect_swe/claude_code': {
    name: 'Claude Code',
    color: HUES.pink,
    symbol: 'rect',
    line: 'dashed',
    variant: model => `${model} in Claude Code`,
  },
  'inspect_swe/codex_cli': {
    name: 'Codex',
    color: HUES.lime,
    symbol: 'diamond',
    line: 'dotted',
    variant: model => `${model} in Codex`,
  },
  command: {
    name: 'Program',
    color: HUES.slate,
    symbol: 'triangle',
    line: 'solid',
    variant: () => 'Program',
  },
};

const FALLBACK_SYMBOLS: AgentSymbol[] = ['roundRect', 'pin', 'circle', 'rect', 'diamond', 'triangle'];
const FALLBACK_LINES: AgentLine[] = ['dashed', 'dotted', 'solid'];

export function agentInfo(id: string, fallbackName?: string): AgentInfo {
  const known = AGENTS[id];
  if (known) return known;
  const name = fallbackName || id.split('/').pop() || id;
  const h = hash(id);
  return {
    name,
    color: hashColor(id),
    symbol: FALLBACK_SYMBOLS[h % FALLBACK_SYMBOLS.length],
    line: FALLBACK_LINES[h % FALLBACK_LINES.length],
    variant: model => `${model}, ${name}`,
  };
}

export const agentName = (id: string, fallbackName?: string): string => agentInfo(id, fallbackName).name;

/** A variant is one model run by one agent. */
export interface Variant {
  key: string;
  model: string;
  agent: string;
  /** Full name, as "Claude Haiku 5.5 in Claude Code" */
  name: string;
  /** Chart label, as "Haiku 5.5 in Claude Code" */
  short: string;
  color: SeriesColor;
  symbol: AgentSymbol;
  line: AgentLine;
}

export const variantKey = (run: Pick<Run, 'model' | 'agent'>): string => `${run.model}|${run.agent}`;

export function variantOf(run: Pick<Run, 'model' | 'agent' | 'agent_name'>): Variant {
  const model = modelInfo(run.model);
  const agent = agentInfo(run.agent, run.agent_name);
  return {
    key: variantKey(run),
    model: run.model,
    agent: run.agent,
    name: agent.variant(model.name),
    short: agent.variant(model.short),
    color: model.color,
    symbol: agent.symbol,
    line: agent.line,
  };
}

/** Variants in a stable order: by model name, then agent name. */
export function compareVariants(a: Variant, b: Variant): number {
  return a.name.localeCompare(b.name);
}
