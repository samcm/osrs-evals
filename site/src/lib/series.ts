/**
 * Identity of every model, vendor and agent: display names, brand marks, and fixed chart styles.
 * Models' names and makers come from the data (models.dev, through export.py); colours are ours.
 *
 * Colours: each model has one fixed colour (MODEL_COLORS: a --color-model-* token from theme.css,
 * a hue arc per model line), used everywhere; no model (Program) is slate. A model not listed gets a
 * stable hash of its id into the chart palette, never a colour by position. Agents have no colour: each has a fixed line style and point
 * shape. A thinking level is a lightness step of its model's colour (`levelColor`), light for off and
 * dark for max. So a variant (model
 * × thinking level × agent) is drawn in its model's hue, at its level's lightness, with its agent's
 * line and shape.
 */

import type { ModelFacts, ProviderInfo, Run } from '@/data/types';

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
  {
    token: '--color-chart-0',
    swatchClassName: 'bg-chart-0',
    borderClassName: 'border-chart-0',
    fillClassName: 'fill-chart-0',
  },
  {
    token: '--color-chart-1',
    swatchClassName: 'bg-chart-1',
    borderClassName: 'border-chart-1',
    fillClassName: 'fill-chart-1',
  },
  {
    token: '--color-chart-2',
    swatchClassName: 'bg-chart-2',
    borderClassName: 'border-chart-2',
    fillClassName: 'fill-chart-2',
  },
  {
    token: '--color-chart-3',
    swatchClassName: 'bg-chart-3',
    borderClassName: 'border-chart-3',
    fillClassName: 'fill-chart-3',
  },
  {
    token: '--color-chart-4',
    swatchClassName: 'bg-chart-4',
    borderClassName: 'border-chart-4',
    fillClassName: 'fill-chart-4',
  },
  {
    token: '--color-chart-5',
    swatchClassName: 'bg-chart-5',
    borderClassName: 'border-chart-5',
    fillClassName: 'fill-chart-5',
  },
  {
    token: '--color-chart-8',
    swatchClassName: 'bg-chart-8',
    borderClassName: 'border-chart-8',
    fillClassName: 'fill-chart-8',
  },
  {
    token: '--color-chart-9',
    swatchClassName: 'bg-chart-9',
    borderClassName: 'border-chart-9',
    fillClassName: 'fill-chart-9',
  },
  {
    token: '--color-chart-11',
    swatchClassName: 'bg-chart-11',
    borderClassName: 'border-chart-11',
    fillClassName: 'fill-chart-11',
  },
  {
    token: '--color-chart-12',
    swatchClassName: 'bg-chart-12',
    borderClassName: 'border-chart-12',
    fillClassName: 'fill-chart-12',
  },
  {
    token: '--color-chart-13',
    swatchClassName: 'bg-chart-13',
    borderClassName: 'border-chart-13',
    fillClassName: 'fill-chart-13',
  },
  {
    token: '--color-chart-14',
    swatchClassName: 'bg-chart-14',
    borderClassName: 'border-chart-14',
    fillClassName: 'fill-chart-14',
  },
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

// Vendors and models: from the data (index.json `models` and `providers`, from models.dev)

/**
 * What the data says of each model and provider (export.py model_facts, fetch_logos): a model's
 * maker, display name and facts, also for a model a router served (openai/opencode-go/beam-free is
 * Reflection's Beam 1.0), and each maker's and inference provider's name and logo. Filled once the
 * index loads (data/queries.ts), before anything names a model.
 */
const FACTS = new Map<string, ModelFacts>();
const PROVIDERS = new Map<string, ProviderInfo>();

export function registerModels(models: Record<string, ModelFacts>, providers: Record<string, ProviderInfo>): void {
  for (const [id, facts] of Object.entries(models)) FACTS.set(id, facts);
  for (const [id, info] of Object.entries(providers)) PROVIDERS.set(id, info);
}

/** A model's facts from the data, when it has them. */
export const modelFacts = (model: string): ModelFacts | undefined => FACTS.get(model);

/** A maker's or inference provider's name and logo, by its models.dev id. */
export function providerInfo(id: string): ProviderInfo {
  return PROVIDERS.get(id) ?? { name: id.charAt(0).toUpperCase() + id.slice(1), logo: null };
}

