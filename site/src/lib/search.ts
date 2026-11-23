/**
 * URL state. Each route declares its params with `defineSearch`; values parse loosely (a bad value
 * becomes the default, never an error), defaults never appear in the URL, and lists are written
 * comma-separated by the router's `stringifySearch` (see main.tsx).
 *
 *   const evalSearch = defineSearch({ x: oneOf(['ticks', 'seconds'], 'ticks'), sort: sortParam(['-cost']), ...legendParams });
 *   createFileRoute('/evals/$evalId')({ validateSearch: evalSearch.validate, search: { middlewares: evalSearch.middlewares } })
 *   const update = useSearchUpdate(evalSearch); update({ x: 'seconds' });
 */

import { useCallback, useEffect } from 'react';
import {
  getRouteApi,
  stripSearchParams,
  useNavigate,
  type SearchMiddleware,
  type SearchSchemaInput,
} from '@tanstack/react-router';
import type { Run } from '@/data/types';
import { vendorOf } from './series';

const root = getRouteApi('__root__');

/** One search param: a loose parser (undefined for a bad or absent value) and its default. */
export interface Param<T> {
  parse: (raw: unknown) => T | undefined;
  fallback: T;
}

/** The parsed search of a set of params. */
export type ParamValues<P extends Record<string, Param<unknown>>> = { [K in keyof P]: P[K]['fallback'] };

/** A route's params: `validate` for validateSearch, `middlewares` for search.middlewares, and the defaults. */
export interface SearchSchema<V extends object> {
  validate: (input: Partial<V> & SearchSchemaInput) => V;
  /** Strips defaults from every URL the route builds (typed loosely: the route's full search includes the root's) */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- any route's search, as the router types its middlewares
  middlewares: SearchMiddleware<any>[];
  defaults: V;
}

/** A raw value as one string: lists from a repeated key are joined. */
function raw(value: unknown): string | undefined {
  if (Array.isArray(value)) return value.map(String).join(',');
  if (value == null || value === '') return undefined;
  return String(value);
}

/** Free text. */
export function text(): Param<string | undefined>;
export function text(fallback: string): Param<string>;
export function text(fallback?: string): Param<string | undefined> {
  return { parse: raw, fallback };
}

/** An integer within [min, max]. */
export function int(fallback: number, range?: { min?: number; max?: number }): Param<number>;
export function int(fallback: undefined, range?: { min?: number; max?: number }): Param<number | undefined>;
export function int(fallback: number | undefined, { min = -Infinity, max = Infinity } = {}): Param<number | undefined> {
  return {
    parse: value => {
      const n = typeof value === 'number' ? value : Number(raw(value));
      return Number.isInteger(n) && n >= min && n <= max ? n : undefined;
    },
    fallback,
  };
}

/** A finite number, such as a map time. */
export function num(fallback: number): Param<number>;
export function num(fallback: undefined): Param<number | undefined>;
export function num(fallback: number | undefined): Param<number | undefined> {
  return {
    parse: value => {
      const n = typeof value === 'number' ? value : Number(raw(value));
      return Number.isFinite(n) && raw(value) !== undefined ? n : undefined;
    },
    fallback,
  };
}

/** One of a fixed set of words. */
export function oneOf<const V extends string, const D extends V | undefined>(
  values: readonly V[],
  fallback: D
): Param<V | D> {
  return { parse: value => values.find(v => v === raw(value)), fallback };
}

/** A comma-separated list, deduplicated; with `values`, unknown entries are dropped. Default: empty. */
export function list(values?: readonly string[]): Param<string[]> {
  return {
    parse: value => {
      const items = (raw(value) ?? '')
        .split(',')
        .map(s => s.trim())
        .filter(s => s !== '' && (!values || values.includes(s)));
      return items.length ? [...new Set(items)] : undefined;
    },
    fallback: [],
  };
}

/** A sort: column ids, each with a leading "-" for descending ("cost,-ticks"). */
export function sortParam(fallback: string[] = []): Param<string[]> {
  return { parse: list().parse, fallback };
}

/** Comma-separated numbers of a fixed count, such as a map view "x,z,zoom". */
export function numbers(count: number): Param<number[] | undefined> {
  return {
    parse: value => {
      const parts = (raw(value) ?? '').split(',').map(Number);
      return parts.length === count && parts.every(Number.isFinite) ? parts : undefined;
    },
    fallback: undefined,
  };
}

function equal(a: unknown, b: unknown): boolean {
  if (Array.isArray(a) && Array.isArray(b)) return a.length === b.length && a.every((v, i) => equal(v, b[i]));
  return a === b;
}

