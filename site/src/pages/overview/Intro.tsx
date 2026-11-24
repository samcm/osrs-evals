/**
 * The home page's intro: what the project does and how, in a few plain sentences beside the world
 * map, where every run starts and Dragon Slayer ends marked on it, then the counts (from the data;
 * nothing here is a number typed in) and the evals' sprites, each opening its eval.
 */

import { useMemo, type JSX, type ReactNode } from 'react';
import { Link } from '@tanstack/react-router';
import { useSuspenseQuery } from '@tanstack/react-query';
import { ArrowUpRightIcon } from '@heroicons/react/16/solid';
import { Tip, linkClassName } from '@/components/bits';
import { buttonClassName } from '@/components/Elements/Button';
import { Card } from '@/components/Layout/Card';
import { EvalMark } from '@/components/marks';
import type { Eval } from '@/data/types';
import { indexQuery } from '@/data/queries';
import { evalSlug } from '@/lib/evals';
import { formatDuration, formatInt } from '@/lib/format';
import { MAP_IMAGE, MAP_IMAGE_2X, mapMetaQuery, type MapMeta } from '@/lib/map';
import { useHeight, useWidth } from '@/lib/useWidth';

const README = 'https://github.com/samcm/osrs-evals';

const LEAD = 'AI models play RuneScape as it was in 2004.';
const HOW =
  'Each model runs in the omp coding agent at a set thinking level, with a shell, a TypeScript SDK that controls its game characters, and a goal. It writes and runs its own scripts. Nothing tells it how to play.';
const SCORE =
  'Each eval is a goal and a score read from the game server’s own saves. Every run is recorded tick by tick and can be replayed: the game, the map and every call the agent made.';

function Credit(): JSX.Element {
  return (
    <p className="text-xs text-pretty text-muted">
      Built on{' '}
      <a className={linkClassName} href="https://inspect.aisi.org.uk/" target="_blank" rel="noreferrer">
        Inspect AI
      </a>{' '}
      and Max Bittker’s{' '}
      <a className={linkClassName} href="https://github.com/MaxBittker/rs-sdk" target="_blank" rel="noreferrer">
        rs-sdk
      </a>
      , a 2004scape server with faster XP, unlimited run energy and no random events.
    </p>
  );
}

function ReadmeLink(): JSX.Element {
  return (
    <a
      href={README}
      target="_blank"
      rel="noreferrer"
      className={buttonClassName({ variant: 'secondary', size: 'sm', className: 'shrink-0 whitespace-nowrap' })}
    >
      README
      <ArrowUpRightIcon aria-hidden className="size-4 text-muted" />
    </a>
  );
}

interface Facts {
  /** Every eval with runs, the most runs first */
  evals: Eval[];
  runs: number;
  models: number;
}

function useFacts(): Facts {
  const { data } = useSuspenseQuery(indexQuery);
  return useMemo(() => {
    const count = (id: string): number => data.runs.filter(r => r.eval === id).length;
    const evals = data.evals.filter(e => count(e.id) > 0).sort((a, b) => count(b.id) - count(a.id));
    return {
      evals,
      runs: data.runs.length,
      models: new Set(data.runs.map(r => r.model)).size,
    };
  }, [data]);
}

/** The eval's goal, as the agents got it, and its budget: what its sprite says on hover. */
function goalTip(e: Eval): ReactNode {
  return (
    <span className="flex flex-col gap-0.5">
      <span className="font-medium">{e.title}</span>
      <span>{e.goal}</span>
      <span className="text-muted">{formatDuration((e.budget_ticks * e.tick_ms) / 1000)} of game time</span>
    </span>
  );
}

/** Each eval's sprite, opening the eval. */
function EvalStrip({ evals }: { evals: Eval[] }): JSX.Element {
  return (
    <span className="flex flex-wrap items-center gap-1">
      {evals.map(e => (
        <Tip key={e.id} content={goalTip(e)}>
          <Link
            to="/evals/$evalId"
            params={{ evalId: evalSlug(e.id) }}
            search={{} as never}
            aria-label={e.title}
            className={buttonClassName({ variant: 'soft', size: 'xs', iconOnly: true })}
          >
            <EvalMark evalId={e.id} size={20} title="" />
          </Link>
        </Tip>
      ))}
    </span>
  );
}

/** The counts as terms over values, as a PageHero's facts; the evals as their sprites. */
function FactList({ facts }: { facts: Facts }): JSX.Element {
  const items: [string, ReactNode][] = [
    ['Runs', formatInt(facts.runs)],
    ['Models', formatInt(facts.models)],
    ['Evals', formatInt(facts.evals.length)],
  ];
  return (
    <dl className="flex flex-wrap items-end gap-x-8 gap-y-3">
      {items.map(([term, value]) => (
        <div key={term} className="flex min-w-0 flex-col gap-0.5">
          <dt className="text-xs text-muted">{term}</dt>
          <dd className="text-sm text-foreground tabular-nums">{value}</dd>
        </div>
      ))}
      <div className="-mb-1.5 -ml-1.5">
        <dt className="sr-only">Each eval</dt>
        <dd>
          <EvalStrip evals={facts.evals} />
        </dd>
      </div>
    </dl>
  );
}

