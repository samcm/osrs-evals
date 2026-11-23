/**
 * The playback bar under the game, in the player card's footer: play and pause, the speed, a track
 * over the whole run with its events on it (quests, deaths, attempt starts), and the time at the
 * playhead. It drives the page's
 * one playhead (playhead.ts). Keys: Space plays or pauses; Shift+← and Shift+→ step to the previous
 * and next model call (plain ← and → go to the previous and next run).
 */

import { useEffect, useMemo } from 'react';
import { getRouteApi } from '@tanstack/react-router';
import { Sprite } from '@/components/marks';
import { PauseIcon, PlayIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Kbd } from '@/components/ui/kbd';
import { Slider } from '@/components/ui/slider';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import type { RunDetail, RunEvent, RunSummary } from '@/data/types';
import { questSrc, skillSrc, uiSrc } from '@/lib/assets';
import { formatClock, formatInt } from '@/lib/format';
import { useSearchUpdate } from '@/lib/search';
import { useWidth } from '@/lib/useWidth';
import { cn } from '@/lib/utils';
import { turnTick, type Clock, type XMeasure } from './model';
import { commit, defaultSpeed, pause, REAL_TIME, seek, setSpeed, SPEEDS, toggle, useCommitted, usePlayhead } from './playhead';
import { runSearch } from './search';

const route = getRouteApi('/runs/$runId');

/** Sprites on the track, CSS pixels; events closer than this share one mark */
const MARK = 16;

type Marked = Extract<RunEvent, { kind: 'quest' | 'death' | 'attempt' }>;

/** One mark on the track: the first event at that spot, and every event it stands for. */
interface Mark {
  left: number;
  tick: number;
  events: Marked[];
}

function eventTitle(e: Marked): string {
  if (e.kind === 'quest') return e.source === 'inferred' ? `≈ ${e.name ?? 'A quest'}: guessed from the quest-points jump` : (e.name ?? 'A quest');
  if (e.kind === 'death') return 'Died';
  return `Attempt ${e.attempt}`;
}

function EventMark({ mark }: { mark: Mark }) {
  const e = mark.events[0];
  const inferred = e.kind === 'quest' && e.source === 'inferred';
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="ghost"
          onClick={() => {
            pause();
            commit(mark.tick);
          }}
          aria-label={mark.events.map(eventTitle).join(', ')}
          className={cn(
            'absolute top-0 size-4 -translate-x-1/2 rounded-sm p-0 text-xs leading-none font-normal text-muted-foreground tabular-nums hover:bg-transparent',
            inferred && 'rounded-none border-0 border-b border-dashed border-muted-foreground'
          )}
          style={{ left: mark.left }}
        >
          {e.kind === 'attempt' ? e.attempt : <Sprite src={e.kind === 'death' ? skillSrc('hitpoints') : e.quest ? questSrc(e.quest) : uiSrc('quests')} size={MARK} alt="" />}
        </Button>
      </TooltipTrigger>
      <TooltipContent>
        {mark.events.map((ev, i) => (
          <div key={i}>{eventTitle(ev)}</div>
        ))}
      </TooltipContent>
    </Tooltip>
  );
}

