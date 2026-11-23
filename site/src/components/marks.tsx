/**
 * Identity marks: game sprites, vendor logos, and the model, agent, variant and eval labels built on
 * them. Models carry their vendor's mark; harnesses are their own mark after the model, quieter (in
 * the muted colour); a thinking level is a brain and its word; the scripted baseline is its sprite
 * and "Program". Marks and sprites sit on the text's middle in inline text and centre in flex rows;
 * labels shrink by truncating the name, never a mark or the level.
 *
 * Mark sizes beside text: 14 with text-xs (legends, tooltips), 16 with text-sm (inline, nav,
 * tables), 20 with text-base or larger (an H1's label), 40 for a page header's mark.
 *
 *   <VariantLabel run={run} />            Anthropic mark, "Claude Haiku 5.5", brain "high", omp mark
 *   <VariantLabel variant={v} compact />  Anthropic mark, "Haiku 5.5", brain "high", omp mark
 *   <ModelLabel model={id} />             in table rows and inline (16)
 */

import { useEffect, useRef, useState, type JSX } from 'react';
import clsx from 'clsx';
import { Tip } from './bits';
import type { Run } from '@/data/types';
import { brandSrc, itemSrc, loadTrimmedSprite } from '@/lib/assets';
import { evalArt } from '@/lib/evals';
import {
  agentInfo,
  levelName,
  modelInfo,
  thinkingTitle,
  variantOf,
  type SeriesColor,
  type Variant,
} from '@/lib/series';

const SPRITE_SIZES = {
  14: 'size-3.5',
  16: 'size-4',
  20: 'size-5',
  24: 'size-6',
  32: 'size-8',
  40: 'size-10',
  48: 'size-12',
  64: 'size-16',
} as const;

export type SpriteSize = keyof typeof SPRITE_SIZES;

/**
 * A game sprite in a square box: cropped to its opaque pixels, then drawn at the largest whole
 * number of device pixels per sprite pixel that fits (never smoothed, never a fractional scale).
 * A sprite larger than its box at one device pixel per pixel (a 16px mark on a 1x screen) shrinks
 * by a whole factor, averaged, rather than losing its edges.
 */
export function Sprite({
  src,
  item,
  size,
  alt,
  className,
}: {
  /** Any sprite path; or `item` for /assets/items/<id>.png */
  src?: string;
  item?: string | number;
  size: SpriteSize;
  /** Accessible name and tooltip; empty for a decorative sprite */
  alt: string;
  className?: string;
}): JSX.Element {
  const ref = useRef<HTMLCanvasElement>(null);
  const path = src ?? (item != null ? itemSrc(item) : '');
  // The path that failed to load, so a new path starts out unfailed
  const [failedPath, setFailedPath] = useState<string>();
  const failed = failedPath != null && failedPath === path;

  useEffect(() => {
    let live = true;
    const canvas = ref.current;
    if (!canvas || !path) return;
    const box = Math.round(size * (window.devicePixelRatio || 1));
    canvas.width = box;
    canvas.height = box;
    loadTrimmedSprite(path).then(
      sprite => {
        if (!live) return;
        const ctx = canvas.getContext('2d')!;
        const side = Math.max(sprite.width, sprite.height);
        // Whole device pixels per sprite pixel; a sprite too big for its box (a 16px mark on a 1x
        // screen) shrinks by a whole factor instead, averaged so its outline survives
        const k = side <= box ? Math.floor(box / side) : 1 / Math.ceil(side / box);
        const w = Math.round(sprite.width * k);
        const h = Math.round(sprite.height * k);
        ctx.clearRect(0, 0, box, box);
        ctx.imageSmoothingEnabled = k < 1;
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(sprite.image, Math.floor((box - w) / 2), Math.floor((box - h) / 2), w, h);
      },
      () => live && setFailedPath(path)
    );
    return () => {
      live = false;
    };
  }, [path, size]);

  return (
    <canvas
      ref={ref}
      role={alt ? 'img' : undefined}
      aria-label={alt || undefined}
      aria-hidden={alt ? undefined : true}
      data-sprite
      data-failed={failed || undefined}
      className={clsx('inline-block shrink-0 align-middle', SPRITE_SIZES[size], className)}
    />
  );
}

