// bun logout.ts name...  Log accounts out with the game's logout button, so the engine saves them
// at once (dropping the socket instead keeps the player in the world for 500 ticks). Waits until
// each account has left the world and its save file is newer than the click.
import { BotSDK } from '/opt/sdk/index';
import { statSync } from 'fs';

const PLAYERS = '/opt/server/data/players/main';
const LOGOUT_BUTTON = 2458;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const mtime = (name: string) => { try { return statSync(`${PLAYERS}/${name}.sav`).mtimeMs; } catch { return 0; } };
const online = async () => new Set(((await (await fetch('http://localhost:8888/playerpositions')).json()) as { name: string }[]).map((p) => p.name.toLowerCase()));

async function logout(name: string): Promise<string> {
    const sdk = new BotSDK({ botUsername: name, password: 'pw', gatewayUrl: 'ws://localhost:7780', connectionMode: 'control', autoReconnect: false, autoLaunchBrowser: false, showChat: false });
    const clicked = Date.now();
    try {
        await Promise.race([sdk.connect(), sleep(15_000).then(() => { throw new Error('connect timeout'); })]);
        // The engine refuses to log out for ~10 s after combat, so keep clicking.
        for (let i = 0; i < 60; i++) {
            sdk.sendClickComponent(LOGOUT_BUTTON).catch(() => {});
            await sleep(1000);
            if (!(await online()).has(name.toLowerCase())) break;
        }
    } catch (e) {
        console.error(`${name}: ${e}`);
    } finally {
        sdk.disconnect().catch(() => {});
    }
    for (let i = 0; i < 60; i++) {
        if (!(await online()).has(name.toLowerCase()) && mtime(name) >= clicked) return 'saved';
        await sleep(1000);
    }
    return 'not saved';
}

const names = process.argv.slice(2);
const results = await Promise.all(names.map(logout));
console.log(JSON.stringify(Object.fromEntries(names.map((n, i) => [n, results[i]]))));
process.exit(0);
