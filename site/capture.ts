// Screenshots of each run in the game, from its recording, as rs-world draws it: the moment the
// run finished the eval, or its last tick. Needs the server (viewer/serve.ts) and agent-browser.
//
//   bun site/capture.ts [http://localhost:7576] [--all]
//
// Writes site/public/data/runs/<id>.jpg; run site/export.py again afterwards to list them.
import { existsSync } from 'fs';

const base = process.argv.find((a) => a.startsWith('http')) ?? 'http://localhost:7576';
const redo = process.argv.includes('--all');
const DATA = `${import.meta.dir}/public/data`;
const index = await Bun.file(`${DATA}/index.json`).json();
const ab = (...args: string[]) => Bun.spawnSync(['agent-browser', '--session', 'capture', ...args], { env: { ...process.env, AGENT_BROWSER_NAMESPACE: 'capture' } });

ab('open', 'about:blank');
ab('set', 'viewport', '1280', '720', '2');
let done = 0;
for (const run of index.runs) {
    const out = `${DATA}/runs/${run.id}.jpg`;
    if (!run.has_replay || run.start_tick == null || (existsSync(out) && !redo)) continue;
    const tick = run.start_tick + (run.ticks ?? run.game_ticks ?? 0);
    const feed = `${base.replace(/^http/, 'ws')}/feed/${run.id}?from=${tick}&until=${tick}`;
    ab('open', `${base}/world/?live=${encodeURIComponent(feed)}&follow=${run.account}`);
    // rs-world loads the map around the followed player, then draws it.
    ab('wait', '--text', 'Following');
    await Bun.sleep(12_000);
    const png = `/tmp/capture-${run.id}.png`;
    ab('screenshot', png);
    if (!existsSync(png)) {
        console.error(`${run.id}: no screenshot`);
        continue;
    }
    // The followed player is at the centre: keep the middle, which also leaves out rs-world's panels.
    Bun.spawnSync(['ffmpeg', '-loglevel', 'error', '-y', '-i', png, '-vf', 'crop=1440:810:560:280,scale=1280:720', '-q:v', '4', out]);
    console.log(`${run.id}: tick ${tick} -> ${out}`);
    done++;
}
ab('close');
console.log(`${done} screenshots`);
