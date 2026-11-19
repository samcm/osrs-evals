import { queryOptions } from '@tanstack/react-query';
import type { EvalRuns, Index, RunDetail } from './types';

async function getJson<T>(path: string): Promise<T> {
  const response = await fetch(path);
  if (!response.ok) throw new Error(`${path} returned ${response.status}`);
  return (await response.json()) as T;
}

/** Every eval, run summary, price and idea. */
export const indexQuery = queryOptions({
  queryKey: ['index'],
  queryFn: () => getJson<Index>('/data/index.json'),
  staleTime: Infinity,
});

/** One run's detail: turns, timeline and transcript. */
export const runQuery = (runId: string) =>
  queryOptions({
    queryKey: ['run', runId],
    queryFn: () => getJson<RunDetail>(`/data/runs/${encodeURIComponent(runId)}.json`),
    staleTime: Infinity,
  });

/** Every run of one eval on a shared tick grid, with coarse paths, for overlays. */
export const evalRunsQuery = (evalId: string) =>
  queryOptions({
    queryKey: ['evalRuns', evalId],
    queryFn: () => getJson<EvalRuns>(`/data/evals/${encodeURIComponent(evalId)}.json`),
    staleTime: Infinity,
  });
