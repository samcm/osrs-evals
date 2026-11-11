// bun record.ts out.jsonl name...  Record the engine's world feed (what rs-world draws) around
// the eval's accounts, one JSON message per line, as the engine sent it. The recorded area follows
// the accounts: it covers all of them (up to the feed's 384-tile limit), and moves when one nears
// its edge. The roster (every online player, every 10 ticks) is recorded too.
import { appendFileSync, writeFileSync } from 'fs';

const [out, ...names] = process.argv.slice(2);
const wanted = new Set(names.map((n) => n.toLowerCase()));
const PAD = 40, MIN = 104, MAX = 384, MARGIN = 16;

writeFileSync(out, '');
let buffered: string[] = [];
const flush = () => { if (buffered.length) appendFileSync(out, buffered.join('\n') + '\n'), (buffered = []); };
setInterval(flush, 1000);
for (const sig of ['SIGTERM', 'SIGINT'] as const) process.on(sig, () => (flush(), process.exit(0)));

let area: { x: number; z: number; w: number; h: number } | null = null;
const ws = new WebSocket('ws://localhost:8888/worldfeed');

function follow(positions: [number, number][]) {
    if (!positions.length) return;
    const xs = positions.map((p) => p[0]), zs = positions.map((p) => p[1]);
    const inside = area && positions.every(([x, z]) => x >= area!.x + MARGIN && x < area!.x + area!.w - MARGIN && z >= area!.z + MARGIN && z < area!.z + area!.h - MARGIN);
    if (inside) return;
    const span = (lo: number, hi: number) => Math.min(MAX, Math.max(MIN, hi - lo + 2 * PAD));
    const w = span(Math.min(...xs), Math.max(...xs)), h = span(Math.min(...zs), Math.max(...zs));
    const cx = (Math.min(...xs) + Math.max(...xs)) >> 1, cz = (Math.min(...zs) + Math.max(...zs)) >> 1;
    area = { x: cx - (w >> 1), z: cz - (h >> 1), w, h };
    ws.send(JSON.stringify({ t: 'sub', ...area }));
}

// Roster rows are [slot, name, x, z, level, combat]; later ones are deltas keyed by slot.
const slots = new Map<number, [number, number]>();
ws.onopen = () => ws.send(JSON.stringify({ t: 'roster', on: true }));
ws.onmessage = (e) => {
    const text = String(e.data);
    buffered.push(text);
    const m = JSON.parse(text);
    if (m.t !== 'roster') return;
    for (const [slot, name, x, z] of m.p ?? m.j ?? []) wanted.has(String(name).toLowerCase()) ? slots.set(slot, [x, z]) : slots.delete(slot);
    for (const slot of m.lv ?? []) slots.delete(slot);
    for (const [slot, x, z] of m.m ?? []) if (slots.has(slot)) slots.set(slot, [x, z]);
    follow([...slots.values()]);
};
ws.onclose = () => (flush(), process.exit(0));
setInterval(() => ws.readyState === WebSocket.OPEN && ws.send(JSON.stringify({ t: 'ping' })), 30_000);