/** A logo the data saved for a maker or inference provider (/data/logos/<id>.svg); null when it has none. */
export const providerLogo = (id: string): string | null => PROVIDERS.get(id)?.logo ?? null;

export interface VendorInfo {
  /** The vendor id used in `vendor=` and by `inScope`: the maker's models.dev id */
  id: string;
  name: string;
  /** Its mark for BrandMark: the maker's id (its logo from the data) */
  slug: string;
}

/**
 * The maker of a model id, as the data names it; else its provider prefix. The scripted baseline
 * ("none") has no model.
 */
export function vendorOf(model: string): VendorInfo {
  const parts = model.split('/');
  if (parts[0] === 'none') return { id: 'none', name: 'No model', slug: 'program' };
  const facts = FACTS.get(model);
  const id = facts ? (facts.maker ?? 'unknown') : parts[0];
  return { id, name: facts && !facts.maker ? 'Maker not named' : providerInfo(id).name, slug: id };
}

// Models

export interface ModelInfo {
  name: string;
  /** For chart labels, where space is short */
  short: string;
  color: SeriesColor;
  vendor: VendorInfo;
}

const modelHue = (name: string): SeriesColor => ({
  token: `--color-model-${name}`,
  swatchClassName: `bg-model-${name}`,
  borderClassName: `border-model-${name}`,
  fillClassName: `fill-model-${name}`,
});

// Literal class names so Tailwind generates them:
// bg-model-claude-opus-4-5 border-model-claude-opus-4-5 fill-model-claude-opus-4-5
// bg-model-claude-opus-4-6 border-model-claude-opus-4-6 fill-model-claude-opus-4-6
// bg-model-claude-opus-4-7 border-model-claude-opus-4-7 fill-model-claude-opus-4-7
// bg-model-claude-opus-4-8 border-model-claude-opus-4-8 fill-model-claude-opus-4-8
// bg-model-claude-opus-5 border-model-claude-opus-5 fill-model-claude-opus-5
// bg-model-claude-opus-5-5 border-model-claude-opus-5-5 fill-model-claude-opus-5-5
// bg-model-claude-haiku-4-5 border-model-claude-haiku-4-5 fill-model-claude-haiku-4-5
// bg-model-claude-haiku-5-5 border-model-claude-haiku-5-5 fill-model-claude-haiku-5-5
// bg-model-gpt-5-6-terra border-model-gpt-5-6-terra fill-model-gpt-5-6-terra bg-model-gpt-6-1-terra
// border-model-gpt-6-1-terra fill-model-gpt-6-1-terra bg-model-gpt-5-6-luna
// border-model-gpt-5-6-luna fill-model-gpt-5-6-luna bg-model-gpt-6-luna border-model-gpt-6-luna
// fill-model-gpt-6-luna bg-model-gpt-5-6-sol border-model-gpt-5-6-sol fill-model-gpt-5-6-sol
// bg-model-gpt-6-sol border-model-gpt-6-sol fill-model-gpt-6-sol bg-model-gpt-6-1-sol
// border-model-gpt-6-1-sol fill-model-gpt-6-1-sol bg-model-gpt-6-2-sol border-model-gpt-6-2-sol
// fill-model-gpt-6-2-sol bg-model-claude-sonnet-4-5 border-model-claude-sonnet-4-5
// fill-model-claude-sonnet-4-5 bg-model-claude-sonnet-4-6 border-model-claude-sonnet-4-6
// fill-model-claude-sonnet-4-6 bg-model-claude-sonnet-5 border-model-claude-sonnet-5
// fill-model-claude-sonnet-5 bg-model-claude-sonnet-5-5 border-model-claude-sonnet-5-5
// fill-model-claude-sonnet-5-5

/**
 * Each model's one fixed colour, by its name without the route that served it: the one thing about
 * a model models.dev can't say. The big run's models take a hue arc per model line, stepped by
 * lightness and chroma so the ones that race together stay far apart (styles/theme.css). A model not
 * listed gets a colour from a hash of its id.
 */
