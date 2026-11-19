/**
 * The eval's one list of model + harness pairings, ranked by result. The only place on the page that
 * lists them; charts key their lines with a legend, never a second list. Placeholder: the old ranked
 * panel in a card. Owned by its own work item (see site/AGENTS.md, "Eval page").
 */

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import type { Eval } from '@/data/types';
import type { LegendState } from '@/lib/legend';
import type { RankedVariant, XMeasure } from './model';
import { RankedPanel } from './Progress';

export function Leaderboard({ e, ranked, x, legend }: { e: Eval; ranked: RankedVariant[]; x: XMeasure; legend: LegendState }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Leaderboard</CardTitle>
      </CardHeader>
      <CardContent className="px-0">
        <RankedPanel e={e} ranked={ranked} x={x} legend={legend} />
      </CardContent>
    </Card>
  );
}
