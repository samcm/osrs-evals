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
import gzip
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
AGENT_USER = "agent"  # agents run as this user: they can use the game, not edit its saves or the harness
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

ATTEMPTS = """

You get {attempts} attempts at this, {budget:,} ticks each. An attempt ends when the goal is met or its ticks run out. Then every account is put back exactly where it started and logged in again, and the next attempt begins at once. Your files in /work are kept. /run/attempt.json says which attempt is running and how the earlier ones went. You are scored on your best attempt."""


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
        self.attempt = 1
        self.attempts: list[dict] = []  # one result per finished attempt
        self.attempt_began = (0, self.began)  # tick and wall clock the current attempt began at
        self.states: list[dict] = []  # the accounts' saved state over time, changes only (states.jsonl.gz)
        self.last_state: dict[str, dict] = {}


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
        await sb.exec(concurrency=False, cmd=["mkdir", "-p", PLAYERS, OUT, "/work"])
        for a in accounts:
            await sb.exec(concurrency=False, cmd=["cp", f"/evals/saves/{a['save']}", f"{PLAYERS}/{a['username']}.sav"])
            await sb.write_file(f"/opt/bots/{a['username']}/bot.env", f"BOT_USERNAME={a['username']}\nPASSWORD=pw\nSERVER=localhost:8888\nGATEWAY_URL=ws://localhost:7780\n")
        # The agent's user can read the SDK and write /work, but not the server's data (the saves the
        # score is read from) or the harness.
        await check(sb.exec(concurrency=False, cmd=["sh", "-c", f"id {AGENT_USER} >/dev/null 2>&1 || useradd -m {AGENT_USER}; mkdir -p /opt/server/data /work/out; chmod 700 /opt/server/data {OUT}; chown -R {AGENT_USER} /work"]))
        await check(sb.exec(concurrency=False, cmd=["/harness/start-world.sh"], env={**world, "SAVE_EVERY_TICKS": str(sample_ticks)}, timeout=600))
        await sb.exec(concurrency=False, cmd=["sh", "-c", f"nohup bun /harness/record.ts {OUT}/world.jsonl {' '.join(names)} > {OUT}/record.log 2>&1 & echo $! > /run/record.pid"])
        g = GAMES[state.uuid] = Game(names, track, done, sample_ticks, tick_ms, budget, run_dir(state))
        await announce_live(sb, g.run_dir, names)

        # Each account in the game through rs-sdk's headless client.
        for name in names:
            await check(sb.exec(concurrency=False, cmd=["/harness/client.sh", name], timeout=120))
        contract = {
            "goal": state.input_text,
            "accounts": [{"username": n, "password": "pw"} for n in names],
            "gateway": "ws://localhost:7780",
            "budget_ticks": budget,
            "tick_ms": tick_ms,
            "out": "/work/out",
        }
        attempts = m.get("attempts", 1)
        contract["attempts"] = attempts
        await sb.write_file("/run/eval.json", json.dumps(contract))
        about = ABOUT.format(
            tick_ms=tick_ms, budget=budget, minutes=round(budget * tick_ms / 60000, 1), first=names[0], eval_path="/run/eval.json",
            accounts="\n".join(f"- {n} (password: pw)" for n in names),
        )
        if attempts > 1:
            about += ATTEMPTS.format(attempts=attempts, budget=budget)
            await sb.write_file("/run/attempt.json", json.dumps({"attempt": 1, "of": attempts, "earlier": []}))
        state.messages.append(ChatMessageUser(content=about))

        # The clock starts now: sample the accounts, and end the game at the budget or when done.
        g.start = await g_sample(sb, g)
        g.attempt_began = (g.start, g.began)
        active = sample_active()

        async def watchdog():
            try:
                now = g.start
                while True:
                    # One attempt: until its budget runs out or the eval is done.
                    reason, began, began_at = "budget", now, time.monotonic()
                    g.attempt_began = (began, began_at)
                    end_tick, deadline = began + budget, began_at + 2 * budget * tick_ms / 1000 + 120
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
                    if g.attempt >= attempts:
                        break
                    # Reset: every account back to its start save, logged in again; the agent goes on.
                    g.attempts.append({"attempt": g.attempt, "ended_by": reason, "ticks": now - began, "seconds": round(time.monotonic() - began_at, 1), "value": g.timeline[-1]["value"] if g.timeline else None})
                    transcript().info(g.attempts[-1], source="attempt over")
                    await sb.exec(concurrency=False, cmd=["bun", "/harness/logout.ts", *names], timeout=180)
                    for a in accounts:
                        await sb.exec(concurrency=False, cmd=["cp", f"/evals/saves/{a['save']}", f"{PLAYERS}/{a['username']}.sav"])
                    for name in names:
                        await check(sb.exec(concurrency=False, cmd=["/harness/client.sh", name], timeout=120))
                    g.attempt += 1
                    await sb.write_file("/run/attempt.json", json.dumps({"attempt": g.attempt, "of": attempts, "earlier": g.attempts}))
                    now = await g_sample(sb, g)
                await end_game(sb, state, reason, now)
            except asyncio.CancelledError:
                return
            except Exception as e:  # the sample ended some other way and the sandbox is gone
                transcript().info(f"watchdog stopped: {e}", source="game")
                remove(f"{g.run_dir}/live.json")
                return
            if active:
                # Error, not score, when the agent never reached its model: eval-set retries it.
                if unreachable := model_unreachable():
                    transcript().info(unreachable, source="game")
                active.interrupt("error" if unreachable else "score")

        g.watchdog = asyncio.create_task(watchdog())
        return state

    return solve


