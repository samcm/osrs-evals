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
 * screenshot stands in, labelled as the end of the run, and the run doesn't start playing by itself. It fills the top of the player card, edge to edge; the playback bar
 * (Playback.tsx) is the card's footer.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import type { RunDetail } from '@/data/types';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { play, REAL_TIME, TRANSITION_MS, type Playhead } from './playhead';

/** rs-world's own panels (minimap, live list, render settings, joysticks): the site has its own controls */
const HIDE_RS_WORLD_UI = '.hud, .live-hud, .joystick-container, .map-viewer > [class*="leva-c-"] { display: none !important; }';

/** How often the playhead is sent while it moves */
const SEND_MS = 50;
/** A move of more than this many ticks forward, or any move back, rebuilds the world (serve.ts) */
const STREAM_AHEAD = 200;

type Status = 'loading' | 'ready' | 'unavailable';

export function Player({ run, head, autoplay, account }: { run: RunDetail; head: Playhead; autoplay: boolean; account: string }) {
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
    return `/world/?live=${encodeURIComponent(feed)}&follow=${encodeURIComponent(account)}`;
  }, [run.id, account, session]);

  const frame = useRef<HTMLIFrameElement>(null);
  const drawn = useDrawn(frame, status === 'ready');
  const hold = useRef<HTMLCanvasElement>(null);
  const holding = useHeldFrame(frame, hold, status === 'ready' && drawn && head.playing);

  // A run opened at no moment in particular plays from its start, once the game has drawn the world;
  // the next frame, so the page's playhead has its end. Without a live game (only the end's still)
  // nothing moves here, so it waits for the reader to press play
  const started = useRef(false);
  useEffect(() => {
    if (!autoplay || started.current || status !== 'ready' || !drawn) return;
    started.current = true;
    const frame = requestAnimationFrame(() => play());
    return () => cancelAnimationFrame(frame);
  }, [autoplay, status, drawn]);

  const shot = run.screenshot ? `/data/${run.screenshot}` : null;
  const still = (alt: string) => shot && <img src={shot} alt={alt} className="absolute inset-0 size-full object-cover" />;
  if (status === 'unavailable')
    return (
      <div className="relative aspect-video w-full overflow-hidden bg-muted">
        {still('The game at the end of the run')}
        {/* A still, not the game at the playhead: it says which moment it is */}
        {shot && (
          <Badge variant="secondary" className="absolute top-2 left-2">
            End of run
          </Badge>
        )}
      </div>
    );
  return (
    <div className="relative aspect-video w-full overflow-hidden bg-muted">
      {/* Until rs-world has drawn the character: the closest frame we have, dimmed and breathing */}
      <div className={cn('absolute inset-0 animate-pulse transition-opacity', drawn && 'opacity-0')}>
        <div className="size-full opacity-40">{still('')}</div>
      </div>
      <iframe
        ref={frame}
        key={session}
        src={src}
        title="The game"
        tabIndex={-1}
        onLoad={e => hideRsWorldUi(e.currentTarget)}
        className={cn('pointer-events-none relative size-full border-0 opacity-0 transition-[opacity,filter]', drawn && 'opacity-100', dipped && 'brightness-0')}
      />
      {/* While playing, the last frame that showed the character, over the game while it loads the next place */}
      <canvas ref={hold} aria-hidden className={cn('pointer-events-none absolute inset-0 size-full', !holding && 'invisible')} />
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

/** How often a frame that shows the character is kept, and the longest a kept frame stands in */
const HOLD_EVERY_MS = 250;
const HOLD_MAX_MS = 5000;
/** Mean brightness (0–255) below which a frame is the black of ground not loaded yet; underground scenes are about 10 */
const MIN_LIGHT = 3;

/**
 * Fast playback outruns rs-world: after a teleport or a long run it shows black or bare ground while
 * the next place loads. While `active`, this keeps the latest frame that showed the character (its
 * name on rs-world's overlay, over ground that has loaded) in `hold`, and returns true while the
 * live frame doesn't show it, for up to HOLD_MAX_MS, so the page shows the kept frame instead.
 *
 * A WebGL canvas can only be copied in the task that drew it, so the copy is made right after the
 * animation-frame callback that drew a frame: rs-world clears its overlay as it finishes each
 * frame, in the same callback. rs-world is same-origin, so its requestAnimationFrame and the
 * overlay's clearRect are wrapped from here, and unwrapped after.
 */
function useHeldFrame(frame: React.RefObject<HTMLIFrameElement | null>, hold: React.RefObject<HTMLCanvasElement | null>, active: boolean): boolean {
  const [holding, setHolding] = useState(false);
  useEffect(() => {
    setHolding(false);
    const win = frame.current?.contentWindow as (Window & typeof globalThis) | null;
    if (!active || !win?.CanvasRenderingContext2D) return;
    const doc = win.document;
    const probe = document.createElement('canvas');
    probe.width = 64;
    probe.height = 36;
    const pctx = probe.getContext('2d', { willReadFrequently: true })!;
    let drew = false;
    let checked = 0;
    let kept = 0;
    let held = false;

    const proto = win.CanvasRenderingContext2D.prototype;
    const clearRect = proto.clearRect;
    proto.clearRect = function (this: CanvasRenderingContext2D, ...args: Parameters<typeof clearRect>) {
      if (this.canvas.classList.contains('live-overlay')) drew = true;
      return clearRect.apply(this, args);
    };

    const after = (): void => {
      if (!drew) return;
      drew = false;
      const now = performance.now();
      if (now - checked < HOLD_EVERY_MS) return;
      checked = now;
      const overlay = doc.querySelector<HTMLCanvasElement>('canvas.live-overlay');
      const gl = [...doc.querySelectorAll<HTMLCanvasElement>('canvas:not(.live-overlay)')].sort((a, b) => b.width * b.height - a.width * a.height)[0];
      const out = hold.current;
      if (!overlay || !gl || !out || overlay.width === 0 || gl.width === 0) return;
      // The frame shows the character when its name is on the overlay and the ground has loaded
      // around it: not (nearly) all black
      pctx.clearRect(0, 0, probe.width, probe.height);
      pctx.drawImage(gl, 0, 0, probe.width, probe.height);
      const scene = pctx.getImageData(0, 0, probe.width, probe.height).data;
      let light = 0;
      for (let i = 0; i < scene.length; i += 4) light += scene[i] + scene[i + 1] + scene[i + 2];
      let seen = light / (scene.length * 0.75) >= MIN_LIGHT;
      if (seen) {
        // rs-world draws the followed character's name in orange (#ff981f), nothing else: other
        // players' names are white and npcs' chat yellow
        const names = overlay.getContext('2d')!.getImageData(0, 0, overlay.width, overlay.height).data;
        let orange = 0;
        for (let i = 0; i < names.length && orange < 4; i += 4)
          if (names[i + 3] > 128 && names[i] > 200 && names[i + 1] > 110 && names[i + 1] < 190 && names[i + 2] < 90) orange++;
        seen = orange >= 4;
      }
      if (seen) {
        if (out.width !== gl.width || out.height !== gl.height) [out.width, out.height] = [gl.width, gl.height];
        const ctx = out.getContext('2d')!;
        ctx.drawImage(gl, 0, 0);
        ctx.drawImage(overlay, 0, 0, gl.width, gl.height);
        kept = now;
      }
      const next = !seen && kept > 0 && now - kept < HOLD_MAX_MS;
      if (next !== held) setHolding((held = next));
    };

    const raf = win.requestAnimationFrame;
    win.requestAnimationFrame = callback =>
      raf.call(win, time => {
        try {
          callback(time);
        } finally {
          after();
        }
      });
    return () => {
      win.requestAnimationFrame = raf;
      proto.clearRect = clearRect;
    };
  }, [frame, hold, active]);
  return active && holding;
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