const BRAND_SIZES = { 14: 'size-3.5', 16: 'size-4', 20: 'size-5', 40: 'size-10' } as const;
const LETTER_SIZES = { 14: 'text-xs', 16: 'text-xs', 20: 'text-xs', 40: 'text-xl' } as const;

export type BrandSize = keyof typeof BRAND_SIZES;

/**
 * A vendor's or harness's logo as a one-colour mask in `foreground`, so it suits both themes.
 * A harness's mark is the site's; a maker's or provider's is the logo the data saved from models.dev.
 * `program` is the scripted baseline's game sprite. One without a logo gets a muted letter tile.
 */
export function BrandMark({
  slug,
  size = 16,
  title,
  tone = 'foreground',
  className,
}: {
  slug: string;
  size?: BrandSize;
  title?: string;
  /** The mark's colour: the text colour, or muted where it should not lead */
  tone?: 'foreground' | 'muted';
  className?: string;
}): JSX.Element {
  // Its name for screen readers; a hover name is the caller's Tip where the mark stands alone
  const a11y = title ? { role: 'img', 'aria-label': title } : { 'aria-hidden': true };
  if (slug === 'program')
    return <Sprite src={brandSrc('program')!} size={size} alt={title ?? ''} className={className} />;
  const src = brandSrc(slug);
  if (!src) {
    return (
      <span
        {...a11y}
        className={clsx(
          'inline-flex shrink-0 items-center justify-center rounded-xs bg-muted-10 align-middle font-semibold text-muted',
          BRAND_SIZES[size],
          LETTER_SIZES[size],
          className
        )}
      >
        {(title ?? slug).charAt(0).toUpperCase()}
      </span>
    );
  }
  const mask = `url(${src})`;
  return (
    <span
      {...a11y}
      className={clsx(
        'inline-block shrink-0 mask-contain mask-center mask-no-repeat align-middle',
        tone === 'muted' ? 'bg-muted' : 'bg-foreground',
        BRAND_SIZES[size],
        className
      )}
      style={{ maskImage: mask, WebkitMaskImage: mask }}
    />
  );
}

/** A series colour as a small square: only where the colour is the key for a chart. */
export function Swatch({ color, className }: { color: SeriesColor; className?: string }): JSX.Element {
  return (
    <span
      aria-hidden
      className={clsx('inline-block size-2.5 shrink-0 rounded-2xs', color.swatchClassName, className)}
    />
  );
}

interface LabelProps {
  /** Short: the model's short name ("Haiku 5.5"), the full name as tooltip */
  compact?: boolean;
  /** Also show the series colour, where it keys a chart */
  swatch?: boolean;
  /** Mark size: 14 in legends and tooltips, 16 inline, 20 in table rows */
  size?: BrandSize;
  className?: string;
}

const isProgram = (agent: string, fallback?: string): boolean => agentInfo(agent, fallback).slug === 'program';

/** The scripted baseline: its game sprite and "Program". */
function ProgramLabel({
  size,
  swatch,
  color,
  className,
}: {
  size: BrandSize;
  swatch?: boolean;
  color?: SeriesColor;
  className?: string;
}): JSX.Element {
  return (
    <span className={clsx('inline-flex items-center gap-1.5 whitespace-nowrap', className)}>
      {swatch && color && <Swatch color={color} />}
      <BrandMark slug="program" size={size} />
      <span>Program</span>
    </span>
  );
}

