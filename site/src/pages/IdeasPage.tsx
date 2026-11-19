import { Link } from '@tanstack/react-router';
import { useSuspenseQuery } from '@tanstack/react-query';
import { Badge, Empty, PageTitle, linkClassName } from '@/components/bits';
import { EvalMark } from '@/components/marks';
import { indexQuery } from '@/data/queries';
import { useDocumentTitle } from '@/lib/search';

export function IdeasPage() {
  useDocumentTitle('Ideas');
  const { data } = useSuspenseQuery(indexQuery);
  const ideas = data.ideas ?? [];
  const evalIds = new Set(data.evals.map(e => e.id));
  const built = ideas.filter(i => i.status === 'built');
  const rest = ideas.filter(i => i.status !== 'built');

  return (
    <div className="flex flex-col gap-6">
      <PageTitle>Ideas</PageTitle>
      {ideas.length === 0 && <Empty>No ideas are written down yet.</Empty>}
      {[built, rest].map((group, g) =>
        group.length ? (
          <ul key={g} className="grid gap-4 md:grid-cols-2 2xl:grid-cols-3">
            {group.map(idea => {
              const isBuilt = idea.status === 'built';
              return (
                <li
                  key={idea.title}
                  className="flex min-w-0 flex-col gap-3 rounded-sm bg-surface p-4 outline -outline-offset-1 outline-border sm:p-5"
                >
                  <div className="flex items-start justify-between gap-3">
                    <h2 className="text-sm/6 font-semibold text-foreground">{idea.title}</h2>
                    <Badge color={isBuilt ? 'teal' : 'gray'}>{isBuilt ? 'Built' : 'Idea'}</Badge>
                  </div>
                  <p className="text-sm/6 text-muted">{idea.why}</p>
                  {isBuilt && idea.eval && (
                    <div className="mt-auto flex items-center gap-2 pt-1 text-sm">
                      <EvalMark evalId={idea.eval} size={24} />
                      {evalIds.has(idea.eval) ? (
                        <Link to="/evals/$evalId" params={{ evalId: idea.eval }} className={linkClassName}>
                          {data.evals.find(e => e.id === idea.eval)?.title}
                        </Link>
                      ) : (
                        <span className="text-muted">
                          <span className="font-mono text-xs">{idea.eval}</span> has no runs yet
                        </span>
                      )}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        ) : null
      )}
    </div>
  );
}
