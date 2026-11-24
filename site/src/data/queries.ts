import { queryOptions, type DataTag, type UnusedSkipTokenOptions } from '@tanstack/react-query';
import { registerModels } from '@/lib/series';
import { registerItems } from '@/lib/items';
import type { EvalRuns, Index, RunDetail, RunSummary } from './types';

/** A query's options for data of type T, keyed as TanStack Query types the key. */
type JsonQuery<T> = UnusedSkipTokenOptions<T, Error, T, string[]> & { queryKey: DataTag<string[], T, Error> };

async function getJson<T>(path: string): Promise<T> {
  const response = await fetch(path);
  if (!response.ok) throw new Error(`${path} returned ${response.status}`);
  return (await response.json()) as T;
}

/** Every eval, run summary, price and idea. */
export const indexQuery = queryOptions({
  queryKey: ['index'],
  // The models' makers and names are known from here on, wherever a model is named
  queryFn: () =>
    getJson<Index>('/data/index.json').then(index => {
      registerModels(index.models ?? {}, index.providers ?? {});
      registerItems(index.items ?? {});
      return index;
    }),
  staleTime: Infinity,
});

/** One run's detail: turns, timeline and transcript. */
export const runQuery = (runId: string): JsonQuery<RunDetail> =>
  queryOptions({
    queryKey: ['run', runId],
    queryFn: () => getJson<RunDetail>(`/data/runs/${encodeURIComponent(runId)}.json`),
    staleTime: Infinity,
  });

/** Every run of one eval on a shared tick grid, with coarse paths, for overlays. */
export const evalRunsQuery = (evalId: string): JsonQuery<EvalRuns> =>
  queryOptions({
    queryKey: ['evalRuns', evalId],
    queryFn: () => getJson<EvalRuns>(`/data/evals/${encodeURIComponent(evalId)}.json`),
    staleTime: Infinity,
  });

/** A run's chapters and summary (site/summarize.py); null when it has none yet. */
export const runSummaryQuery = (runId: string): JsonQuery<RunSummary | null> =>
  queryOptions({
    queryKey: ['runSummary', runId],
    queryFn: async () => {
      const response = await fetch(`/data/runs/${encodeURIComponent(runId)}.summary.json`);
      // A static host answers a missing file with the page itself
      if (!response.ok || !response.headers.get('content-type')?.includes('json')) return null;
      return (await response.json()) as RunSummary;
    },
    staleTime: Infinity,
  });
