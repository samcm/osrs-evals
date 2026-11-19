import type { ReactNode } from 'react';
import { Link } from '@tanstack/react-router';
import { useSuspenseQuery } from '@tanstack/react-query';
import { Empty, PageTitle } from '@/components/bits';
import { EvalMark, Sprite } from '@/components/marks';
import { indexQuery } from '@/data/queries';
import type { Idea } from '@/data/types';
import { questSrc, skillSrc, uiSrc } from '@/lib/assets';
import { useDocumentTitle } from '@/lib/search';

/** Game art for ideas without an eval yet, by what the idea is about. */
const IDEA_ART: [RegExp, string, string][] = [
  [/demon slayer/i, questSrc('demon_slayer'), 'Demon Slayer'],
  [/dragon slayer/i, questSrc('dragon_slayer'), 'Dragon Slayer'],
  [/wall-clock/i, uiSrc('controls'), 'Run'],
  [/swarm|accounts/i, uiSrc('friends'), 'Friends list'],
  [/skill/i, skillSrc('woodcutting'), 'Woodcutting'],
];

function IdeaSprite({ idea }: { idea: Idea }) {
  if (idea.eval) return <EvalMark evalId={idea.eval} size={32} title="" />;
  const [, src, name] = IDEA_ART.find(([re]) => re.test(idea.title)) ?? [null, uiSrc('quests'), 'Quests'];
  return <Sprite src={src} size={32} alt={name} />;
}

const cardClassName = 'flex h-full min-w-0 gap-4 rounded-sm bg-surface p-4 outline -outline-offset-1 outline-border sm:p-5';

function IdeaBody({ idea, aside }: { idea: Idea; aside?: ReactNode }) {
  return (
    <>
      <span className="flex size-10 shrink-0 items-center justify-center rounded-sm bg-background">
        <IdeaSprite idea={idea} />
      </span>
      <span className="flex min-w-0 flex-col gap-1">
        <span className="text-sm/6 font-semibold text-foreground">{idea.title}</span>
        <span className="text-sm/6 text-muted">{idea.why}</span>
        {aside}
      </span>
    </>
  );
}

export function IdeasPage() {
  useDocumentTitle('Ideas');
  const { data } = useSuspenseQuery(indexQuery);
  const ideas = data.ideas ?? [];
  const evalIds = new Set(data.evals.map(e => e.id));
  const sections = [
    { title: 'Built', ideas: ideas.filter(i => i.status === 'built') },
    { title: 'Next', ideas: ideas.filter(i => i.status !== 'built') },
  ].filter(s => s.ideas.length);

  return (
    <div className="flex flex-col gap-6">
      <PageTitle>Ideas</PageTitle>
      {ideas.length === 0 && <Empty>No ideas are written down yet.</Empty>}
      {sections.map(section => (
        <section key={section.title} className="flex flex-col gap-3">
          <h2 className="text-base font-semibold text-foreground">{section.title}</h2>
          <ul className="grid gap-4 md:grid-cols-2 2xl:grid-cols-3">
            {section.ideas.map(idea => (
              <li key={idea.title} className="min-w-0">
                {idea.eval && evalIds.has(idea.eval) ? (
                  <Link
                    to="/evals/$evalId"
                    params={{ evalId: idea.eval }}
                    className={`${cardClassName} transition-colors hover:bg-background focus-visible:ring-2 focus-visible:ring-primary-50`}
                  >
                    <IdeaBody idea={idea} />
                  </Link>
                ) : (
                  <div className={cardClassName}>
                    <IdeaBody idea={idea} aside={idea.eval ? <span className="text-xs text-muted">No runs yet.</span> : undefined} />
                  </div>
                )}
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
