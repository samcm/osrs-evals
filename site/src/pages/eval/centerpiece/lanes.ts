/**
 * What each race lane shows besides how far along its run is: the eval's own events so far (the
 * quests it finished, the quest points its quest needs, the quest's stages) and what the agent was
 * doing at the playhead, in its own words.
 */

import type { RunDetail, RunEvent, Turn } from '@/data/types';
import { questSrc, uiSrc } from '@/lib/assets';
import { actionClauses } from '../../run/actionLines';

/** An event drawn as a sprite in a lane. */
export interface LaneMark {
  tick: number;
  src: string;
  name: string;
  /** Guessed rather than read from the game (a quest-points jump) */
  inferred: boolean;
}

/** A stage of the eval's quest, as a tick on the lane's track at its value. */
export interface LaneStage {
  stage: number;
  name: string;
}

/** The run's sprite-worthy events in order: quests finished and quest points reached. */
export function laneMarks(events: RunEvent[] | undefined): LaneMark[] {
  return (events ?? []).flatMap((e): LaneMark[] => {
    if (e.kind === 'quest') {
      const name = e.name ?? 'A quest';
      return [{ tick: e.tick, src: e.quest ? questSrc(e.quest) : uiSrc('quests'), name: e.source === 'inferred' ? `≈ ${name}` : name, inferred: e.source === 'inferred' }];
    }
    if (e.kind === 'qp') return [{ tick: e.tick, src: uiSrc('quests'), name: `${e.qp} quest points`, inferred: false }];
    return [];
  });
}

/** The quest stages any of these runs reached, lowest first: the ladder every lane's track shows. */
export function laneStages(details: (RunDetail | undefined)[]): LaneStage[] {
  const stages = new Map<number, string>();
  for (const d of details) for (const e of d?.events ?? []) if (e.kind === 'stage') stages.set(e.stage, e.name);
  return [...stages.entries()].sort((a, b) => a[0] - b[0]).map(([stage, name]) => ({ stage, name }));
}

/** The first line of the model's prose, without Markdown, cut to a sentence's length. */
function proseLine(text: string): string | null {
  const line = text
    .split('\n')
    .map(l => l.replace(/^[#>*\-\s]+/, '').replace(/[*_`]+/g, '').trim())
    .find(l => l.length > 0);
  return line ? line.replace(/[:.]$/, '') : null;
}

/** One call's action as its transcript line: "Ran quest.ts, Read API.md". */
function actionLine(turn: Turn): string | null {
  const action = turn.actions[turn.actions.length - 1];
  if (!action) return null;
  return actionClauses(action)
    .map(c => (c.object ? `${c.verb} ${c.object}` : c.verb))
    .join(', ');
}

/**
 * What the agent was doing at a tick, in its own words: the latest model call by then, its tool
 * call's intent (omp asks for one; Claude Code's shell calls carry a description), else the call's
 * prose, else its action as the transcript writes it.
 */
export function statusAt(detail: RunDetail | undefined, tick: number): string | null {
  if (!detail) return null;
  // The latest call by then that says anything (a call with no tool and no prose says nothing)
  for (let i = detail.turns.length - 1; i >= 0; i--) {
    const t = detail.turns[i];
    if (t.tick == null || t.tick > tick) continue;
    const intent = t.actions.findLast(a => a.intent)?.intent;
    const said = intent ?? (t.text ? proseLine(t.text) : null) ?? actionLine(t);
    if (said) return said;
  }
  return null;
}
