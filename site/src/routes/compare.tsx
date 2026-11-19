import { createFileRoute } from '@tanstack/react-router';
import { ComparePage } from '@/pages/compare/ComparePage';
import { METRIC_IDS } from '@/pages/compare/metrics';
import { defineSearch, oneOf, text } from '@/lib/search';

export const compareSearch = defineSearch({
  metric: oneOf(METRIC_IDS, 'cost'),
  by: oneOf(['model', 'vendor', 'agent', 'variant'], 'variant'),
  /** One eval; absent pools every eval (outcome metrics fall back to the first eval) */
  eval: text(),
  /** Absent: the metric's own default */
  scale: oneOf(['log', 'linear'], undefined),
  /** The tool-call mix's grouping */
  mix: oneOf(['agent', 'variant', 'model'], 'agent'),
});

export const Route = createFileRoute('/compare')({
  validateSearch: compareSearch.validate,
  search: { middlewares: compareSearch.middlewares },
  component: ComparePage,
});
