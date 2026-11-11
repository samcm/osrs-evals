"""The game side of the evals. Inspect does everything else: tasks, scoring, the agent (any solver,
chosen with --solver), the model (--model), where it runs (--sandbox), logs and the viewer.

game() is a task's setup: it starts a fresh world with the eval's accounts and settings, tells the
agent what it has, records the game, and ends the game at the tick budget or when the eval's done
condition holds, then has Inspect score the sample, whatever agent is running.

command() is an agent that runs any program (a script, a swarm, a CLI agent such as omp) with the
eval's accounts in $EVAL.
"""

import asyncio
import contextlib
import io
import json
import tarfile
import time

import fsspec
from pathlib import Path
from typing import Any, Callable

from inspect_ai.agent import sandbox_agent_bridge
from inspect_ai.log import transcript
from inspect_ai.log._samples import sample_active
from inspect_ai.model import ChatMessageUser, get_model
from inspect_ai.solver import solver
from inspect_ai.util import sandbox

REPO = Path(__file__).resolve().parent.parent
PLAYERS = "/opt/server/data/players/main"
OUT = "/run/out"

Accounts = dict[str, dict[str, Any]]  # account name -> its state, as saves.ts reads it

ABOUT = """\
This machine runs a RuneScape (2004) game server ({tick_ms} ms per game tick) with these accounts \
logged in, ready to use:

{accounts}

You have {budget:,} game ticks (about {minutes:g} minutes) from now. Then the accounts are logged \
out and the result is read from the server.

Control the accounts with rs-sdk, a TypeScript SDK at /opt/sdk (run with bun; docs in \
/opt/sdk/README.md and /opt/sdk/API.md). For example, /work/hello.ts:

    import {{ runScript }} from '/opt/sdk/runner';
    process.env.BOT_USERNAME = '{first}';
    process.env.PASSWORD = 'pw';
    await runScript(async ({{ bot, sdk }}) => console.log(sdk.getState()?.player));

run with `bun /work/hello.ts`. The same details are in the JSON file at $EVAL ({eval_path})."""


class Game:
    """One sample's game: its timeline, and the watchdog that ends it."""

    def __init__(self, names, track, done, sample_ticks, tick_ms, budget, run_dir):
        self.names, self.track, self.done = names, track, done
        self.sample_ticks, self.tick_ms, self.budget, self.run_dir = sample_ticks, tick_ms, budget, run_dir
        self.timeline: list[dict] = []
        self.start = 0
        self.began = time.monotonic()
        self.ended: dict | None = None
        self.lock = asyncio.Lock()
        self.watchdog: asyncio.Task | None = None


GAMES: dict[str, Game] = {}


@solver
def game(track: Callable[[Accounts], float] | None = None, done: Callable[[Accounts], bool] | None = None, sample_ticks: int = 100):
    """A task's setup: a fresh world for the sample, then the agent runs (any solver).

    track: the eval's measure of the accounts (for example coins held), recorded every
    sample_ticks from the server's saves as the score over time.
    done: the eval's finish condition on the accounts (for example a quest complete); the game
    ends as soon as a sample shows it, instead of at the budget.
    """

    async def solve(state, generate):
        sb, m = sandbox(), state.metadata
        accounts, world, budget = m["accounts"], m["world"], m["budget_ticks"]
        names = [a["username"] for a in accounts]
        tick_ms = int(world["NODE_TICKRATE"])

        # A fresh world with this eval's settings and start saves.
        await upload(sb, {"harness": "/harness", "saves": "/evals/saves", "programs": "/programs"})
        await sb.exec(["mkdir", "-p", PLAYERS, OUT, "/work"])
        for a in accounts:
            await sb.exec(["cp", f"/evals/saves/{a['save']}", f"{PLAYERS}/{a['username']}.sav"])
            await sb.write_file(f"/opt/bots/{a['username']}/bot.env", f"BOT_USERNAME={a['username']}\nPASSWORD=pw\nSERVER=localhost:8888\nGATEWAY_URL=ws://localhost:7780\n")
        await check(sb.exec(["/harness/start-world.sh"], env={**world, "SAVE_EVERY_TICKS": str(sample_ticks)}, timeout=600))
        await sb.exec(["sh", "-c", f"nohup bun /harness/record.ts {OUT}/world.jsonl {' '.join(names)} > {OUT}/record.log 2>&1 & echo $! > /run/record.pid"])
        g = GAMES[state.uuid] = Game(names, track, done, sample_ticks, tick_ms, budget, run_dir(state))
        await announce_live(sb, g.run_dir, names)

        # Each account in the game through rs-sdk's headless client.
        for name in names:
            await check(sb.exec(["/harness/client.sh", name], timeout=120))
        contract = {
            "goal": state.input_text,
            "accounts": [{"username": n, "password": "pw"} for n in names],
            "gateway": "ws://localhost:7780",
            "budget_ticks": budget,
            "tick_ms": tick_ms,
            "out": f"{OUT}/program",
        }
        await sb.write_file("/run/eval.json", json.dumps(contract))
        state.messages.append(ChatMessageUser(content=ABOUT.format(
            tick_ms=tick_ms, budget=budget, minutes=round(budget * tick_ms / 60000, 1), first=names[0], eval_path="/run/eval.json",
            accounts="\n".join(f"- {n} (password: pw)" for n in names),
        )))

        # The clock starts now: sample the accounts, and end the game at the budget or when done.
        g.start = await g_sample(sb, g)
        active = sample_active()

        async def watchdog():
            reason = "budget"
            end_tick, deadline = g.start + budget, time.monotonic() + 2 * budget * tick_ms / 1000 + 120
            now = g.start
            try:
                while True:
                    await asyncio.sleep(max(1, min(sample_ticks, end_tick - now)) * tick_ms / 1000)
                    now = await g_sample(sb, g, saved_every=sample_ticks)
                    if now >= end_tick:
                        break
                    if done and g.timeline and done(g.timeline[-1]["state"]):
                        reason = "done"
                        break
                    if time.monotonic() > deadline:
                        reason = "wall clock (the engine ran slower than its tick rate)"
                        break
                await end_game(sb, state, reason, now)
            except asyncio.CancelledError:
                return
            except Exception as e:  # the sample ended some other way and the sandbox is gone
                transcript().info(f"watchdog stopped: {e}", source="game")
                return
            if active:
                active.interrupt("score")

        g.watchdog = asyncio.create_task(watchdog())
        return state

    return solve