function Copy(): JSX.Element {
  return (
    <div className="flex max-w-3xl flex-col gap-1.5">
      <p className="text-base font-medium text-pretty text-foreground">{LEAD}</p>
      <p className="text-sm text-pretty text-muted">
        {HOW} {SCORE}
      </p>
    </div>
  );
}

// Where Dragon Slayer ends, in tiles: Elvarg's island, Crandor
const PLACES: Record<string, [number, number]> = { dragon_slayer: [2847, 3247] };

/**
 * The world map at its own scale (one map pixel to one CSS pixel, so it stays crisp), under its
 * pins: where every run starts and where Dragon Slayer ends, both in view where the banner is wide
 * enough, else centred on the start. Drawn here, not with WorldMap: it is a still picture, not a
 * view to pan, and has no paths.
 */
function MapBanner({ facts, meta }: { facts: Facts; meta: MapMeta }): JSX.Element {
  const [ref, width] = useWidth();
  const [ref2, height] = useHeight();
  const start = facts.evals.find(e => e.start?.tile)?.start?.tile ?? null;
  const pins = [
    ...(start ? [{ id: 'start', tile: start, e: undefined }] : []),
    ...facts.evals.filter(e => PLACES[e.id]).map(e => ({ id: e.id, tile: PLACES[e.id], e })),
  ];
  const points = pins.map(({ tile: [x, z] }) => [(x - meta.x0) * meta.px_per_tile, (meta.z1 - z) * meta.px_per_tile]);
  const xs = points.map(p => p[0]);
  const ys = points.map(p => p[1]);
  const pad = 60;
  const spanX = Math.max(...xs) - Math.min(...xs);
  const spanY = Math.max(...ys) - Math.min(...ys);
  // Whole device pixels only: the map at its own size, else at half (the 1x image, one device pixel
  // per map pixel on a 2x screen) when that brings every pin into view, else its own size on the start
  const fitsAt = (k: number): boolean => (spanX + 2 * pad) * k <= width && (spanY + 2 * pad) * k <= height;
  const s = fitsAt(1) ? 1 : fitsAt(0.5) ? 0.5 : 1;
  const all = fitsAt(s);
  const cx = all ? (Math.min(...xs) + Math.max(...xs)) / 2 : (points[0]?.[0] ?? meta.width / 2);
  const cy = all ? (Math.min(...ys) + Math.max(...ys)) / 2 : (points[0]?.[1] ?? meta.height / 2);
  const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));
  const left = clamp(width / 2 - cx * s, width - meta.width * s, 0);
  const top = clamp(height / 2 - cy * s, height - meta.height * s, 0);

  return (
    <div ref={ref} className="relative h-48 min-w-0 shrink-0 overflow-hidden bg-muted-10 md:h-auto md:flex-1">
      <div ref={ref2} aria-hidden className="absolute inset-0" />
      {width > 0 && (
        <img
          src={MAP_IMAGE}
          srcSet={s === 1 ? `${MAP_IMAGE} 1x, ${MAP_IMAGE_2X} 2x` : undefined}
          alt=""
          className="absolute max-w-none"
          style={{ left, top, width: meta.width * s, height: meta.height * s }}
        />
      )}
      {width > 0 &&
        pins.map((p, i) => {
          const [x, y] = points[i];
          const at = { left: left + x * s, top: top + y * s };
          if (at.left < 0 || at.left > width || at.top < 0 || at.top > height) return null;
          if (!p.e)
            return (
              <span
                key={p.id}
                className="absolute flex -translate-1/2 items-center gap-1.5 rounded-sm bg-surface px-1.5 py-0.5 text-xs whitespace-nowrap text-foreground"
                style={at}
              >
                <span aria-hidden className="size-2 rounded-full bg-foreground" />
                Every run starts here
              </span>
            );
          const e = p.e;
          return (
            <Tip key={p.id} content={goalTip(e)}>
              <Link
                to="/evals/$evalId"
                params={{ evalId: evalSlug(e.id) }}
                search={{} as never}
                aria-label={e.title}
                className="absolute flex size-9 -translate-1/2 items-center justify-center rounded-sm bg-parchment inset-ring inset-ring-border outline-hidden transition-opacity hover:opacity-90 focus-visible:outline-2 focus-visible:outline-primary"
                style={at}
              >
                <EvalMark evalId={e.id} size={24} title="" />
              </Link>
            </Tip>
          );
        })}
    </div>
  );
}

/** The copy beside the world map, where every run starts and the quests end marked on it. */
export function Intro(): JSX.Element {
  const facts = useFacts();
  const { data: meta } = useSuspenseQuery(mapMetaQuery);
  return (
    <Card>
      <div className="mx-card-bleed my-card-bleed flex flex-col-reverse md:min-h-72 md:flex-row">
        <div className="flex flex-col justify-between gap-4 px-card-inset py-4 sm:py-5 md:w-md md:shrink-0 md:border-r md:border-border xl:w-xl">
          <Copy />
          <div className="flex flex-col gap-3">
            <FactList facts={facts} />
            <div className="flex items-end justify-between gap-4">
              <Credit />
              <ReadmeLink />
            </div>
          </div>
        </div>
        <MapBanner facts={facts} meta={meta} />
      </div>
    </Card>
  );
}
