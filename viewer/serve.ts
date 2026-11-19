// Serves the eval site, its data, Max's rs-world, and world feeds for it.
//
//   bun viewer/serve.ts     SITE=site/dist  DATA=site/public/data  WORLD=<rs-world build>  RUNS=logs  PORT=7576
//
// GET /...                 the site (single-page app: unknown paths get index.html)
// GET /data/...            the exported runs (site/export.py)
// GET /world/...           rs-world, with the cross-origin isolation headers it needs
// GET /api/live            samples running now (from live.json files under RUNS)
// WS  /feed/<run id>       a finished run's recording, replayed at the pace it was recorded:
//                          ?speed=4 plays faster, ?from=<tick> skips ahead, ?until=<tick> stops there
// WS  /feed/<run id>?drive=<session>    the recording at a page's playhead (rs-world connects here)
// WS  /feed/<run id>?control=<session>  the page's playhead: it sends {k, ms}, the engine tick to
//                          show and how long a tick lasts now; it hears {t: 'ready'} once rs-world
//                          is connected. Moving forward a little sends the ticks in between, as the
//                          engine did; anything else sends the world as it was at k, from scratch.
// WS  /feed/live/<path>    a running sample's live world feed, relayed from the engine's port
import { existsSync, readdirSync, readFileSync, statSync } from 'fs';
import { join, normalize, relative } from 'path';

const SITE = process.env.SITE ?? 'site/dist';
const DATA = process.env.DATA ?? 'site/public/data';
const WORLD = process.env.WORLD ?? 'viewer/world';
const RUNS = process.env.RUNS ?? 'logs';
const PORT = Number(process.env.PORT ?? 7576);
const FEED_HOST = process.env.FEED_HOST ?? '127.0.0.1'; // where the sandboxes' published ports are

const ISOLATION = { 'Cross-Origin-Opener-Policy': 'same-origin', 'Cross-Origin-Embedder-Policy': 'require-corp' };

function inside(root: string, path: string): string | null {
    const file = normalize(join(root, decodeURIComponent(path)));
    return file.startsWith(normalize(root)) ? file : null;
}

function file(root: string, path: string, fallback?: string, headers: Record<string, string> = {}): Response {
    let f = inside(root, path);
    if (!f || !existsSync(f) || statSync(f).isDirectory()) f = fallback ? join(root, fallback) : null;
    if (!f || !existsSync(f)) return new Response('not found', { status: 404 });
    const cache = f.endsWith('index.html') ? 'no-cache' : 'public, max-age=300';
    return new Response(Bun.file(f), { headers: { 'Cache-Control': cache, 'Cross-Origin-Resource-Policy': 'same-origin', ...headers } });
}

type Live = { path: string; port: number; accounts: string[] };

function liveRuns(dir = RUNS, out: Live[] = []): Live[] {
    if (!existsSync(dir)) return out;
    for (const name of readdirSync(dir)) {
        const path = join(dir, name);
        if (!statSync(path).isDirectory()) continue;
        const live = join(path, 'live.json');
        if (existsSync(live)) out.push({ path: relative(RUNS, path), ...JSON.parse(readFileSync(live, 'utf8')) });
        else liveRuns(path, out);
    }
    return out;
}

// The live runs whose engine still answers (a sample that errored can leave its live.json behind).
async function liveNow(): Promise<Live[]> {
    const up = await Promise.all(liveRuns().map((l) => fetch(`http://${FEED_HOST}:${l.port}/api/version`, { signal: AbortSignal.timeout(500) }).then((r) => r.ok, () => false)));
    return liveRuns().filter((_, i) => up[i]);
}

type Feed = { kind: 'replay' | 'live' | 'drive' | 'control'; target: string; speed: number; from: number; until: number; session?: string; upstream?: WebSocket; timer?: ReturnType<typeof setTimeout>; closed?: boolean };