/** Declare a route's params. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- params of any value type; ParamValues keeps each one's
export function defineSearch<P extends Record<string, Param<any>>>(params: P): SearchSchema<ParamValues<P>> {
  type V = ParamValues<P>;
  const defaults = Object.fromEntries(Object.entries(params).map(([k, p]) => [k, p.fallback])) as V;
  const strippable = Object.fromEntries(Object.entries(defaults).filter(([, v]) => v !== undefined));
  return {
    defaults,
    validate: input =>
      Object.fromEntries(
        Object.entries(params).map(([k, p]) => [k, p.parse((input as Record<string, unknown>)[k]) ?? p.fallback])
      ) as V,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- as SearchSchema's middlewares
    middlewares: [stripSearchParams(strippable as never) as SearchMiddleware<any>],
  };
}

/** Options for a search update. */
export interface UpdateOptions {
  /** Also clear `page`: set when a filter or sort changes */
  resetPage?: boolean;
  /** Add a history entry instead of replacing the current one */
  push?: boolean;
}

/**
 * Update the current route's search: replace, keep the scroll, and drop values equal to their
 * default (or empty lists) so the URL stays clean.
 */
export function useSearchUpdate<V extends object = Record<string, unknown>>(
  schema?: Pick<SearchSchema<V>, 'defaults'>
): (patch: Partial<V>, options?: UpdateOptions) => void {
  const navigate = useNavigate();
  return useCallback(
    (patch, options = {}) => {
      const defaults = (schema?.defaults ?? {}) as Record<string, unknown>;
      const clean: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(patch)) {
        clean[k] = (Array.isArray(v) && v.length === 0) || equal(v, defaults[k]) ? undefined : v;
      }
      if (options.resetPage) clean.page = undefined;
      navigate({
        to: '.',
        search: (prev: Record<string, unknown>) => ({ ...prev, ...clean }),
        replace: !options.push,
        resetScroll: false,
      } as never);
    },
    [navigate, schema]
  );
}

/** Params that legends bind to: hidden series and the one isolated series. Spread into defineSearch. */
export const legendParams = { hide: list(), focus: text() };

/** Scope params, on the root route and carried on every internal link: they narrow every page. */
const scopeParams = { model: list(), agent: list(), vendor: list(), thinking: list() };

/** The root route's params: scope plus a theme override for shared links. */
export const rootSearch = defineSearch({
  ...scopeParams,
  theme: oneOf(['light', 'dark', 'star'], undefined),
  /** EthIQ's cut: every thinking level of each model in each harness, or only its best one. A view
   * param on every page, not carried from page to page */
  effort: oneOf(['all', 'best'], 'all'),
});

export type EffortCut = 'all' | 'best';

/** The page's thinking-level cut (`effort`). */
export const useEffort = (): EffortCut => root.useSearch().effort;

/** Keys carried from page to page. */
export const RETAINED_PARAMS = ['model', 'agent', 'vendor', 'thinking', 'theme'] as const;

export interface Scope {
  model: string[];
  agent: string[];
  vendor: string[];
  /** Thinking levels, `default` for runs that set none */
  thinking: string[];
}

/** The current scope (empty lists mean everything). */
export function useScope(): Scope {
  const { model, agent, vendor, thinking } = root.useSearch();
  return { model, agent, vendor, thinking };
}

/** Whether a run is in scope. */
export function inScope(run: Pick<Run, 'model' | 'agent' | 'thinking'>, scope: Scope): boolean {
  return (
    (scope.thinking.length === 0 || scope.thinking.includes(run.thinking)) &&
    (scope.model.length === 0 || scope.model.includes(run.model)) &&
    (scope.agent.length === 0 || scope.agent.includes(run.agent)) &&
    (scope.vendor.length === 0 || scope.vendor.includes(vendorOf(run.model).id))
  );
}

/** Change the scope; resets `page`. */
export function useScopeUpdate(): (patch: Partial<Scope>) => void {
  const update = useSearchUpdate<Scope>();
  return useCallback(patch => update(patch, { resetPage: true }), [update]);
}

/** Search as a query string with lists comma-joined and only light escaping: the router's stringifySearch. */
export function stringifySearch(search: Record<string, unknown>): string {
  const parts: string[] = [];
  for (const [key, value] of Object.entries(search)) {
    if (value == null || value === '' || (Array.isArray(value) && value.length === 0)) continue;
    const text = Array.isArray(value) ? value.map(String).join(',') : String(value);
    parts.push(
      `${encodeURIComponent(key)}=${encodeURIComponent(text).replace(/%2C/g, ',').replace(/%2F/g, '/').replace(/%3A/g, ':').replace(/%7C/g, '|')}`
    );
  }
  return parts.length ? `?${parts.join('&')}` : '';
}

/** A query string as plain strings; routes' validateSearch turns them into values. The router's parseSearch. */
export function parseSearch(query: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of new URLSearchParams(query.startsWith('?') ? query.slice(1) : query)) {
    out[key] = key in out ? `${out[key]},${value}` : value;
  }
  return out;
}

export function useDocumentTitle(title: string | undefined): void {
  useEffect(() => {
    document.title = title ? `${title} – 2004scape evals` : '2004scape evals';
  }, [title]);
}