/** An agent harness as its mark, in the muted colour so the model's vendor mark leads; its name on hover. */
export function HarnessMark({
  agent,
  fallback,
  size = 14,
  className,
}: {
  agent: string;
  fallback?: string;
  size?: BrandSize;
  className?: string;
}): JSX.Element {
  const info = agentInfo(agent, fallback);
  return (
    <Tip content={info.name}>
      <BrandMark slug={info.slug} size={size} title={info.name} tone="muted" className={className} />
    </Tip>
  );
}

/** A thinking level: its word, muted, after the model it belongs to ("GPT-6.2 Astra high"). */
export function ThinkingLevel({ level, className }: { level: string; className?: string }): JSX.Element {
  return (
    <Tip content={thinkingTitle(level)}>
      <span className={clsx('shrink-0 font-normal text-muted', className)}>{levelName(level)}</span>
    </Tip>
  );
}

/** A model: its vendor's mark and its name (compact: the short name). */
export function ModelLabel({
  model,
  compact,
  swatch,
  size = 16,
  className,
}: LabelProps & { model: string }): JSX.Element {
  const info = modelInfo(model);
  if (info.vendor.slug === 'program')
    return <ProgramLabel size={size} swatch={swatch} color={info.color} className={className} />;
  return (
    <Tip content={compact ? info.name : undefined}>
      <span className={clsx('inline-flex min-w-0 items-center gap-1.5 whitespace-nowrap', className)}>
        {swatch && <Swatch color={info.color} />}
        <BrandMark slug={info.vendor.slug} size={size} title={info.vendor.name} />
        <span className="truncate">{compact ? info.short : info.name}</span>
      </span>
    </Tip>
  );
}

/** An agent harness on its own: its mark and its name; the scripted baseline shows its sprite and "Program". */
export function AgentLabel({
  agent,
  fallback,
  size = 16,
  className,
}: Omit<LabelProps, 'swatch' | 'compact'> & { agent: string; fallback?: string; compact?: boolean }): JSX.Element {
  if (isProgram(agent, fallback)) return <ProgramLabel size={size} className={className} />;
  return (
    <span className={clsx('inline-flex min-w-0 items-center gap-1.5 whitespace-nowrap', className)}>
      <BrandMark slug={agentInfo(agent, fallback).slug} size={size} />
      <span className="truncate">{agentInfo(agent, fallback).name}</span>
    </span>
  );
}

/**
 * A variant (model × thinking level × harness): the model's vendor mark and name, then its thinking
 * level as a muted word. No harness mark (Sam: useless next to a name; every run so far is one
 * harness): the harness shows where it's the subject (filters, the model page, a run's facts). Compact uses the model's short name. The scripted baseline is
 * its sprite and "Program".
 */
export function VariantLabel({
  run,
  variant,
  compact,
  swatch,
  size = 16,
  className,
}: LabelProps & { run?: Pick<Run, 'model' | 'agent' | 'agent_name' | 'thinking'>; variant?: Variant }): JSX.Element {
  const v = variant ?? variantOf(run!);
  const model = modelInfo(v.model);
  if (isProgram(v.agent, run?.agent_name))
    return <ProgramLabel size={size} swatch={swatch} color={v.color} className={className} />;
  return (
    <span className={clsx('inline-flex min-w-0 items-center gap-1.5 whitespace-nowrap', className)}>
      {swatch && <Swatch color={v.color} />}
      <BrandMark slug={model.vendor.slug} size={size} title={model.vendor.name} />
      <span className="truncate">{compact ? model.short : model.name}</span>
      <ThinkingLevel level={v.thinking} />
    </span>
  );
}

/** The eval's sprite. */
export function EvalMark({
  evalId,
  size = 24,
  title,
  className,
}: {
  evalId: string;
  size?: SpriteSize;
  title?: string;
  className?: string;
}): JSX.Element {
  const { mark } = evalArt(evalId);
  if (!mark)
    return <span aria-hidden className={clsx('inline-block shrink-0 align-middle', SPRITE_SIZES[size], className)} />;
  return <Sprite src={mark.src} size={size} alt={title ?? mark.name} className={className} />;
}