Bun.serve<Feed>({
    port: PORT,
    idleTimeout: 120,
    fetch(req, server) {
        const url = new URL(req.url);
        const p = url.pathname;
        if (p.startsWith('/feed/')) {
            const rest = p.slice('/feed/'.length);
            const num = (k: string, d: number) => Number(url.searchParams.get(k) ?? d);
            const drive = url.searchParams.get('drive'), control = url.searchParams.get('control');
            const data: Feed = rest.startsWith('live/')
                ? { kind: 'live', target: decodeURIComponent(rest.slice('live/'.length)), speed: 1, from: 0, until: Infinity }
                : drive || control
                  ? { kind: drive ? 'drive' : 'control', target: decodeURIComponent(rest), session: (drive || control)!, speed: 1, from: 0, until: Infinity }
                  : { kind: 'replay', target: decodeURIComponent(rest), speed: num('speed', 1), from: num('from', 0), until: num('until', Infinity) };
            return server.upgrade(req, { data }) ? undefined : new Response('websocket expected', { status: 400 });
        }
        if (p === '/api/live') return liveNow().then((l) => Response.json(l));
        if (p.startsWith('/data/')) return file(DATA, p.slice('/data/'.length));
        if (p === '/world' || p.startsWith('/world/')) return file(WORLD, p.replace(/^\/world\/?/, ''), 'index.html', ISOLATION);
        return file(SITE, p, 'index.html');
    },
    websocket: {
        open(ws) {
            const d = ws.data;
            if (d.kind === 'live') {
                const live = liveRuns().find((l) => l.path === d.target);
                if (!live) return ws.close(1011, 'not running');
                // Relay both ways, so rs-world picks its own area as it does on the engine.
                const up = new WebSocket(`ws://${FEED_HOST}:${live.port}/worldfeed`);
                d.upstream = up;
                up.onmessage = (e) => ws.send(String(e.data));
                up.onclose = () => ws.close();
                return;
            }
            if (d.kind === 'drive' || d.kind === 'control') return attach(ws);
            const rec = inside(join(DATA, 'runs'), `${d.target}.world.jsonl.gz`);
            if (!rec || !existsSync(rec)) return ws.close(1011, 'no recording');
            replay(ws, rec);
        },
        message(ws, msg) {
            if (ws.data.kind === 'control') return steer(ws, String(msg));
            const up = ws.data.upstream;
            if (up?.readyState === WebSocket.OPEN) up.send(String(msg));
            else if (up) up.addEventListener('open', () => up.send(String(msg)), { once: true });
            // A replay ignores the viewer's requests: the recording is the area it was recorded with.
        },
        close(ws) {
            detach(ws);
            ws.data.closed = true;
            ws.data.upstream?.close();
            clearTimeout(ws.data.timer);
        },
    },
});

// Send the recorded messages at the pace the engine sent them: one tick every tickMs / speed.
// Everything before `from` goes at once (so the viewer has the state at that tick), and nothing
// after `until` is sent.
function replay(ws: any, path: string) {
    const lines = new TextDecoder().decode(Bun.gunzipSync(readFileSync(path))).split('\n').filter(Boolean);
    const { speed, from, until } = ws.data as Feed;
    let i = 0, tickMs = 400, startTick = -1, startAt = 0;
    const step = () => {
        while (i < lines.length && !ws.data.closed) {
            const m = JSON.parse(lines[i]);
            if (m.t === 'hello') tickMs = m.tickMs;
            if (m.t === 'tick' || m.t === 'roster') {
                if (m.k > until) return;
                if (m.k >= from) {
                    if (startTick < 0) (startTick = m.k), (startAt = performance.now());
                    const due = startAt + ((m.k - startTick) * tickMs) / speed;
                    if (due > performance.now()) return void (ws.data.timer = setTimeout(step, due - performance.now()));
                }
            }
            ws.send(lines[i++]);
        }
    };
    step();
}

// The world as a feed viewer holds it at one tick: what rs-world needs to draw that tick from
// scratch. Built by folding the recording's messages; one-off effects (anims, hits, chat,
// projectiles) are left out, so a jump shows where everything is and how it looks.
type World = { players: Map<number, any>; npcs: Map<number, any>; roster: Map<number, any[]>; npcCount: number; area: any; locs: Map<number, any> };

