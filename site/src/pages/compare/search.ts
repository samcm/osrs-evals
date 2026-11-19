/** `/compare`'s search params. */

import { defineSearch, legendParams, oneOf, text } from '@/lib/search';
import { METRIC_IDS } from './metrics';

export const compareSearch = defineSearch({
  tab: oneOf(['measure', 'tools', 'prices'], 'measure'),
  metric: oneOf(METRIC_IDS, 'cost'),
  /** The grouping, for the measure and the tool-call mix */
  by: oneOf(['model', 'vendor', 'agent', 'variant'], 'variant'),
  /** One eval; absent pools every eval (outcome measures fall back to the first eval) */
  eval: text(),
  /** Absent: the measure's own default */
  scale: oneOf(['log', 'linear'], undefined),
  /** Hidden or isolated pairings' points */
  ...legendParams,
});
