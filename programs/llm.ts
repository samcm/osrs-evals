// An LLM plays each account. Every turn it sees the goal and the account's state as text, and
// replies with TypeScript that runs against rs-sdk: `bot` (high-level helpers) and `sdk`
// (low-level actions and state), the same interface rs-sdk's MCP execute_code gives agents.
// It talks to any OpenAI-compatible chat API: OPENAI_BASE_URL, OPENAI_API_KEY and MODEL (under
// Inspect with --model, the harness points OPENAI_BASE_URL at the eval's model).
import { BotSDK } from '/opt/sdk/index';
import { BotActions } from '/opt/sdk/actions';
import { formatWorldStateSummary } from '/opt/sdk/formatter';
import { initPathfinding } from '/opt/sdk/pathfinding';

const run = await Bun.file(process.env.EVAL!).json();
const BASE = process.env.OPENAI_BASE_URL ?? 'https://api.openai.com/v1';
const MODEL = process.env.MODEL ?? 'inspect';
const STEP_MS = 60_000; // longest a reply's code may run before the next turn
const api = await Bun.file('/opt/sdk/API.md').text();
const helpers = api.slice(api.indexOf('## BotActions'), api.indexOf('## BotSDK'));

const system = `You control a RuneScape (2004) account through code. Goal: ${run.goal}

Each turn you get the account's current state. Reply with one \`\`\`ts block: the body of an async
function with \`bot\` (high-level helpers) and \`sdk\` (low-level BotSDK, e.g. sdk.getState()) in
scope. Use \`log(...)\` to see values next turn. Keep each block short (it is stopped after
${STEP_MS / 1000}s); you get as many turns as time allows. The game keeps running between turns.

${helpers}`;

type Message = { role: 'system' | 'user' | 'assistant'; content: string };

async function chat(messages: Message[]): Promise<string> {
    const res = await fetch(`${BASE}/chat/completions`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${process.env.OPENAI_API_KEY ?? ''}` },
        body: JSON.stringify({ model: MODEL, messages }),
    });
    if (!res.ok) throw new Error(`model: ${res.status} ${await res.text()}`);
    return (await res.json()).choices[0].message.content ?? '';
}

const AsyncFunction = Object.getPrototypeOf(async () => {}).constructor;

async function play(account: { username: string; password: string }) {
    const sdk = new BotSDK({ botUsername: account.username, password: account.password, gatewayUrl: run.gateway, connectionMode: 'control', autoReconnect: true, autoLaunchBrowser: false });
    const bot = new BotActions(sdk);
    await sdk.connect();
    const history: Message[] = [];
    let feedback = '';
    for (let turn = 1; ; turn++) {
        const state = formatWorldStateSummary(sdk.getState()!);
        history.push({ role: 'user', content: `${feedback}\n\nState:\n${state}`.trim() });
        const reply = await chat([{ role: 'system', content: system }, ...history.slice(-12)]);
        history.push({ role: 'assistant', content: reply });
        const code = reply.match(/```(?:ts|typescript|js)?\n([\s\S]*?)```/)?.[1] ?? '';
        const out: string[] = [];
        const log = (...a: unknown[]) => out.push(a.map((x) => (typeof x === 'string' ? x : JSON.stringify(x))).join(' '));
        try {
            const result = await Promise.race([
                new AsyncFunction('bot', 'sdk', 'log', code)(bot, sdk, log),
                Bun.sleep(STEP_MS).then(() => { throw new Error(`still running after ${STEP_MS / 1000}s; stopped waiting`); }),
            ]);
            if (result !== undefined) log('returned', result);
            feedback = `Your code ran.${out.length ? `\nLog:\n${out.join('\n').slice(-3000)}` : ''}`;
        } catch (e) {
            feedback = `Your code failed: ${e}${out.length ? `\nLog:\n${out.join('\n').slice(-3000)}` : ''}`;
        }
        console.log(`[${account.username} turn ${turn}] ${code.split('\n').length} lines -> ${feedback.split('\n')[0]}`);
    }
}

initPathfinding();
await Promise.all(run.accounts.map(play));
