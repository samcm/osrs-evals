import type { ReactNode } from 'react';
import clsx from 'clsx';
import type { Run } from '@/data/types';
import { AgentLabel, BrandMark, ModelLabel } from '@/components/marks';
import { useScope, useScopeUpdate, type Scope } from '@/lib/search';
import { agentName, modelName, vendorOf } from '@/lib/series';

function Chip({ selected, onClick, children, title }: { selected: boolean; onClick: () => void; children: ReactNode; title?: string }) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      title={title}
      onClick={onClick}
      className={clsx(
        'inline-flex h-7 items-center rounded-sm px-2.5 text-xs font-medium whitespace-nowrap outline -outline-offset-1 transition-colors focus-visible:ring-2 focus-visible:ring-primary-50',
        selected ? 'bg-primary-soft text-primary outline-primary-50' : 'bg-surface text-foreground outline-border hover:bg-background'
      )}
    >
      {children}
    </button>
  );
}

const toggle = (list: string[], id: string): string[] => (list.includes(id) ? list.filter(x => x !== id) : [...list, id]);

/**
 * The scope as chips, one per model, agent and vendor among the eval's runs. Nothing selected
 * means everything. Vendors show only when one has several models here, or a link scoped by one.
 */
export function ScopeChips({ runs }: { runs: Run[] }) {
  const scope = useScope();
  const setScope = useScopeUpdate();
  const models = [...new Set(runs.map(r => r.model))].sort((a, b) => modelName(a).localeCompare(modelName(b)));
  const agents = [...new Map(runs.map(r => [r.agent, r.agent_name])).entries()].sort((a, b) =>
    agentName(...a).localeCompare(agentName(...b))
  );
  const vendorModels = new Map<string, Set<string>>();
  for (const m of models) vendorModels.set(vendorOf(m).id, (vendorModels.get(vendorOf(m).id) ?? new Set()).add(m));
  const showVendors = scope.vendor.length > 0 || [...vendorModels.values()].some(s => s.size > 1);
  const scoped = scope.model.length + scope.agent.length + scope.vendor.length > 0;
  const set = (key: keyof Scope, id: string) => setScope({ [key]: toggle(scope[key], id) });

  if (models.length < 2 && agents.length < 2 && !scoped) return null;
  return (
    <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Scope">
      {showVendors &&
        [...vendorModels.keys()].map(id => {
          const v = vendorOf([...vendorModels.get(id)!][0]);
          return (
            <Chip key={`v:${id}`} selected={scope.vendor.includes(id)} onClick={() => set('vendor', id)}>
              <span className="inline-flex items-center gap-1.5">
                <BrandMark slug={v.slug} size={14} />
                {v.name}
              </span>
            </Chip>
          );
        })}
      {showVendors && <span aria-hidden className="mx-1 h-4 w-px bg-border" />}
      {models.map(m => (
        <Chip key={`m:${m}`} selected={scope.model.includes(m)} onClick={() => set('model', m)}>
          <ModelLabel model={m} size={14} />
        </Chip>
      ))}
      <span aria-hidden className="mx-1 h-4 w-px bg-border" />
      {agents.map(([a, name]) => (
        <Chip key={`a:${a}`} selected={scope.agent.includes(a)} onClick={() => set('agent', a)}>
          <AgentLabel agent={a} fallback={name} size={14} />
        </Chip>
      ))}
      {scoped && (
        <button
          type="button"
          onClick={() => setScope({ model: [], agent: [], vendor: [] })}
          className="ml-1 h-7 rounded-sm px-1.5 text-xs text-muted transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-primary-50"
        >
          Clear
        </button>
      )}
    </div>
  );
}
