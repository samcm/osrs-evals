/** `/`'s search params. */

import { defineSearch, int, sortParam } from '@/lib/search';

export const overviewSearch = defineSearch({
  /** The leaderboard's sort and page */
  sort: sortParam(['-score']),
  page: int(1, { min: 1 }),
});
