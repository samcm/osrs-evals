// The game view for eval runs: Max's rs-world (a 3D view of the world feed), pointed at a run.
//
//   bun viewer/serve.ts            RUNS=logs (Inspect's log dir)  WORLD=<rs-world build>  PORT=7576
//
// GET /            every sample under RUNS: its score over time, and a link to watch it
// GET /world/...   rs-world, served with the headers it needs (cross-origin isolation)
// WS  /feed/<run>  a running sample's live world feed (proxied from the engine's port, which the
//                  harness writes to live.json), or a finished sample's recording, replayed at the
//                  pace it was recorded. ?speed=4 plays faster, ?from=<tick> skips ahead.
import { existsSync, readdirSync, readFileSync, statSync } from 'fs';
import { join, normalize, relative } from 'path';

const RUNS = process.env.RUNS ?? 'logs';
const WORLD = process.env.WORLD ?? 'viewer/world';
const PORT = Number(process.env.PORT ?? 7576);
const FEED_HOST = process.env.FEED_HOST ?? '127.0.0.1'; // where the sandboxes' published ports are

type Run = { path: string; live?: { port: number; accounts: string[] }; sample?: any };

function findRuns(dir = RUNS, out: Run[] = []): Run[] {
    for (const name of readdirSync(dir)) {
        const path = join(dir, name);
        if (!statSync(path).isDirectory()) continue;
        const live = join(path, 'live.json'), sample = join(path, 'sample.json');
        if (existsSync(live) || existsSync(sample)) {
            out.push({
                path: relative(RUNS, path),
                live: existsSync(live) ? JSON.parse(readFileSync(live, 'utf8')) : undefined,
                sample: existsSync(sample) ? JSON.parse(readFileSync(sample, 'utf8')) : undefined,
            });
        } else findRuns(path, out);
    }
    return out;
}

function runDir(path: string): string | null {
    const dir = normalize(join(RUNS, decodeURIComponent(path)));
    return dir.startsWith(normalize(RUNS)) && existsSync(dir) ? dir : null;
}

