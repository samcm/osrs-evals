/**
 * The game itself, in the browser: the run's world recording drawn by Max Bittker's rs-world
 * (served at /world/ by viewer/serve.ts), its camera following the agent's character, always at the
 * playhead (playhead.ts).
 *
 * rs-world streams the world from serve.ts (`/feed/<run>?drive=<session>`), and this component steers
 * that stream over a second socket (`?control=<session>`): it sends the engine tick to show and how
 * long a tick lasts at the current speed. serve.ts sends the ticks in between when the playhead moves
 * a little forward (playing), and the world as it was at that tick when it jumps (seek, scrub back),
 * so rs-world itself is unchanged. Without serve.ts (a static host) or a recording, the run's end
 * screenshot stands in. The playback bar (Playback.tsx) attaches under it: the player has the top
 * corners of the pair, the bar the bottom ones.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import type { RunDetail } from '@/data/types';
import { cn } from '@/lib/utils';
import { REAL_TIME, TRANSITION_MS, type Playhead } from './playhead';

/** rs-world's own panels (minimap, live list, render settings, joysticks): the site has its own controls */
const HIDE_RS_WORLD_UI = '.hud, .live-hud, .joystick-container, .map-viewer > [class*="leva-c-"] { display: none !important; }';

/** How often the playhead is sent while it moves */
const SEND_MS = 50;
/** A move of more than this many ticks forward, or any move back, rebuilds the world (serve.ts) */
const STREAM_AHEAD = 200;

type Status = 'loading' | 'ready' | 'unavailable';

export function Player({ run, head }: { run: RunDetail; head: Playhead }) {
  const [status, setStatus] = useState<Status>(run.has_replay ? 'loading' : 'unavailable');
  const session = useMemo(() => `${run.id}-${Math.random().toString(36).slice(2)}`, [run.id]);
  const send = useControl(run, session, setStatus);

  // The tick to show, in the recording's engine ticks, and a tick's length at the playing speed. The
  // game follows the playhead, not the lanes' hover: rebuilding the world for a preview is too much.
  const k = (run.start_tick ?? 0) + Math.floor(head.at);
  const ms = 1000 / (head.playing ? head.speed : REAL_TIME);
  const shown = useRef<number | null>(null);
  const [dipped, setDipped] = useState(false);
  useEffect(() => {
    const from = shown.current;
    shown.current = k;
    // A jump (a click, not a drag or playing) rebuilds the world: dip to black over it
    const jump = status === 'ready' && from != null && !head.playing && head.scrub == null && (k < from || k - from > STREAM_AHEAD);
    if (!jump) {
      send(k, ms);
      setDipped(false);
      return;
    }
    setDipped(true);
    const rebuild = setTimeout(() => send(k, ms), TRANSITION_MS);
    const reveal = setTimeout(() => setDipped(false), TRANSITION_MS * 3);
    return () => {
      clearTimeout(rebuild);
      clearTimeout(reveal);
    };
  }, [send, k, ms]);

  const src = useMemo(() => {
    const ws = window.location.protocol === 'https:' ? 'wss' : 'ws';
    const feed = `${ws}://${window.location.host}/feed/${encodeURIComponent(run.id)}?drive=${session}`;
    return `/world/?live=${encodeURIComponent(feed)}&follow=${encodeURIComponent(run.account)}`;
  }, [run.id, run.account, session]);

  const frame = useRef<HTMLIFrameElement>(null);
  const drawn = useDrawn(frame, status === 'ready');

  const shot = run.screenshot ? `/data/${run.screenshot}` : null;
  const still = (alt: string) => shot && <img src={shot} alt={alt} className="absolute inset-0 size-full object-cover" />;
  if (status === 'unavailable') return <div className="relative aspect-video w-full overflow-hidden rounded-t-xl bg-muted">{still('The game at the end of the run')}</div>;
  return (
    <div className="relative aspect-video w-full overflow-hidden rounded-t-xl bg-muted">
      {/* Until rs-world has drawn the character: the closest frame we have, dimmed and breathing */}
      <div className={cn('absolute inset-0 animate-pulse transition-opacity duration-150', drawn && 'opacity-0')}>
        <div className="size-full opacity-40">{still('')}</div>
      </div>
      <iframe
        ref={frame}
        key={session}
        src={src}
        title="The game"
        tabIndex={-1}
        onLoad={e => hideRsWorldUi(e.currentTarget)}
        className={cn('pointer-events-none relative size-full border-0 opacity-0 transition-[opacity,filter] duration-150', drawn && 'opacity-100', dipped && 'brightness-0')}
      />
    </div>
  );
}

