import { useSyncExternalStore } from 'react';

/** Below md (48rem), where pages lay out for a phone */
const MOBILE_QUERY = '(max-width: 47.99rem)';

function subscribe(onChange: () => void): () => void {
  const mql = window.matchMedia(MOBILE_QUERY);
  mql.addEventListener('change', onChange);
  return () => mql.removeEventListener('change', onChange);
}

/** Whether the window is phone-wide (under 768px), kept current as it resizes. */
export function useIsMobile(): boolean {
  return useSyncExternalStore(subscribe, () => window.matchMedia(MOBILE_QUERY).matches);
}
