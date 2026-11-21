/**
 * Identity of every model, vendor and agent: display names, brand marks, and fixed chart styles.
 *
 * Colours: each model has one fixed colour (a data hue token from tokens.css), used everywhere:
 *   Claude Haiku 5.5 orange, Claude Sonnet 5.5 purple, GPT-5.6 Luna teal, no model (Program) slate.
 *   Claude Opus 5.5 rose, Claude Fable 5.2 fuchsia, GPT-6.2 Sol blue, GPT-6.2 Astra green.
 * A model not listed gets a stable hash of its id into the chart palette, skipping the hues taken
 * above, never a colour by position. Agents have no colour: each has a fixed line style and point
 * shape, so a variant (model × agent) is drawn in its model's colour with its agent's line and shape.
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

const hue = (name: string): SeriesColor => ({
  token: `--color-data-${name}`,
  swatchClassName: `bg-data-${name}`,
  borderClassName: `border-data-${name}`,
  fillClassName: `fill-data-${name}`,
});

// Literal class names so Tailwind generates them: bg-data-orange border-data-orange fill-data-orange
// bg-data-purple border-data-purple fill-data-purple bg-data-teal border-data-teal fill-data-teal
// bg-data-slate border-data-slate fill-data-slate bg-data-rose border-data-rose fill-data-rose
// bg-data-blue border-data-blue fill-data-blue bg-data-green border-data-green fill-data-green
// bg-data-fuchsia border-data-fuchsia fill-data-fuchsia
const HUES = {
  rose: hue('rose'),
  blue: hue('blue'),
  green: hue('green'),
  orange: hue('orange'),
  purple: hue('purple'),
  teal: hue('teal'),
  slate: hue('slate'),
  fuchsia: hue('fuchsia'),
};

/** The chart palette (chart-0 to chart-14) minus the fixed model hues, for models not listed. */
const PALETTE: SeriesColor[] = [
  // bg-chart-0 border-chart-0 fill-chart-0 … listed in full so Tailwind generates each class
  { token: '--color-chart-0', swatchClassName: 'bg-chart-0', borderClassName: 'border-chart-0', fillClassName: 'fill-chart-0' },
  { token: '--color-chart-1', swatchClassName: 'bg-chart-1', borderClassName: 'border-chart-1', fillClassName: 'fill-chart-1' },
  { token: '--color-chart-2', swatchClassName: 'bg-chart-2', borderClassName: 'border-chart-2', fillClassName: 'fill-chart-2' },
  { token: '--color-chart-3', swatchClassName: 'bg-chart-3', borderClassName: 'border-chart-3', fillClassName: 'fill-chart-3' },
  { token: '--color-chart-4', swatchClassName: 'bg-chart-4', borderClassName: 'border-chart-4', fillClassName: 'fill-chart-4' },
  { token: '--color-chart-5', swatchClassName: 'bg-chart-5', borderClassName: 'border-chart-5', fillClassName: 'fill-chart-5' },
  { token: '--color-chart-8', swatchClassName: 'bg-chart-8', borderClassName: 'border-chart-8', fillClassName: 'fill-chart-8' },
  { token: '--color-chart-9', swatchClassName: 'bg-chart-9', borderClassName: 'border-chart-9', fillClassName: 'fill-chart-9' },
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

/** A colour for any key (such as an account): the same key always gets the same palette entry. */
export function hashColor(key: string): SeriesColor {
  return PALETTE[hash(key) % PALETTE.length];
}

// Vendors

export interface VendorInfo {
  /** The vendor id used in `vendor=` and by `inScope` */
  id: string;
  name: string;
  /** Brand mark slug under /assets/brands */
  slug: string;
}

const VENDORS: Record<string, VendorInfo> = {
  anthropic: { id: 'anthropic', name: 'Anthropic', slug: 'anthropic' },
  openai: { id: 'openai', name: 'OpenAI', slug: 'openai' },
  google: { id: 'google', name: 'Google', slug: 'google' },
  meta: { id: 'meta', name: 'Meta', slug: 'meta' },
  xai: { id: 'xai', name: 'xAI', slug: 'xai' },
  deepseek: { id: 'deepseek', name: 'DeepSeek', slug: 'deepseek' },
  moonshot: { id: 'moonshot', name: 'Moonshot AI', slug: 'moonshot' },
  qwen: { id: 'qwen', name: 'Qwen', slug: 'qwen' },
  zhipu: { id: 'zhipu', name: 'Zhipu AI', slug: 'zhipu' },
  mistral: { id: 'mistral', name: 'Mistral AI', slug: 'mistral' },
  none: { id: 'none', name: 'No model', slug: 'program' },
};

/** Provider prefixes that name a vendor under another id. */
const VENDOR_ALIASES: Record<string, string> = {
  'meta-llama': 'meta',
  'x-ai': 'xai',
  grok: 'xai',
  moonshotai: 'moonshot',
  kimi: 'moonshot',
  alibaba: 'qwen',
  'z-ai': 'zhipu',
  zai: 'zhipu',
  mistralai: 'mistral',
  gemini: 'google',
  vertex: 'google',
};

/** Model-name patterns, for ids served through a router (openrouter/, bedrock/, together/ …). */
const VENDOR_PATTERNS: [RegExp, string][] = [
  [/claude/i, 'anthropic'],
  [/\bgpt|^o\d|codex/i, 'openai'],
  [/gemini|gemma/i, 'google'],
  [/llama/i, 'meta'],
  [/grok/i, 'xai'],
  [/deepseek/i, 'deepseek'],
  [/kimi|moonshot/i, 'moonshot'],
  [/qwen/i, 'qwen'],
  [/glm/i, 'zhipu'],
  [/mistral|mixtral|codestral|devstral|magistral/i, 'mistral'],
];

/** The vendor of a model id: its provider prefix, or a pattern on its name. */
export function vendorOf(model: string): VendorInfo {
  const parts = model.split('/');
  for (const part of parts.slice(0, -1)) {
    const id = VENDOR_ALIASES[part] ?? part;
    if (VENDORS[id]) return VENDORS[id];
  }
  const name = parts[parts.length - 1] ?? model;
  const match = VENDOR_PATTERNS.find(([re]) => re.test(name));
  if (match) return VENDORS[match[1]];
  const id = parts.length > 1 ? parts[0] : model;
  return { id, name: id.charAt(0).toUpperCase() + id.slice(1), slug: id };
}

// Models

export interface ModelInfo {
  name: string;
  /** For chart labels, where space is short */
  short: string;
  color: SeriesColor;
  vendor: VendorInfo;
}

/** Every model seen so far, by full id. Add a model here when it first appears. */
const MODELS: Record<string, Omit<ModelInfo, 'vendor'>> = {
  'anthropic/claude-haiku-5-5': { name: 'Claude Haiku 5.5', short: 'Haiku 5.5', color: HUES.orange },
  'anthropic/claude-sonnet-5-5': { name: 'Claude Sonnet 5.5', short: 'Sonnet 5.5', color: HUES.purple },
  'openai/openai-codex/gpt-5.6-luna': { name: 'GPT-5.6 Luna', short: 'GPT-5.6 Luna', color: HUES.teal },
  'anthropic/claude-opus-5-5': { name: 'Claude Opus 5.5', short: 'Opus 5.5', color: HUES.rose },
  'openai/openai-codex/gpt-6.2-sol': { name: 'GPT-6.2 Sol', short: 'GPT-6.2 Sol', color: HUES.blue },
  'openai/openai-codex/gpt-6.2-astra': { name: 'GPT-6.2 Astra', short: 'GPT-6.2 Astra', color: HUES.green },
  'anthropic/claude-fable-5-2': { name: 'Claude Fable 5.2', short: 'Fable 5.2', color: HUES.fuchsia },
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
  const vendor = vendorOf(id);
  const known = MODELS[id];
  if (known) return { ...known, vendor };
  const name = guessModelName(id);
  return { name, short: name, color: hashColor(id), vendor };
}

export const modelName = (id: string): string => modelInfo(id).name;

// Agents

/** How an agent's series are drawn: an ECharts symbol and a line dash. */
export type AgentSymbol = 'circle' | 'rect' | 'diamond' | 'triangle' | 'roundRect' | 'pin';
export type AgentLine = 'solid' | 'dashed' | 'dotted';

export interface AgentInfo {
  name: string;
  /** Brand mark slug under /assets/brands (`program` is a game sprite) */
  slug: string;
  symbol: AgentSymbol;
  line: AgentLine;
  /** The variant's name from its model's name */
  variant: (model: string) => string;
}

/** Harnesses by the last segment of the agent id. */
const AGENTS: Record<string, AgentInfo> = {
  bash: { name: 'bash', slug: 'bash', symbol: 'circle', line: 'solid', variant: model => `${model} + bash` },
  claude_code: { name: 'Claude Code', slug: 'claude-code', symbol: 'rect', line: 'dashed', variant: model => `${model} in Claude Code` },
  codex: { name: 'Codex', slug: 'codex', symbol: 'diamond', line: 'dotted', variant: model => `${model} in Codex` },
  opencode: { name: 'OpenCode', slug: 'opencode', symbol: 'roundRect', line: 'dashed', variant: model => `${model} in OpenCode` },
  omp: { name: 'omp', slug: 'omp', symbol: 'triangle', line: 'solid', variant: model => `${model} in omp` },
  amp: { name: 'Amp', slug: 'amp', symbol: 'pin', line: 'dotted', variant: model => `${model} in Amp` },
  program: { name: 'Program', slug: 'program', symbol: 'triangle', line: 'solid', variant: () => 'Program' },
};

const AGENT_ALIASES: Record<string, string> = { react: 'bash', codex_cli: 'codex', command: 'program' };

const FALLBACK_SYMBOLS: AgentSymbol[] = ['roundRect', 'pin', 'circle', 'rect', 'diamond', 'triangle'];
const FALLBACK_LINES: AgentLine[] = ['dashed', 'dotted', 'solid'];

/** An agent id ("react", "inspect_swe/claude_code", "harness/__init__.py@omp" …) to its harness. */
export function agentInfo(id: string, fallbackName?: string): AgentInfo {
  const last = (id.split('/').pop() ?? id).split('@').pop() ?? id;
  const known = AGENTS[AGENT_ALIASES[last] ?? last];
  if (known) return known;
  const name = fallbackName || last;
  const h = hash(id);
  return {
    name,
    slug: last.replace(/_/g, '-'),
    symbol: FALLBACK_SYMBOLS[h % FALLBACK_SYMBOLS.length],
    line: FALLBACK_LINES[h % FALLBACK_LINES.length],
    variant: model => `${model}, ${name}`,
  };
}

export const agentName = (id: string, fallbackName?: string): string => agentInfo(id, fallbackName).name;

// Thinking levels

/**
 * Thinking levels, lowest first: omp's `thinking`, Inspect's reasoning_effort and Claude Code's
 * effort. `default` is a run that set none, so its harness and model decided.
 */
export const THINKING_LEVELS = ['default', 'off', 'none', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max'] as const;

/** A run's thinking level as the site names it: its level, or `default`. */
export const thinkingOf = (run: Pick<Run, 'thinking'>): string => run.thinking ?? 'default';

/** Order of thinking levels: the known ones lowest first, unknown ones after them by name. */
export function compareThinking(a: string, b: string): number {
  const ia = THINKING_LEVELS.indexOf(a as (typeof THINKING_LEVELS)[number]);
  const ib = THINKING_LEVELS.indexOf(b as (typeof THINKING_LEVELS)[number]);
  return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib) || a.localeCompare(b);
}

/** What a level means, for tooltips. */
export const thinkingTitle = (level: string): string => (level === 'default' ? "Thinking: the harness's default" : `Thinking: ${level}`);

// Variants

/** A variant is one model at one thinking level run by one agent harness. */
export interface Variant {
  key: string;
  model: string;
  agent: string;
  /** The thinking level, `default` when the run set none */
  thinking: string;
  /** Full name, as "Claude Haiku 5.5 in Claude Code, high thinking" */
  name: string;
  /** Chart label, as "Haiku 5.5 in Claude Code, high" */
  short: string;
  color: SeriesColor;
  symbol: AgentSymbol;
  line: AgentLine;
  /** Mark slugs: the model's vendor and the agent's harness */
  vendorSlug: string;
  agentSlug: string;
}

export const variantKey = (run: Pick<Run, 'model' | 'agent' | 'thinking'>): string => `${run.model}|${thinkingOf(run)}|${run.agent}`;

export function variantOf(run: Pick<Run, 'model' | 'agent' | 'agent_name' | 'thinking'>): Variant {
  const model = modelInfo(run.model);
  const agent = agentInfo(run.agent, run.agent_name);
  const thinking = thinkingOf(run);
  return {
    key: variantKey(run),
    model: run.model,
    agent: run.agent,
    thinking,
    name: `${agent.variant(model.name)}, ${thinking} thinking`,
    short: `${agent.variant(model.short)}, ${thinking}`,
    color: model.color,
    symbol: agent.symbol,
    line: agent.line,
    vendorSlug: model.vendor.slug,
    agentSlug: agent.slug,
  };
}

/** Variants in a stable order: by model, harness, then thinking level. */
export function compareVariants(a: Variant, b: Variant): number {
  return modelName(a.model).localeCompare(modelName(b.model)) || a.agent.localeCompare(b.agent) || compareThinking(a.thinking, b.thinking);
}

/** A model as it appears in a URL: its name without the provider route (openai/openai-codex/gpt-6.2-sol → gpt-6.2-sol). */
export const modelSlug = (model: string): string => model.split('/').pop() ?? model;