/** How long to wait for the character before showing the world anyway (it may not have joined yet) */
const DRAWN_TIMEOUT_MS = 30_000;
const SETTLE_MS = 1000;

/**
 * Whether rs-world has drawn the world around the character: its overlay canvas (names, chat) has
 * the followed name on it once the character stands on loaded ground. Until then its GL canvas is
 * black. Polled while `active` (the feed is connected), at a tiny scale.
 */
function useDrawn(frame: React.RefObject<HTMLIFrameElement | null>, active: boolean): boolean {
  const [drawn, setDrawn] = useState(false);
  useEffect(() => {
    setDrawn(false);
    if (!active) return;
    const probe = document.createElement('canvas');
    probe.width = 64;
    probe.height = 36;
    const ctx = probe.getContext('2d', { willReadFrequently: true });
    const started = performance.now();
    let reveal: ReturnType<typeof setTimeout> | undefined;
    const timer = setInterval(() => {
      const overlay = frame.current?.contentDocument?.querySelector<HTMLCanvasElement>('canvas.live-overlay');
      let seen = performance.now() - started > DRAWN_TIMEOUT_MS;
      if (!seen && overlay && ctx && overlay.width > 0) {
        ctx.clearRect(0, 0, probe.width, probe.height);
        ctx.drawImage(overlay, 0, 0, probe.width, probe.height);
        const { data } = ctx.getImageData(0, 0, probe.width, probe.height);
        for (let i = 3; i < data.length && !seen; i += 4) seen = data[i] > 0;
      }
      if (seen) {
        clearInterval(timer);
        // The ground near the camera streams in just after the character
        reveal = setTimeout(() => setDrawn(true), SETTLE_MS);
      }
    }, 250);
    return () => {
      clearInterval(timer);
      clearTimeout(reveal);
    };
  }, [frame, active]);
  return drawn;
}

/** rs-world is served from this origin, so its panels can be hidden from here without changing it. */
function hideRsWorldUi(frame: HTMLIFrameElement): void {
  const doc = frame.contentDocument;
  if (!doc || doc.getElementById('site-player')) return;
  const style = doc.createElement('style');
  style.id = 'site-player';
  style.textContent = HIDE_RS_WORLD_UI;
  doc.head.append(style);
}

/**
 * The control socket for one session: returns `send(k, ms)`, which sends the latest playhead at most
 * every SEND_MS. Reports 'ready' once rs-world's feed is connected, and 'unavailable' when there is no
 * serve.ts to talk to.
 */
function useControl(run: RunDetail, session: string, setStatus: (status: Status) => void): (k: number, ms: number) => void {
  const latest = useRef<{ k: number; ms: number } | null>(null);
  const socket = useRef<WebSocket | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sentAt = useRef(0);
  const sent = useRef('');

  const flush = useRef(() => {
    timer.current = null;
    const ws = socket.current;
    if (!latest.current || ws?.readyState !== WebSocket.OPEN) return;
    const message = JSON.stringify(latest.current);
    if (message === sent.current) return;
    ws.send(message);
    sent.current = message;
    sentAt.current = performance.now();
  }).current;

  useEffect(() => {
    setStatus(run.has_replay ? 'loading' : 'unavailable');
    if (!run.has_replay) return;
    let closed = false;
    let opened = false;
    let retry: ReturnType<typeof setTimeout> | undefined;
    const open = (): void => {
      const ws = new WebSocket(`${window.location.protocol === 'https:' ? 'wss' : 'ws'}://${window.location.host}/feed/${encodeURIComponent(run.id)}?control=${session}`);
      socket.current = ws;
      ws.onopen = () => {
        opened = true;
        sent.current = '';
        flush();
      };
      ws.onmessage = e => {
        if (JSON.parse(String(e.data)).t === 'ready') setStatus('ready');
      };
      ws.onclose = e => {
        if (closed) return;
        // Nothing serves the feed here (a static host), or it has no recording: show the still instead
        if (!opened || e.code === 1011) return setStatus('unavailable');
        retry = setTimeout(open, 1000);
      };
    };
    open();
    return () => {
      closed = true;
      clearTimeout(retry);
      if (timer.current) clearTimeout(timer.current);
      socket.current?.close();
      socket.current = null;
    };
  }, [run.id, run.has_replay, session, setStatus, flush]);

  return useRef((k: number, ms: number) => {
    latest.current = { k, ms };
    if (timer.current) return;
    const wait = SEND_MS - (performance.now() - sentAt.current);
    if (wait <= 0) flush();
    else timer.current = setTimeout(flush, wait);
  }).current;
}
