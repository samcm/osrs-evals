/**
 * The eval's centrepiece: the one thing at the top of the page that shows what happened, in the
 * game. Placeholder: every run's path on the world map. Owned by its own work item (see
 * site/AGENTS.md, "Eval page").
 */

import type { EvalRuns } from '@/data/types';
import type { LegendState } from '@/lib/legend';
import type { MapView } from '@/lib/map';
import type { RunCurve } from './model';
import { WhereCard } from './Where';

export function Centerpiece(props: { curves: RunCurve[]; grid: EvalRuns | undefined; legend: LegendState; view: MapView | undefined; t: number | undefined; maxTick: number }) {
  return <WhereCard {...props} />;
}
