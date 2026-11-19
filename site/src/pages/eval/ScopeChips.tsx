import type { Run } from '@/data/types';
import { Button } from '@/components/ui/button';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { BrandMark, ModelLabel } from '@/components/marks';
import { useScope, useScopeUpdate } from '@/lib/search';
import { agentName, modelName, vendorOf } from '@/lib/series';

/**
 * The scope as toggles: one per model, harness and (when one vendor has several models here, or a
 * link scopes by one) vendor among the eval's runs. Nothing selected means everything.
 */
export function ScopeChips({ runs }: { runs: Run[] }) {
  const scope = useScope();
  const setScope = useScopeUpdate();
  const models = [...new Set(runs.map(r => r.model))].sort((a, b) => modelName(a).localeCompare(modelName(b)));
  // The scripted baseline is its model's toggle already
  const agents = [...new Map(runs.filter(r => r.model !== 'none/none').map(r => [r.agent, r.agent_name])).entries()].sort((a, b) =>
    agentName(...a).localeCompare(agentName(...b))
  );
  const vendorModels = new Map<string, Set<string>>();
  for (const m of models) vendorModels.set(vendorOf(m).id, (vendorModels.get(vendorOf(m).id) ?? new Set()).add(m));
  const showVendors = scope.vendor.length > 0 || [...vendorModels.values()].some(s => s.size > 1);
  const scoped = scope.model.length + scope.agent.length + scope.vendor.length > 0;

  if (models.length < 2 && agents.length < 2 && !scoped) return null;
  return (
    <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Scope">
      {showVendors && (
        <ToggleGroup
          type="multiple"
          variant="outline"
          size="sm"
          aria-label="Vendors"
          value={scope.vendor}
          onValueChange={vendor => setScope({ vendor })}
          className="flex-wrap"
        >
          {[...vendorModels.keys()].map(id => {
            const v = vendorOf([...vendorModels.get(id)!][0]);
            return (
              <ToggleGroupItem key={id} value={id}>
                <BrandMark slug={v.slug} size={14} />
                {v.name}
              </ToggleGroupItem>
            );
          })}
        </ToggleGroup>
      )}
      <ToggleGroup
        type="multiple"
        variant="outline"
        size="sm"
        aria-label="Models"
        value={scope.model}
        onValueChange={model => setScope({ model })}
        className="flex-wrap"
      >
        {models.map(m => (
          <ToggleGroupItem key={m} value={m}>
            <ModelLabel model={m} size={14} />
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
      <ToggleGroup
        type="multiple"
        variant="outline"
        size="sm"
        aria-label="Harnesses"
        value={scope.agent}
        onValueChange={agent => setScope({ agent })}
        className="flex-wrap"
      >
        {agents.map(([a, name]) => (
          <ToggleGroupItem key={a} value={a}>
            {agentName(a, name)}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
      {scoped && (
        <Button variant="ghost" size="sm" onClick={() => setScope({ model: [], agent: [], vendor: [] })}>
          Clear
        </Button>
      )}
    </div>
  );
}