async def end_game(sb, state, reason: str, now: int | None = None) -> dict:
    """End the sample's game once: stop any program, log every account out so the server saves it,
    stop the world, and copy the run out. Called at the budget, when done, or by the scorer."""
    g = GAMES[state.uuid]
    async with g.lock:
        if g.ended:
            return g.ended
        if g.watchdog and g.watchdog is not asyncio.current_task():
            g.watchdog.cancel()
        if now is None:
            now = await g_sample(sb, g)
        await sb.exec(["/harness/stop.sh"], timeout=60)
        logout = await sb.exec(["bun", "/harness/logout.ts", *g.names], timeout=180)
        await g_sample(sb, g)
        await sb.exec(["sh", "-c", "kill $(cat /run/world.pid) 2>/dev/null; true"])
        g.ended = {
            "ended_by": reason,
            "ticks": now - g.start,
            "seconds": round(time.monotonic() - g.began, 1),
            "logout": json.loads((logout.stdout.strip().splitlines() or ["{}"])[-1]),
        }
        transcript().info(g.ended, source="game over")
        state.metadata["game"] = g.ended
        if g.track:
            state.metadata["timeline"] = [{k: v for k, v in p.items() if k != "state"} for p in g.timeline]
        await save_run(sb, g.run_dir, state)
        remove(f"{g.run_dir}/live.json")
        return g.ended


async def read_saves(state) -> Accounts:
    """Every account of this sample as the server last saved it, after the game has ended."""
    sb = sandbox()
    await end_game(sb, state, "agent finished")
    names = [a["username"] for a in state.metadata["accounts"]]
    result = await check(sb.exec(["bun", "/harness/sample.ts", *names]))
    GAMES.pop(state.uuid, None)
    return json.loads(result.stdout)["accounts"]


@solver
def command(cmd: str):
    """An agent that runs any program with the eval's accounts in $EVAL, until it exits or the game
    ends. When the eval has a model (--model), the program can call it through Inspect's agent
    bridge with any OpenAI or Anthropic client; Inspect logs each call."""

    async def solve(state, generate):
        sb = sandbox()
        async with contextlib.AsyncExitStack() as stack:
            env = {"EVAL": "/run/eval.json"}
            if str(get_model()) != "none/none":
                await stack.enter_async_context(sandbox_agent_bridge())
                env |= {"OPENAI_BASE_URL": "http://localhost:13131/v1", "ANTHROPIC_BASE_URL": "http://localhost:13131", "OPENAI_API_KEY": "inspect", "ANTHROPIC_API_KEY": "inspect"}
            await check(sb.exec(["/harness/run.sh", cmd], env=env))
            while (await sb.exec(["sh", "-c", "kill -0 $(cat /run/program.pid)"])).returncode == 0:
                await asyncio.sleep(2)
        state.metadata["program"] = {
            "command": cmd,
            "exit": (await sb.exec(["cat", "/run/program.exit"])).stdout.strip(),
            "output": (await sb.exec(["tail", "-c", "6000", f"{OUT}/program.log"])).stdout,
        }
        return state

    return solve


