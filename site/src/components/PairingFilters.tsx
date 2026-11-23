/**
 * The controls that cut pairings by thinking level and harness, as EthIQ does: every thinking level
 * of each model in each harness, or only its best (`effort`), and filters for the levels and
 * harnesses shown. Pages bind the filters to the `thinking` and `agent` scope params (carried from
 * page to page); the model page binds them to its own.
 */

import type { JSX, ReactNode } from 'react';
import { FunnelIcon } from '@heroicons/react/20/solid';
import { Popover, PopoverButton, PopoverPanel } from '@/components/Overlays/Popover';
import { Segmented } from '@/components/bits';
import { FacetFilter } from '@/components/FacetFilter';
import { BrandMark } from '@/components/marks';
import type { Run } from '@/data/types';
import { useEffort, useSearchUpdate, type EffortCut } from '@/lib/search';
import { agentInfo, compareThinking, levelName } from '@/lib/series';

const EFFORT_OPTIONS = [
  { value: 'all' as const, label: 'All levels', title: 'Every thinking level of each model in each harness' },
  { value: 'best' as const, label: 'Best level', title: 'Each model in each harness at its best thinking level' },
];

/**
 * A page's filters and secondary view controls, folded into one Filters button, so the toolbar is
 * one row and a first-time visitor sees the view, not the knobs. `active` counts the filters set,
 * shown on the button.
 */
export function FiltersFold({ active = 0, children }: { active?: number; children: ReactNode }): JSX.Element {
  return (
    <Popover>
      <PopoverButton variant="secondary" size="sm" leadingIcon={<FunnelIcon />} nowrap>
        Filters
        {active > 0 && <span className="font-normal text-muted tabular-nums">{active}</span>}
      </PopoverButton>
      <PopoverPanel
        anchor={{ to: 'bottom start', gap: 4, padding: 8 }}
        className="flex max-w-vw-less-4 flex-wrap gap-2 p-3 shadow-lg"
      >
        {children}
      </PopoverPanel>
    </Popover>
  );
}

function counted(runs: Run[], key: (r: Run) => string): Map<string, number> {
  const out = new Map<string, number>();
  for (const r of runs) out.set(key(r), (out.get(key(r)) ?? 0) + 1);
  return out;
}

export function PairingFilters({
  runs,
  thinking,
  agent,
  onChange,
  effort = true,
  levels: advertised,
  children,
}: {
  /** The runs the page could show, for the filters' options and counts */
  runs: Run[];
  thinking: string[];
  agent: string[];
  onChange: (patch: { thinking?: string[]; agent?: string[] }) => void;
  /** Offer the best-level cut (not on a page that compares the levels themselves) */
  effort?: boolean;
  /** The thinking levels the model advertises, on a page about one model: the levels to list */
  levels?: string[] | null;
  /** The page's other view controls, folded with the filters on a phone */
  children?: ReactNode;
}): JSX.Element {
  const cut = useEffort();
  const update = useSearchUpdate<{ effort: EffortCut }>();
  const level = (r: Run): string => r.thinking;
  // One model's page lists the levels it advertises (a level not run yet counts none); else the levels run
  const levels = [...new Set([...(advertised ?? []), ...counted(runs, level).keys()])].sort(compareThinking);
  const agents = [...new Map(runs.map(r => [r.agent, r])).values()].sort((a, b) =>
    agentInfo(a.agent, a.agent_name).name.localeCompare(agentInfo(b.agent, b.agent_name).name)
  );
  return (
    <FiltersFold active={thinking.length + agent.length + (cut === 'all' ? 0 : 1)}>
      {children}
      {effort && (
        <Segmented
          label="Thinking levels shown"
          value={cut}
          options={EFFORT_OPTIONS}
          onChange={v => update({ effort: v === 'all' ? undefined : v } as never)}
        />
      )}
      <FacetFilter
        title="Thinking"
        options={levels.map(level => ({ value: level, label: levelName(level) }))}
        selected={thinking}
        counts={counted(runs, level)}
        onChange={values => onChange({ thinking: values })}
      />
      <FacetFilter
        title="Harness"
        options={agents.map(r => ({
          value: r.agent,
          label: agentInfo(r.agent, r.agent_name).name,
          mark: <BrandMark slug={agentInfo(r.agent, r.agent_name).slug} size={16} />,
        }))}
        selected={agent}
        counts={counted(runs, r => r.agent)}
        onChange={values => onChange({ agent: values })}
      />
    </FiltersFold>
  );
}
