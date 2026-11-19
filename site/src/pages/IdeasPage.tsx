import { Link } from '@tanstack/react-router';
import { useSuspenseQuery } from '@tanstack/react-query';
import { Empty, PageTitle } from '@/components/bits';
import { EvalMark, Sprite } from '@/components/marks';
import { Card, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { indexQuery } from '@/data/queries';
import type { Idea } from '@/data/types';
import { skillSrc, questSrc, uiSrc } from '@/lib/assets';
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

function IdeaCard({ idea, noRuns }: { idea: Idea; noRuns?: boolean }) {
  return (
    <Card className="h-full transition-colors group-hover:bg-muted/50">
      <CardHeader>
        <CardTitle className="flex items-center gap-3">
          <IdeaSprite idea={idea} />
          {idea.title}
        </CardTitle>
        <CardDescription>{idea.why}</CardDescription>
      </CardHeader>
      {noRuns && <CardFooter className="mt-auto text-xs text-muted-foreground">No runs yet.</CardFooter>}
    </Card>
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
    <>
      <PageTitle>Ideas</PageTitle>
      {ideas.length === 0 && <Empty>No ideas are written down yet.</Empty>}
      {sections.map(section => (
        <section key={section.title} className="flex flex-col gap-4">
          <h2 className="text-lg font-semibold tracking-tight">{section.title}</h2>
          <ul className="grid gap-4 md:grid-cols-2 md:gap-6 2xl:grid-cols-3">
            {section.ideas.map(idea => (
              <li key={idea.title} className="min-w-0">
                {idea.eval && evalIds.has(idea.eval) ? (
                  <Link
                    to="/evals/$evalId"
                    params={{ evalId: idea.eval }}
                    className="group block h-full rounded-xl outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
                  >
                    <IdeaCard idea={idea} />
                  </Link>
                ) : (
                  <IdeaCard idea={idea} noRuns={Boolean(idea.eval)} />
                )}
              </li>
            ))}
          </ul>
        </section>
      ))}
    </>
  );
}
