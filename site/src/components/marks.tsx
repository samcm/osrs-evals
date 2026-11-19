/** Identity marks: game sprites, brand logos, and the model, agent, variant and eval labels built on them. */

import { useEffect, useRef, useState } from 'react';
import clsx from 'clsx';
import type { Run } from '@/data/types';
import { BRAND_SLUGS, brandSrc, itemSrc, loadTrimmedSprite } from '@/lib/assets';
import { evalArt } from '@/lib/evals';
import { agentInfo, modelInfo, variantOf, type SeriesColor, type Variant } from '@/lib/series';

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
 * A sprite larger than its box at one device pixel per pixel is centred and cropped.
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
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  const path = src ?? (item != null ? itemSrc(item) : '');
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let live = true;
    setFailed(false);
    const canvas = ref.current;
    if (!canvas || !path) return;
    const box = Math.round(size * (window.devicePixelRatio || 1));
    canvas.width = box;
    canvas.height = box;
    loadTrimmedSprite(path).then(
      sprite => {
        if (!live) return;
        const ctx = canvas.getContext('2d')!;
        const k = Math.max(1, Math.floor(box / Math.max(sprite.width, sprite.height)));
        const w = sprite.width * k;
        const h = sprite.height * k;
        ctx.clearRect(0, 0, box, box);
        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(sprite.image, Math.floor((box - w) / 2), Math.floor((box - h) / 2), w, h);
      },
      () => live && setFailed(true)
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
      title={alt || undefined}
      data-sprite
      data-failed={failed || undefined}
      className={clsx('inline-block shrink-0', SPRITE_SIZES[size], className)}
    />
  );
}

const BRAND_SIZES = { 14: 'size-3.5', 16: 'size-4', 20: 'size-5', 40: 'size-10' } as const;
const LETTER_SIZES = { 14: 'text-2xs', 16: 'text-2xs', 20: 'text-xs', 40: 'text-xl' } as const;

export type BrandSize = keyof typeof BRAND_SIZES;

const KNOWN_BRANDS = new Set<string>(BRAND_SLUGS);

/**
 * A vendor's or harness's logo as a one-colour mask in `foreground`, so it suits both themes.
 * `program` is the scripted baseline's game sprite. An unknown slug gets a muted letter tile.
 */
export function BrandMark({ slug, size = 16, title, className }: { slug: string; size?: BrandSize; title?: string; className?: string }) {
  const a11y = title ? { role: 'img', 'aria-label': title, title } : { 'aria-hidden': true };
  if (slug === 'program') return <Sprite src={brandSrc('program')} size={size} alt={title ?? ''} className={className} />;
  if (!KNOWN_BRANDS.has(slug)) {
    return (
      <span
        {...a11y}
        className={clsx(
          'inline-flex shrink-0 items-center justify-center rounded-xs bg-muted-20 font-semibold text-muted',
          BRAND_SIZES[size],
          LETTER_SIZES[size],
          className
        )}
      >
        {(title ?? slug).charAt(0).toUpperCase()}
      </span>
    );
  }
  const mask = `url(${brandSrc(slug)})`;
  return (
    <span
      {...a11y}
      className={clsx('inline-block shrink-0 bg-foreground', BRAND_SIZES[size], className)}
      style={{
        maskImage: mask,
        WebkitMaskImage: mask,
        maskSize: 'contain',
        WebkitMaskSize: 'contain',
        maskRepeat: 'no-repeat',
        WebkitMaskRepeat: 'no-repeat',
        maskPosition: 'center',
        WebkitMaskPosition: 'center',
      }}
    />
  );
}

/** A series colour as a small square: only where the colour is the key for a chart. */
export function Swatch({ color, className }: { color: SeriesColor; className?: string }) {
  return <span aria-hidden className={clsx('inline-block size-2.5 shrink-0 rounded-2xs', color.swatchClassName, className)} />;
}

interface LabelProps {
  /** Marks only, with the name as accessible name and tooltip */
  compact?: boolean;
  /** Also show the series colour, where it keys a chart */
  swatch?: boolean;
  /** Mark size: 14 in legends and tooltips, 16 inline, 20 in table rows */
  size?: BrandSize;
  className?: string;
}

/** A model: its vendor's mark and its name. */
export function ModelLabel({ model, compact, swatch, size = 16, className }: LabelProps & { model: string }) {
  const info = modelInfo(model);
  return (
    <span className={clsx('inline-flex items-center gap-1.5 whitespace-nowrap', className)} title={compact ? info.name : model}>
      {swatch && <Swatch color={info.color} />}
      <BrandMark slug={info.vendor.slug} size={size} title={compact ? info.name : info.vendor.name} />
      {!compact && <span>{info.name}</span>}
    </span>
  );
}

/** An agent harness: its mark and its name. */
export function AgentLabel({ agent, fallback, compact, size = 16, className }: Omit<LabelProps, 'swatch'> & { agent: string; fallback?: string }) {
  const info = agentInfo(agent, fallback);
  return (
    <span className={clsx('inline-flex items-center gap-1.5 whitespace-nowrap', className)} title={compact ? info.name : agent}>
      <BrandMark slug={info.slug} size={size} title={info.name} />
      {!compact && <span>{info.name}</span>}
    </span>
  );
}

/** A variant (model × agent): model mark and name, then agent mark and name; compact shows the two marks. */
export function VariantLabel({
  run,
  variant,
  compact,
  swatch,
  size = 16,
  className,
}: LabelProps & { run?: Pick<Run, 'model' | 'agent' | 'agent_name'>; variant?: Variant }) {
  const v = variant ?? variantOf(run!);
  const model = modelInfo(v.model);
  const agent = agentInfo(v.agent, run?.agent_name);
  const program = v.vendorSlug === 'program';
  return (
    <span
      className={clsx('inline-flex items-center whitespace-nowrap', compact ? 'gap-1' : 'gap-1.5', className)}
      title={compact ? v.name : undefined}
      role={compact ? 'img' : undefined}
      aria-label={compact ? v.name : undefined}
    >
      {swatch && <Swatch color={v.color} />}
      {!program && <BrandMark slug={v.vendorSlug} size={size} title={compact ? undefined : model.vendor.name} />}
      {!program && !compact && <span>{model.name}</span>}
      <BrandMark slug={v.agentSlug} size={size} title={compact ? undefined : agent.name} className={!program && !compact ? 'ml-1' : undefined} />
      {!compact && <span>{agent.name}</span>}
    </span>
  );
}

/** The eval's sprite. */
export function EvalMark({ evalId, size = 24, title, className }: { evalId: string; size?: SpriteSize; title?: string; className?: string }) {
  const { mark } = evalArt(evalId);
  if (!mark) return <span aria-hidden className={clsx('inline-block shrink-0', SPRITE_SIZES[size], className)} />;
  return <Sprite src={mark.src} size={size} alt={title ?? mark.name} className={className} />;
}