const STEP_X = [-1, 0, 1, -1, 1, -1, 0, 1];
const STEP_Z = [1, 1, 1, 0, 0, -1, -1, -1];
const LOC_LAYER = [0, 0, 0, 0, 1, 1, 1, 1, 1, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 3];
const KEPT = ['x', 'z', 'l', 't', 'ap', 'fs', 'fe'] as const;

const emptyWorld = (): World => ({ players: new Map(), npcs: new Map(), roster: new Map(), npcCount: 0, area: null, locs: new Map() });

function foldEntity(into: Map<number, any>, r: any) {
    let e = r.f === 1 ? undefined : into.get(r.i);
    if (!e) into.set(r.i, (e = { i: r.i, f: 1, l: 0 }));
    if (r.m && r.x === undefined && e.x !== undefined) for (const d of r.m) (e.x += STEP_X[d]), (e.z += STEP_Z[d]);
    for (const k of KEPT) if (r[k] !== undefined) e[k] = r[k];
    if (e.fe === -1 || e.fe === 65535) delete e.fe;
}

function fold(w: World, m: any) {
    if (m.t === 'roster') {
        if (!m.d) w.roster = new Map(m.p.map((r: any[]) => [r[0], r]));
        else {
            for (const slot of m.lv) w.roster.delete(slot);
            for (const r of m.j) w.roster.set(r[0], r);
            for (const [slot, x, z, l, combat] of m.m) {
                const old = w.roster.get(slot);
                if (old) w.roster.set(slot, [slot, old[1], x, z, l, combat ?? old[5]]);
            }
        }
        w.npcCount = m.npcs;
        return;
    }
    if (m.t !== 'tick') return;
    if (m.reset) w.players.clear(), w.npcs.clear();
    for (const i of m.rp ?? []) w.players.delete(i);
    for (const i of m.rn ?? []) w.npcs.delete(i);
    for (const r of m.p ?? []) foldEntity(w.players, r);
    for (const r of m.n ?? []) foldEntity(w.npcs, r);
    for (const r of m.w ?? []) {
        if (r.e === 'za') {
            // Zones left are dropped; zones newly held start at the cache default (their state follows)
            const { x, z, w: width, h } = r;
            if (r.r) w.locs.clear();
            else for (const [key, l] of w.locs) if (l.x < x || l.x >= x + width || l.z < z || l.z >= z + h) w.locs.delete(key);
            w.area = { x, z, w: width, h };
        } else if (r.e === 'la' || r.e === 'ld') {
            w.locs.set(((r.l * 4 + (LOC_LAYER[r.s] ?? 2)) * 16384 + r.x) * 16384 + r.z, r);
        }
    }
}

// One recording, kept in memory while pages watch it: its lines as sent, the engine tick of each,
// and the world every KEYFRAME ticks so a jump folds at most that many ticks.
type Recording = { hello: any; lines: string[]; ticks: Float64Array; keys: { line: number; world: World }[] };
const KEYFRAME = 500;
const recordings = new Map<string, Recording>();

function recording(id: string): Recording | null {
    const cached = recordings.get(id);
    if (cached) return recordings.delete(id), recordings.set(id, cached), cached;
    const path = inside(join(DATA, 'runs'), `${id}.world.jsonl.gz`);
    if (!path || !existsSync(path)) return null;
    const lines = new TextDecoder().decode(Bun.gunzipSync(readFileSync(path))).split('\n').filter(Boolean);
    const ticks = new Float64Array(lines.length);
    const world = emptyWorld();
    const rec: Recording = { hello: { t: 'hello', v: 2, rev: 289, tick: 0, tickMs: 50, players: 0 }, lines, ticks, keys: [{ line: 0, world: structuredClone(world) }] };
    let next = KEYFRAME;
    lines.forEach((line, i) => {
        const m = JSON.parse(line);
        if (m.t === 'hello') return void ((rec.hello = m), (ticks[i] = -Infinity));
        ticks[i] = m.k;
        if (m.k >= next) rec.keys.push({ line: i, world: structuredClone(world) }), (next = m.k + KEYFRAME);
        fold(world, m);
    });
    recordings.set(id, rec);
    if (recordings.size > 4) recordings.delete(recordings.keys().next().value!);
    return rec;
}