async def end_game(sb, state, reason: str, now: int | None = None) -> dict:
    """End the sample's game once: stop any program, log every account out so the server saves it,
    stop the world, and copy the run out. Called at the budget, when done, or by the scorer."""
    g = GAMES.get(state.uuid)
    if g is None:  # ended, and its game already let go
        return state.metadata["game"]
    async with g.lock:
        if g.ended:
            return g.ended
        if g.watchdog and g.watchdog is not asyncio.current_task():
            g.watchdog.cancel()
        if now is None:
            now = await g_sample(sb, g)
        await sb.exec(concurrency=False, cmd=["/harness/stop.sh"], timeout=60)
        logout = await sb.exec(concurrency=False, cmd=["bun", "/harness/logout.ts", *g.names], timeout=180)
        await g_sample(sb, g)
        await sb.exec(concurrency=False, cmd=["sh", "-c", "kill $(cat /run/world.pid) 2>/dev/null; true"])
        g.ended = {
            "ended_by": reason,
            "start_tick": g.start,  # the engine's tick when the agent got the game (for replays)
            "ticks": now - g.start,
            "seconds": round(time.monotonic() - g.began, 1),
            "logout": json.loads((logout.stdout.strip().splitlines() or ["{}"])[-1]),
        }
        transcript().info(g.ended, source="game over")
        state.metadata["game"] = g.ended
        if state.metadata.get("attempts", 1) > 1:
            began, began_at = g.attempt_began
            last = {"attempt": g.attempt, "ended_by": reason, "ticks": now - began, "seconds": round(time.monotonic() - began_at, 1), "value": g.timeline[-1]["value"] if g.timeline else None}
            # The game can end during a reset (the agent stopped then); that attempt is already recorded.
            state.metadata["attempt_results"] = g.attempts + ([] if g.attempts and g.attempts[-1]["attempt"] == g.attempt else [last])
        if g.track:
            state.metadata["timeline"] = [{k: v for k, v in p.items() if k != "state"} for p in g.timeline]
        await save_run(sb, g.run_dir, state, g.states)
        remove(f"{g.run_dir}/live.json")
        GAMES.pop(state.uuid, None)
        return g.ended


async def read_saves(state) -> Accounts:
    """Every account of this sample as the server last saved it, after the game has ended."""
    sb = sandbox()
    await end_game(sb, state, "agent finished")
    # A run whose agent never reached its model measured the model route, not the agent: fail the
    # sample (eval-set retries it) instead of scoring it.
    if unreachable := model_unreachable():
        raise RuntimeError(unreachable)
    names = [a["username"] for a in state.metadata["accounts"]]
    result = await check(sb.exec(concurrency=False, cmd=["bun", "/harness/sample.ts", *names]))
    return json.loads(result.stdout)["accounts"]


def model_unreachable() -> str | None:
    """Why the sample measured the model route instead of the agent, if it did: the agent made model
    calls and every one failed."""
    calls = [e for e in transcript().events if e.event == "model"]
    if calls and all(e.error for e in calls):
        return f"the model was never reached ({len(calls)} calls, all failed): {calls[-1].error}"
    return None


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
            await check(sb.exec(concurrency=False, cmd=["/harness/run.sh", cmd], env=env))
            while (await sb.exec(concurrency=False, cmd=["sh", "-c", "kill -0 $(cat /run/program.pid)"])).returncode == 0:
                await asyncio.sleep(2)
        state.metadata["program"] = {
            "command": cmd,
            "exit": (await sb.exec(concurrency=False, cmd=["cat", "/run/program.exit"])).stdout.strip(),
            "output": (await sb.exec(concurrency=False, cmd=["tail", "-c", "6000", f"{OUT}/program.log"])).stdout,
        }
        return state

    return solve