const esc = (s: unknown) => String(s ?? '').replace(/[&<>"]/g, (c) => `&#${c.charCodeAt(0)};`);

function chart(timeline: { tick: number; value: number }[] = []): string {
    if (timeline.length < 2) return '';
    const W = 360, H = 80, maxT = Math.max(...timeline.map((p) => p.tick)) || 1, maxV = Math.max(...timeline.map((p) => p.value)) || 1;
    const pts = timeline.map((p) => `${((p.tick / maxT) * W).toFixed(1)},${(H - (p.value / maxV) * H).toFixed(1)}`).join(' ');
    return `<svg width="${W}" height="${H + 14}" viewBox="0 -2 ${W} ${H + 16}"><polyline fill="none" stroke="#f5a623" stroke-width="2" points="${pts}"/>` +
        `<text x="0" y="${H + 12}" font-size="10" fill="#999">tick 0</text><text x="${W}" y="${H + 12}" font-size="10" fill="#999" text-anchor="end">tick ${maxT}</text>` +
        `<text x="${W}" y="10" font-size="10" fill="#999" text-anchor="end">${maxV.toLocaleString()}</text></svg>`;
}

function index(): Response {
    const runs = findRuns().sort((a, b) => b.path.localeCompare(a.path));
    const rows = runs.map((r) => {
        const s = r.sample ?? {}, accounts = r.live?.accounts ?? (s.accounts ?? []).map((a: any) => a.username);
        const last = s.timeline?.at(-1);
        const watch = (name: string) => `<a href="#" onclick="watch('${esc(r.path)}','${esc(name)}');return false">${esc(name)}</a>`;
        return `<tr><td>${r.live ? '<b class=live>LIVE</b>' : 'recorded'}</td><td><code>${esc(r.path)}</code><br><small>${esc(s.game ? `ended by ${s.game.ended_by} after ${s.game.ticks} ticks` : "")}</small></td>` +
            `<td>${last ? `<b>${last.value.toLocaleString()}</b> at tick ${last.tick}` : ''}<br>${chart(s.timeline)}</td><td>watch ${accounts.map(watch).join(' · ')}</td></tr>`;
    });
    return new Response(`<!doctype html><meta charset=utf-8><title>Eval runs</title>
<style>body{font:14px system-ui;margin:24px;background:#111;color:#ddd}table{border-collapse:collapse}td{border-top:1px solid #333;padding:8px 12px;vertical-align:top}a{color:#7cf}.live{color:#f55}code{color:#fff}</style>
<h2>Eval runs</h2><p>Under <code>${esc(RUNS)}</code>. Watching opens rs-world on the run's world feed: live while it runs, the recording after.</p>
<table>${rows.join('') || '<tr><td>No runs yet.</td></tr>'}</table>
<script>function watch(run, name) {
  const feed = (location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host + '/feed/' + encodeURIComponent(run);
  location.href = '/world/?live=' + encodeURIComponent(feed) + '&follow=' + encodeURIComponent(name);
}</script>`, { headers: { 'content-type': 'text/html' } });
}

const ISOLATION = { 'Cross-Origin-Opener-Policy': 'same-origin', 'Cross-Origin-Embedder-Policy': 'require-corp' };

function world(path: string): Response {
    let file = normalize(join(WORLD, path.replace(/^\/world\/?/, '')));
    if (!file.startsWith(normalize(WORLD)) || !existsSync(file) || statSync(file).isDirectory()) file = join(WORLD, 'index.html');
    return new Response(Bun.file(file), { headers: ISOLATION });
}

type Feed = { upstream?: WebSocket; timer?: ReturnType<typeof setTimeout>; closed?: boolean };

Bun.serve<{ run: string; speed: number; from: number } & Feed>({
    port: PORT,
    fetch(req, server) {
        const url = new URL(req.url);
        if (url.pathname.startsWith('/feed/')) {
            const run = url.pathname.slice('/feed/'.length);
            if (!runDir(run)) return new Response('no such run', { status: 404 });
            const data = { run, speed: Number(url.searchParams.get('speed') ?? 1), from: Number(url.searchParams.get('from') ?? 0) };
            return server.upgrade(req, { data }) ? undefined : new Response('websocket expected', { status: 400 });
        }
        if (url.pathname === '/') return index();
        if (url.pathname.startsWith('/world')) return world(url.pathname);
        return new Response('not found', { status: 404 });
    },
    websocket: {
        open(ws) {
            const dir = runDir(ws.data.run)!;
            const live = join(dir, 'live.json');
            if (existsSync(live)) {
                // Live: relay both ways, so rs-world picks its own area like it does on the engine.
                const { port } = JSON.parse(readFileSync(live, 'utf8'));
                const up = new WebSocket(`ws://${FEED_HOST}:${port}/worldfeed`);
                ws.data.upstream = up;
                up.onmessage = (e) => ws.send(String(e.data));
                up.onclose = () => ws.close();
                return;
            }
            replay(ws, join(dir, 'world.jsonl.gz'));
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
function replay(ws: any, file: string) {
    if (!existsSync(file)) return ws.close(1011, 'no recording');
    const lines = new TextDecoder().decode(Bun.gunzipSync(readFileSync(file))).split('\n').filter(Boolean);
    let i = 0, tickMs = 400, firstTick = -1, started = performance.now();
    const step = () => {
        while (i < lines.length && !ws.data.closed) {
            const m = JSON.parse(lines[i]);
            if (m.t === 'hello') tickMs = m.tickMs;
            if (m.t === 'tick') {
                if (firstTick < 0) firstTick = m.k, started = performance.now();
                const due = started + ((m.k - firstTick - Math.max(0, ws.data.from - firstTick)) * tickMs) / ws.data.speed;
                if (m.k >= ws.data.from && due > performance.now()) return (ws.data.timer = setTimeout(step, due - performance.now()));
            }
            ws.send(lines[i++]);
        }
    };
    step();
}

console.log(`eval runs viewer on http://localhost:${PORT} (runs: ${RUNS}, rs-world: ${WORLD})`);