export function Playback({ run, clock, measure, chapters }: { run: RunDetail; clock: Clock; measure: XMeasure; chapters?: RunSummary['chapters'] }) {
  const [committed, write] = useCommitted(run, clock);
  const head = usePlayhead(clock, committed, write);
  const auto = String(defaultSpeed(clock.maxTicks));
  const speed = route.useSearch().speed ?? auto;
  const update = useSearchUpdate(runSearch);
  const [trackRef, width] = useWidth();
  const max = clock.maxTicks;

  useEffect(() => setSpeed(REAL_TIME * Number(speed)), [speed]);

  const turnTicks = useMemo(() => run.turns.map(t => turnTick(t, clock)).sort((a, b) => a - b), [run.turns, clock]);
  const tick = head.tick;

  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      const target = event.target as HTMLElement | null;
      if (event.altKey || event.ctrlKey || event.metaKey) return;
      if (target?.closest('input, textarea, select, [contenteditable]')) return;
      if (event.key === ' ' && !event.shiftKey && !target?.closest('button, a, [role=slider]')) {
        event.preventDefault();
        toggle();
      } else if (event.shiftKey && (event.key === 'ArrowLeft' || event.key === 'ArrowRight') && !target?.closest('[role=slider]')) {
        event.preventDefault();
        const to = event.key === 'ArrowRight' ? (turnTicks.find(t => t > tick + 0.5) ?? max) : (turnTicks.findLast(t => t < tick - 0.5) ?? 0);
        pause();
        commit(to);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [turnTicks, tick, max]);

  // Events left to right; one closer than a mark's width to the last shares its mark
  const marks = useMemo(() => {
    const out: Mark[] = [];
    if (width === 0 || max === 0) return out;
    const events = run.events
      .filter((e): e is Marked => e.kind === 'quest' || (e.kind === 'attempt' && e.attempt > 1))
      .sort((a, b) => a.tick - b.tick);
    for (const e of events) {
      if (e.tick > max) continue;
      const left = (Math.min(e.tick, max) / max) * width;
      const last = out[out.length - 1];
      if (last && left - last.left < MARK + 2) last.events.push(e);
      else out.push({ left, tick: e.tick, events: [e] });
    }
    return out;
  }, [run.events, width, max]);

  const label = measure === 'ticks' ? `${formatInt(Math.round(tick))} ticks` : formatClock(clock.toSeconds(tick));
  return (
    <div className="flex w-full flex-wrap items-center gap-x-3 gap-y-2">
      <Tooltip>
        <TooltipTrigger asChild>
          <Button variant="outline" size="icon-sm" onClick={toggle} aria-label={head.playing ? 'Pause' : 'Play'} aria-keyshortcuts="Space">
            {head.playing ? <PauseIcon className="fill-current" /> : <PlayIcon className="fill-current" />}
          </Button>
        </TooltipTrigger>
        <TooltipContent>
          {head.playing ? 'Pause' : 'Play'} <Kbd>Space</Kbd>
        </TooltipContent>
      </Tooltip>
      <div className="order-first flex min-w-0 basis-full flex-col gap-1 sm:order-none sm:basis-0 sm:flex-1">
        {marks.length > 0 && (
          <div className="relative h-4">
            {marks.map(m => (
              <EventMark key={`${m.events[0].kind}-${m.tick}`} mark={m} />
            ))}
          </div>
        )}
        <div ref={trackRef} className="flex flex-col gap-1">
          <Slider
            aria-label="Playhead"
            min={0}
            max={max}
            step={1}
            value={[Math.min(max, Math.round(tick))]}
            onValueChange={([v]) => {
              pause();
              seek(v);
            }}
            onValueCommit={([v]) => commit(v)}
          />
          {/* The run's chapters (site/summarize.py) as segments under the track: a click starts one */}
          {chapters && chapters.length > 0 && max > 0 && (
            <ol className="relative flex h-1.5 gap-px" aria-label="Chapters">
              {chapters.map((c, i) => {
                const current = tick >= c.from_tick && (tick < c.to_tick || i === chapters.length - 1);
                return (
                  <li key={c.from_tick} className="flex min-w-0" style={{ width: `${(Math.min(max, c.to_tick) - Math.min(max, c.from_tick)) / max * 100}%` }}>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          variant="ghost"
                          aria-label={c.title}
                          onClick={() => {
                            pause();
                            commit(c.from_tick);
                          }}
                          className={cn('h-full w-full rounded-full border-0 p-0 hover:bg-foreground/40 active:not-aria-[haspopup]:translate-y-0', current ? 'bg-primary' : 'bg-muted-foreground/25')}
                        />
                      </TooltipTrigger>
                      <TooltipContent>{c.title}</TooltipContent>
                    </Tooltip>
                  </li>
                );
              })}
            </ol>
          )}
        </div>
      </div>
      <span className="text-sm text-muted-foreground tabular-nums">{label}</span>
      <ToggleGroup
        type="single"
        size="sm"
        value={speed}
        onValueChange={v => v && update({ speed: v === auto ? undefined : (v as '1' | '4' | '16' | '64') })}
        aria-label="Playback speed"
        className="ml-auto"
      >
        {SPEEDS.map(s => (
          <ToggleGroupItem key={s} value={String(s)} className="tabular-nums">
            {s}×
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
    </div>
  );
}