async def g_sample(sb, g: Game, saved_every: int | None = None) -> int:
    """Read the engine's tick and the accounts' latest saves; record the eval's measure at ticks
    counted from the start of the game. With saved_every, the saves are the engine's autosaves,
    made at multiples of that tick. Returns the engine's tick."""
    last = g.start + (g.timeline[-1]["tick"] if g.timeline else 0)
    try:
        result = json.loads((await check(sb.exec(["bun", "/harness/sample.ts", *g.names], timeout=60))).stdout)
    except TimeoutError:
        transcript().info("reading the saves timed out", source="score over time")
        return last
    tick = result["tick"] or last
    origin = g.start or tick
    if g.track and result["accounts"]:
        point = {
            "tick": (max(last, tick - tick % saved_every) if saved_every else tick) - origin,
            "seconds": round(time.monotonic() - g.began, 1),
            "value": g.track(result["accounts"]),
            "accounts": {n: g.track({n: a}) for n, a in result["accounts"].items()},
        }
        if not g.timeline or point["value"] != g.timeline[-1]["value"] or point["accounts"] != g.timeline[-1]["accounts"]:
            transcript().info(point, source="score over time")
        point["state"] = result["accounts"]  # for done(); not logged
        g.timeline.append(point)
    return tick


def run_dir(state) -> str:
    """Where this sample's run folder goes: next to its Inspect log, wherever the log dir is (a
    local path, s3://, or any other filesystem fsspec knows)."""
    active = sample_active()
    log = active.log_location if active and active.log_location else "logs/run.eval"
    return f"{log.removesuffix('.eval')}/{state.sample_id}-{state.epoch}"


def put(url: str, data: bytes | str) -> None:
    """Write one file of the run folder."""
    fs, path = fsspec.core.url_to_fs(url)
    fs.makedirs(path.rsplit("/", 1)[0], exist_ok=True)
    with fs.open(path, "wb") as f:
        f.write(data.encode() if isinstance(data, str) else data)


def remove(url: str) -> None:
    fs, path = fsspec.core.url_to_fs(url)
    if fs.exists(path):
        fs.rm(path)


async def announce_live(sb, run_dir: str, names: list[str]) -> None:
    """Tell people where the live world feed is, when the sandbox publishes the engine's port."""
    try:
        ports = (await sb.connection()).ports or []
    except Exception:
        return
    for p in ports:
        if p.container_port == 8888 and p.mappings:
            put(f"{run_dir}/live.json", json.dumps({"port": p.mappings[0].host_port, "accounts": names}))
            transcript().info({"world_feed_port": p.mappings[0].host_port, "accounts": names}, source="live view")


async def save_run(sb, run_dir: str, state) -> None:
    """Copy the sample's game recording, logs and timeline out of the sandbox, next to the log."""
    await sb.exec(["sh", "-c", f"kill $(cat /run/record.pid); sleep 1; gzip -f {OUT}/world.jsonl; tar czf /tmp/out.tgz -C {OUT} ."])
    data = await sb.read_file("/tmp/out.tgz", text=False)
    with tarfile.open(fileobj=io.BytesIO(data)) as tar:
        for member in tar.getmembers():
            if member.isfile():
                put(f"{run_dir}/{member.name.removeprefix('./')}", tar.extractfile(member).read())
    put(f"{run_dir}/sample.json", json.dumps({k: state.metadata.get(k) for k in ["accounts", "world", "budget_ticks", "game", "timeline"]}))
    state.metadata["run_dir"] = run_dir


async def upload(sb, folders: dict[str, str]) -> None:
    """Copy repo folders into the sandbox, so any sandbox (Docker, k8s, ...) needs only the world image."""
    buf = io.BytesIO()
    with tarfile.open(fileobj=buf, mode="w:gz") as tar:
        for local, remote in folders.items():
            tar.add(REPO / local, arcname=remote.lstrip("/"), filter=lambda t: None if "__pycache__" in t.name else t)
    await sb.write_file("/tmp/repo.tgz", buf.getvalue())
    await check(sb.exec(["tar", "xzf", "/tmp/repo.tgz", "-C", "/"]))


async def check(result_awaitable):
    result = await result_awaitable
    if not result.success:
        raise RuntimeError(f"exit {result.returncode}: {result.stderr[-2000:]}")
    return result