async def g_sample(sb, g: Game, saved_every: int | None = None) -> int:
    """Read the engine's tick and the accounts' latest saves; record the eval's measure at ticks
    counted from the start of the game. With saved_every, the saves are the engine's autosaves,
    made at multiples of that tick. Returns the engine's tick."""
    last = g.start + (g.timeline[-1]["tick"] if g.timeline else 0)
    try:
        result = json.loads((await check(sb.exec(concurrency=False, cmd=["bun", "/harness/sample.ts", *g.names], timeout=60))).stdout)
    except TimeoutError:
        transcript().info("reading the saves timed out", source="score over time")
        return last
    tick = result["tick"] or last
    origin = g.start or tick
    at = (max(last, tick - tick % saved_every) if saved_every else tick) - origin
    seconds = round(time.monotonic() - g.began, 1)
    if result["accounts"]:
        record_state(g, at, seconds, result["accounts"])
    if g.track and result["accounts"]:
        point = {
            "tick": at,
            "seconds": seconds,
            "attempt": g.attempt,
            "value": g.track(result["accounts"]),
            "accounts": {n: g.track({n: a}) for n, a in result["accounts"].items()},
        }
        if not g.timeline or point["value"] != g.timeline[-1]["value"] or point["accounts"] != g.timeline[-1]["accounts"]:
            transcript().info(point, source="score over time")
        point["state"] = result["accounts"]  # for done(); not logged
        g.timeline.append(point)
    return tick


STATE_TABLES = ("xp", "varps", "inv", "worn", "bank")


def account_state(account: dict) -> dict:
    """The part of a saved account worth following over time: where it is, its xp per skill, its
    varps (quest progress) and its items. Tables keep non-zero entries only."""
    return {
        "x": account["x"], "z": account["z"], "level": account["level"],
        "xp": {name: s["xp"] for name, s in account["skills"].items() if s["xp"]},
        **{k: {str(i): n for i, n in account[k].items() if n} for k in ("varps", "inv", "worn", "bank")},
    }


def state_change(before: dict, after: dict) -> dict:
    """What changed between two account states: changed positions, and the changed entries of each
    table, with 0 for an entry that is gone. Empty when nothing changed."""
    change = {k: after[k] for k in ("x", "z", "level") if before.get(k) != after[k]}
    for k in STATE_TABLES:
        old, new = before.get(k, {}), after[k]
        diff = {i: n for i, n in new.items() if old.get(i) != n} | {i: 0 for i in old if i not in new}
        if diff:
            change[k] = diff
    return change


def record_state(g: Game, tick: int, seconds: float, accounts: Accounts) -> None:
    """Add the accounts' saved state at this tick to the game's states, changes only (the first
    record of an account is its whole state)."""
    changes = {}
    for name, account in accounts.items():
        now = account_state(account)
        if change := state_change(g.last_state.get(name, {}), now):
            changes[name] = change
        g.last_state[name] = now
    if changes:
        g.states.append({"tick": tick, "seconds": seconds, "attempt": g.attempt, "accounts": changes})


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


async def save_run(sb, run_dir: str, state, states: list[dict]) -> None:
    """Copy the sample's game recording, logs, timeline and account states out of the sandbox, next
    to the log."""
    # The run folder: the harness's files, and the agent's /work (the code it wrote, its out/ folder).
    await sb.exec(concurrency=False, cmd=["sh", "-c", f"kill $(cat /run/record.pid); sleep 1; gzip -f {OUT}/world.jsonl; tar czf {OUT}/work.tgz --exclude=node_modules --exclude=./.codex --exclude=./.claude --exclude=./.cache -C /work . ; tar czf /tmp/out.tgz -C {OUT} ."])
    data = await sb.read_file("/tmp/out.tgz", text=False)
    with tarfile.open(fileobj=io.BytesIO(data)) as tar:
        for member in tar.getmembers():
            if member.isfile():
                put(f"{run_dir}/{member.name.removeprefix('./')}", tar.extractfile(member).read())
    # One JSON line per sample that changed an account: {tick, seconds, attempt, accounts: {name: change}}
    put(f"{run_dir}/states.jsonl.gz", gzip.compress("".join(json.dumps(r) + "\n" for r in states).encode()))
    put(f"{run_dir}/sample.json", json.dumps({k: state.metadata.get(k) for k in ["accounts", "world", "budget_ticks", "attempts", "game", "attempt_results", "timeline"]}))
    state.metadata["run_dir"] = run_dir


async def upload(sb, folders: dict[str, str]) -> None:
    """Copy repo folders into the sandbox, so any sandbox (Docker, k8s, ...) needs only the world image."""
    buf = io.BytesIO()
    with tarfile.open(fileobj=buf, mode="w:gz") as tar:
        for local, remote in folders.items():
            tar.add(REPO / local, arcname=remote.lstrip("/"), filter=lambda t: None if "__pycache__" in t.name else t)
    await sb.write_file("/tmp/repo.tgz", buf.getvalue())
    await check(sb.exec(concurrency=False, cmd=["tar", "xzf", "/tmp/repo.tgz", "-C", "/"]))


async def check(result_awaitable):
    result = await result_awaitable
    if not result.success:
        raise RuntimeError(f"exit {result.returncode}: {result.stderr[-2000:]}")
    return result
