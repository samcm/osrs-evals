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

let done = 0;
for (const run of index.runs) {
    const out = `${DATA}/runs/${run.id}.jpg`;
    if (!run.has_replay || run.start_tick == null || (existsSync(out) && !redo)) continue;
    // With several tries, `ticks` counts from the start of the best try; show the game's last tick.
    const tick = run.start_tick + (run.attempts > 1 ? run.game_ticks : (run.ticks ?? run.game_ticks ?? 0));
    const feed = `${base.replace(/^http/, 'ws')}/feed/${run.id}?from=${tick}&until=${tick}`;
    // A fresh browser per run: rs-world keeps the map it has streamed, and a long session grows.
    ab('open', `${base}/world/?live=${encodeURIComponent(feed)}&follow=${run.account}`);
    ab('set', 'viewport', '1600', '900', '1');
    // rs-world loads the map around the followed player, then draws it.
    const loaded = ab('wait', '--text', 'Following').exitCode === 0;
    const png = `/tmp/capture-${run.id}.png`;
    // Then wait until the map is drawn: a frame that is not mostly black.
    for (let i = 0; loaded && i < 10; i++) {
        await Bun.sleep(6_000);
        ab('screenshot', png);
        const mean = Number(Bun.spawnSync(['convert', png, '-colorspace', 'gray', '-format', '%[fx:mean]', 'info:']).stdout.toString());
        if (mean > 0.1) break;
    }
    ab('close');
    if (!loaded || !existsSync(png)) {
        console.error(`${run.id}: rs-world did not load the replay; no screenshot`);
        continue;
    }
    // The followed player is at the centre: keep the middle, which also leaves out rs-world's panels.
    Bun.spawnSync(['ffmpeg', '-loglevel', 'error', '-y', '-i', png, '-vf', 'crop=1120:630:240:95,scale=1280:720', '-q:v', '3', out]);
    console.log(`${run.id}: tick ${tick} -> ${out}`);
    done++;
}
console.log(`${done} screenshots`);
