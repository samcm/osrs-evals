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

type Feed = { kind: 'replay' | 'live'; target: string; speed: number; from: number; until: number; upstream?: WebSocket; timer?: ReturnType<typeof setTimeout>; closed?: boolean };

Bun.serve<Feed>({
    port: PORT,
    idleTimeout: 120,
    fetch(req, server) {
        const url = new URL(req.url);
        const p = url.pathname;
        if (p.startsWith('/feed/')) {
            const rest = p.slice('/feed/'.length);
            const num = (k: string, d: number) => Number(url.searchParams.get(k) ?? d);
            const data: Feed = rest.startsWith('live/')
                ? { kind: 'live', target: decodeURIComponent(rest.slice('live/'.length)), speed: 1, from: 0, until: Infinity }
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
            const rec = inside(join(DATA, 'runs'), `${d.target}.world.jsonl.gz`);
            if (!rec || !existsSync(rec)) return ws.close(1011, 'no recording');
            replay(ws, rec);
        },
        message(ws, msg) {
            const up = ws.data.upstream;
            if (up?.readyState === WebSocket.OPEN) up.send(String(msg));
            else if (up) up.addEventListener('open', () => up.send(String(msg)), { once: true });
            // A replay ignores the viewer's requests: the recording is the area it was recorded with.
        },
        close(ws) {
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

console.log(`eval site on http://localhost:${PORT} (site: ${SITE}, data: ${DATA}, rs-world: ${WORLD}, live runs under: ${RUNS})`);
