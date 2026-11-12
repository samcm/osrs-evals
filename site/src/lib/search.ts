/** Search params: parsed loosely so a hand-edited URL never breaks a page. */

import { useEffect } from 'react';

export interface RunsSearch {
  eval?: string;
  model?: string;
  agent?: string;
  /** finished, not_finished or scored */
  outcome?: string;
  /** A column id, with a leading "-" for descending */
  sort?: string;
  page?: number;
}

export function stringParam(value: unknown): string | undefined {
  return typeof value === 'string' && value !== '' ? value : undefined;
}

/** Pages are 1-based in the URL; absent means the first. */
export function pageParam(value: unknown): number | undefined {
  const n = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : NaN;
  return Number.isInteger(n) && n > 1 ? n : undefined;
}

export function useDocumentTitle(title: string | undefined): void {
  useEffect(() => {
    document.title = title ? `${title} – 2004scape evals` : '2004scape evals';
  }, [title]);
}
