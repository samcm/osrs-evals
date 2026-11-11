// bun sample.ts name...  ->  {"tick": n, "accounts": {name: account}}
// The engine's current tick (from its world feed greeting) and every account as of its latest
// save. During a run the engine autosaves every SAVE_EVERY_TICKS, so this is the score over time.
import { readSave } from './saves';

const PLAYERS = '/opt/server/data/players/main';

const tick = await new Promise<number | null>((resolve) => {
    const ws = new WebSocket('ws://localhost:8888/worldfeed');
    ws.onmessage = (e) => {
        const m = JSON.parse(String(e.data));
        if (m.t === 'hello') resolve(m.tick), ws.close();
    };
    ws.onerror = () => resolve(null);
    setTimeout(() => resolve(null), 5000);
});

const accounts: Record<string, ReturnType<typeof readSave>> = {};
for (const name of process.argv.slice(2)) {
    for (let attempt = 0; attempt < 3; attempt++) {
        try {
            accounts[name] = readSave(new Uint8Array(await Bun.file(`${PLAYERS}/${name}.sav`).arrayBuffer()));
            break;
        } catch {
            await Bun.sleep(100); // caught mid-write
        }
    }
}
console.log(JSON.stringify({ tick, accounts }));
process.exit(0);