const MODEL_COLORS: Record<string, SeriesColor> = {
  'claude-opus-4-5': modelHue('claude-opus-4-5'),
  'claude-opus-4-6': modelHue('claude-opus-4-6'),
  'claude-opus-4-7': modelHue('claude-opus-4-7'),
  'claude-opus-4-8': modelHue('claude-opus-4-8'),
  'claude-opus-5': modelHue('claude-opus-5'),
  'claude-opus-5-5': modelHue('claude-opus-5-5'),
  'claude-haiku-4-5': modelHue('claude-haiku-4-5'),
  'claude-haiku-5-5': modelHue('claude-haiku-5-5'),
  'gpt-5.6-terra': modelHue('gpt-5-6-terra'),
  'gpt-6.1-terra': modelHue('gpt-6-1-terra'),
  'gpt-5.6-luna': modelHue('gpt-5-6-luna'),
  'gpt-6-luna': modelHue('gpt-6-luna'),
  'gpt-5.6-sol': modelHue('gpt-5-6-sol'),
  'gpt-6-sol': modelHue('gpt-6-sol'),
  'gpt-6.1-sol': modelHue('gpt-6-1-sol'),
  'gpt-6.2-sol': modelHue('gpt-6-2-sol'),
  'claude-sonnet-4-5': modelHue('claude-sonnet-4-5'),
  'claude-sonnet-4-6': modelHue('claude-sonnet-4-6'),
  'claude-sonnet-5': modelHue('claude-sonnet-5'),
  'claude-sonnet-5-5': modelHue('claude-sonnet-5-5'),
  'gpt-6.2-astra': HUES.green,
  'claude-fable-5-2': HUES.fuchsia,
};

/** A name for a model the data has no facts for: "claude-sonnet-5-1" → "Claude Sonnet 5.1". */
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

/**
 * A name for where space is short: without the product word its family leads with when the family
 * names a line within it ("Claude Haiku 5.5", family claude-haiku → "Haiku 5.5"); else the name.
 */
function shortName(name: string, family: string | null | undefined): string {
  const [product, line] = (family ?? '').split('-');
  const words = name.split(' ');
  return line && words.length > 2 && words[0].toLowerCase() === product ? words.slice(1).join(' ') : name;
}

/** A model's name (models.dev's display name), colour and maker. */
export function modelInfo(id: string): ModelInfo {
  const facts = FACTS.get(id);
  // Data exported before the export dropped alias markers names an alias "Claude Haiku 4.5 (latest)"
  const name = id === 'none/none' ? 'No model' : (facts?.name.replace(/\s+\(latest\)$/i, '') ?? guessModelName(id));
  return {
    name,
    short: shortName(name, facts?.family),
    color: (id === 'none/none' ? HUES.slate : MODEL_COLORS[id.split('/').pop() ?? id]) ?? hashColor(id),
    vendor: vendorOf(id),
  };
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
  opencode: {
    name: 'OpenCode',
    slug: 'opencode',
    symbol: 'roundRect',
    line: 'dashed',
    variant: model => `${model} in OpenCode`,
  },
  omp: { name: 'omp', slug: 'omp', symbol: 'triangle', line: 'solid', variant: model => `${model} in omp` },
  amp: { name: 'Amp', slug: 'amp', symbol: 'pin', line: 'dotted', variant: model => `${model} in Amp` },
  program: { name: 'Program', slug: 'program', symbol: 'triangle', line: 'solid', variant: () => 'Program' },
};

const AGENT_ALIASES: Record<string, string> = { command: 'program' };

const FALLBACK_SYMBOLS: AgentSymbol[] = ['roundRect', 'pin', 'circle', 'rect', 'diamond', 'triangle'];
const FALLBACK_LINES: AgentLine[] = ['dashed', 'dotted', 'solid'];

/** An agent id ("evals/omp.py@omp" …) to its harness. */
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
 * Each level's step from its model's colour, as a share mixed in of white (positive) or black
 * (negative): light for off, dark for max; `none` (a model with no levels) keeps the model's own colour.
 */
const LEVEL_MIX: Record<string, number> = { off: 44, minimal: 28, low: 18, medium: 8, high: -8, xhigh: -20, max: -32 };

const levelRules = new Set<string>();
let levelSheet: CSSStyleSheet | null = null;