// The messages that make a fresh rs-world connection show tick k: a hello (which clears it), the
// roster, and one reset tick with every entity and loc as first seen. Returns them and the index of
// the first line after k.
function snapshot(rec: Recording, k: number, ms: number): [string[], number] {
    let key = rec.keys[0];
    for (const c of rec.keys) if (c.line === 0 || rec.ticks[c.line - 1] <= k) key = c;
    const w = structuredClone(key.world);
    let i = key.line;
    for (; i < rec.lines.length && rec.ticks[i] <= k; i++) if (rec.ticks[i] > -Infinity) fold(w, JSON.parse(rec.lines[i]));
    const zone = w.area ? [{ e: 'za', ...w.area, r: 1 }, ...w.locs.values()] : [];
    return [
        [
            JSON.stringify({ ...rec.hello, tick: k }),
            JSON.stringify({ t: 'roster', k, p: [...w.roster.values()], npcs: w.npcCount }),
            JSON.stringify({ t: 'tick', k, ms, reset: 1, p: [...w.players.values()], n: [...w.npcs.values()], w: zone }),
        ],
        i,
    ];
}

// A page's playhead and the rs-world connection it drives. Either end may connect first, and
// rs-world reconnects on its own; the session lives as long as the page's control socket.
type Session = { run: string; control?: any; feed?: any; k: number | null; ms: number; next: number; sent: number };
const sessions = new Map<string, Session>();
// Further ahead than this, a jump beats sending every tick in between
const STREAM_AHEAD = 200;

function attach(ws: any) {
    const { session: id, target, kind } = ws.data as Feed;
    if (!recording(target)) return ws.close(1011, 'no recording');
    let s = sessions.get(id!);
    if (!s || s.run !== target) sessions.set(id!, (s = { run: target, k: null, ms: 50, next: 0, sent: -1 }));
    if (kind === 'control') s.control = ws;
    else s.feed?.close(), (s.feed = ws), (s.sent = -1);
    if (s.feed) s.control?.send(JSON.stringify({ t: 'ready' }));
    pump(s);
}

function detach(ws: any) {
    const { session: id, kind } = ws.data as Feed;
    const s = id ? sessions.get(id) : undefined;
    if (!s) return;
    if (kind === 'control' && s.control === ws) sessions.delete(id!), s.feed?.close();
    if (kind === 'drive' && s.feed === ws) (s.feed = undefined), (s.sent = -1);
}

function steer(ws: any, msg: string) {
    const s = sessions.get((ws.data as Feed).session!);
    let m: any;
    try {
        m = JSON.parse(msg);
    } catch {
        return;
    }
    if (!s || !Number.isFinite(m.k)) return;
    s.k = Math.floor(m.k);
    if (m.ms > 0) s.ms = m.ms;
    pump(s);
}

function pump(s: Session) {
    const rec = recording(s.run);
    if (!rec || !s.feed || s.k == null) return;
    if (s.sent < 0 || s.k < s.sent || s.k - s.sent > STREAM_AHEAD) {
        const [messages, next] = snapshot(rec, s.k, s.ms);
        for (const m of messages) s.feed.send(m);
        s.next = next;
    } else {
        const ms = `"ms":${Math.round(s.ms * 100) / 100}`;
        for (; s.next < rec.lines.length && rec.ticks[s.next] <= s.k; s.next++) {
            if (rec.ticks[s.next] > -Infinity) s.feed.send(rec.lines[s.next].replace(/"ms":[\d.]+/, ms));
        }
    }
    s.sent = s.k;
}

console.log(`eval site on http://localhost:${PORT} (site: ${SITE}, data: ${DATA}, rs-world: ${WORLD}, live runs under: ${RUNS})`);
