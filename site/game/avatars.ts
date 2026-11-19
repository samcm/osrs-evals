// A render of each run's character, from its world recording (site/public/data/runs/<id>.world.jsonl.gz):
// the run account's last appearance, drawn by the webclient as
//   <id>.avatar.png  full body, 156x260, transparent
//   <id>.head.png    dialogue chat head, 160x160, transparent
// Runs that already have both are skipped (FORCE=1 redraws). Needs the cache, so it runs in the rs-sdk
// image: `site/game/build.sh avatars` (or RS_SDK=<checkout with a built pack> bun site/game/avatars.ts).
import fs from 'fs';
import zlib from 'zlib';
import { type Appearance, decodeAppearance, encodePng, loadViewer, playerHeadModel, renderChatHead } from './lib.ts';

const RUNS = process.env.RUNS ?? '/site/public/data/runs';
const FORCE = process.env.FORCE === '1';
const norm = (s: string) => s.toLowerCase().replace(/[\s_]+/g, '_');

const todo = fs.readdirSync(RUNS).filter(f => f.endsWith('.world.jsonl.gz')).map(f => f.slice(0, -'.world.jsonl.gz'.length))
    .filter(id => FORCE || !fs.existsSync(`${RUNS}/${id}.avatar.png`) || !fs.existsSync(`${RUNS}/${id}.head.png`));
if (todo.length === 0) {
    console.log('avatars: nothing to do');
    process.exit(0);
}
const v = await loadViewer();
let made = 0;
for (const id of todo) {
    let account: string | null = null;
    try {
        account = JSON.parse(fs.readFileSync(`${RUNS}/${id}.json`, 'utf8')).account ?? null;
    } catch {
        // no run detail: take whichever player appears
    }
    let last: Appearance | null = null, any: Appearance | null = null;
    for (const line of zlib.gunzipSync(fs.readFileSync(`${RUNS}/${id}.world.jsonl.gz`)).toString().split('\n')) {
        if (!line.includes('"ap"')) continue;
        const msg = JSON.parse(line);
        for (const p of msg.p ?? []) {
            if (!p.ap) continue;
            try {
                const app = decodeAppearance(p.ap);
                any = app;
                if (account && norm(app.name) === norm(account)) last = app;
            } catch {
                // transmogrified: keep the last real body
            }
        }
    }
    const app = last ?? any;
    if (!app) {
        console.log(`${id}: no appearance in the recording`);
        continue;
    }
    const body = v.renderPlayerSprite(app, 156, 260, 128);
    if (body) fs.writeFileSync(`${RUNS}/${id}.avatar.png`, encodePng(body.data, body.wi, body.hi));
    const head = await renderChatHead(await playerHeadModel(app));
    if (head) fs.writeFileSync(`${RUNS}/${id}.head.png`, encodePng(head, 160, 160));
    made++;
}
console.log(`avatars: ${made} of ${todo.length} runs`);
process.exit(0);