/**
 * A model's colour at a thinking level: a token and swatch, line and fill classes like the model's
 * own (`--color-data-orange-high`, `bg-data-orange-high` …), mixed in oklab from its colour. Tailwind
 * cannot know these names ahead of time, so the rules are added to one stylesheet the first time a
 * level of a colour is used; everything that reads a SeriesColor works on them unchanged.
 */
export function levelColor(base: SeriesColor, level: string): SeriesColor {
  const mix = LEVEL_MIX[level];
  if (!mix) return base;
  const name = `${base.token.replace(/^--color-/, '')}-${level}`;
  const color: SeriesColor = {
    token: `--color-${name}`,
    swatchClassName: `bg-${name}`,
    borderClassName: `border-${name}`,
    fillClassName: `fill-${name}`,
  };
  if (typeof document !== 'undefined' && !levelRules.has(name)) {
    levelRules.add(name);
    if (!levelSheet) {
      const style = document.createElement('style');
      style.dataset.thinkingLevels = '';
      document.head.appendChild(style);
      levelSheet = style.sheet;
    }
    const value = `color-mix(in oklab, var(${base.token}), ${mix > 0 ? 'white' : 'black'} ${Math.abs(mix)}%)`;
    for (const rule of [
      `:root { ${color.token}: ${value}; }`,
      `.${color.swatchClassName} { background-color: var(${color.token}); }`,
      `.${color.borderClassName} { border-color: var(${color.token}); }`,
      `.${color.fillClassName} { fill: var(${color.token}); }`,
    ])
      levelSheet?.insertRule(rule, levelSheet.cssRules.length);
  }
  return color;
}

/**
 * Thinking levels, lowest first: the `thinking` every run's omp solver pins, and `none` (a model
 * with no thinking levels, which is not off). There is no "default".
 */
export const THINKING_LEVELS = ['none', 'off', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max'] as const;

/** A level as words: "no thinking levels", "high". */
export const levelName = (level: string): string => (level === 'none' ? 'no thinking levels' : level);

/** Order of thinking levels: the known ones lowest first, unknown ones after them by name. */
export function compareThinking(a: string, b: string): number {
  const ia = THINKING_LEVELS.indexOf(a as (typeof THINKING_LEVELS)[number]);
  const ib = THINKING_LEVELS.indexOf(b as (typeof THINKING_LEVELS)[number]);
  return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib) || a.localeCompare(b);
}

/** What a level means, for tooltips. */
export const thinkingTitle = (level: string): string =>
  level === 'none' ? 'A model with no thinking levels' : `Thinking: ${levelName(level)}`;

// Variants

/** A variant is one model at one thinking level run by one agent harness. */
export interface Variant {
  key: string;
  model: string;
  agent: string;
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

export const variantKey = (run: Pick<Run, 'model' | 'agent' | 'thinking'>): string =>
  `${run.model}|${run.thinking}|${run.agent}`;

export function variantOf(run: Pick<Run, 'model' | 'agent' | 'agent_name' | 'thinking'>): Variant {
  const model = modelInfo(run.model);
  const agent = agentInfo(run.agent, run.agent_name);
  const thinking = run.thinking;
  return {
    key: variantKey(run),
    model: run.model,
    agent: run.agent,
    thinking,
    name: `${agent.variant(model.name)}, ${thinking === 'none' ? 'no thinking levels' : `thinking ${thinking}`}`,
    short: `${agent.variant(model.short)}, ${levelName(thinking)}`,
    color: levelColor(model.color, thinking),
    symbol: agent.symbol,
    line: agent.line,
    vendorSlug: model.vendor.slug,
    agentSlug: agent.slug,
  };
}

/** Variants in a stable order: by model, harness, then thinking level. */
export function compareVariants(a: Variant, b: Variant): number {
  return (
    modelName(a.model).localeCompare(modelName(b.model)) ||
    a.agent.localeCompare(b.agent) ||
    compareThinking(a.thinking, b.thinking)
  );
}

/**
 * A model as it appears in a URL: its name without the provider route, dots as hyphens
 * (openai/openai-codex/gpt-6.2-sol → gpt-6-2-sol). Slugs compare after the same treatment, so a
 * link with the dots still finds it.
 */
export const modelSlug = (model: string): string => (model.split('/').pop() ?? model).replace(/\./g, '-');
