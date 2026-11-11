"""The RuneScape side of the evals: one solver that runs any program in a fresh world, and a reader
for the server's own save files. Inspect does everything else (tasks, scoring, limits, logs,
sandboxes, the viewer)."""

import asyncio
import contextlib
import io
import json
import tarfile
import time
from pathlib import Path
from typing import Any, Callable

from inspect_ai.agent import sandbox_agent_bridge
from inspect_ai.log import transcript
from inspect_ai.log._samples import sample_active
from inspect_ai.model import get_model
from inspect_ai.solver import solver
from inspect_ai.util import sandbox

PLAYERS = "/opt/server/data/players/main"
OUT = "/run/out"

Accounts = dict[str, dict[str, Any]]  # account name -> its state, as saves.ts reads it


@solver
def run_program(command: str, track: Callable[[Accounts], float] | None = None, sample_ticks: int = 100):
    """Set up the eval's world, hand the program its accounts and goal, stop it at the tick budget.

    track: the eval's measure of the accounts (for example coins held). The harness records it
    every sample_ticks from the server's saves, as the score over time.
    """

    async def solve(state, generate):
        sb, m = sandbox(), state.metadata
        accounts, world, budget = m["accounts"], m["world"], m["budget_ticks"]
        names = [a["username"] for a in accounts]
        tick_ms = int(world["NODE_TICKRATE"])

        # 1. a fresh world with this eval's settings and start saves
        await sb.exec(["mkdir", "-p", PLAYERS, OUT])
        for a in accounts:
            await sb.exec(["cp", f"/evals/saves/{a['save']}", f"{PLAYERS}/{a['username']}.sav"])
            await sb.write_file(f"/opt/bots/{a['username']}/bot.env", f"BOT_USERNAME={a['username']}\nPASSWORD=pw\nSERVER=localhost:8888\nGATEWAY_URL=ws://localhost:7780\n")
        await check(sb.exec(["/harness/start-world.sh"], env={**world, "SAVE_EVERY_TICKS": str(sample_ticks)}, timeout=600))
        await sb.exec(["sh", "-c", f"nohup bun /harness/record.ts {OUT}/world.jsonl {' '.join(names)} > {OUT}/record.log 2>&1 & echo $! > /run/record.pid"])
        run_dir = local_run_dir(state)
        await announce_live(sb, run_dir, names)

        try:
            # 2. one headless client per account, then the program
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
            timeline: list[dict] = []
            async with contextlib.AsyncExitStack() as stack:
                env = {"EVAL": "/run/eval.json"}
                if str(get_model()) != "none/none":
                    # The eval has a model (--model): programs may call it through Inspect's agent
                    # bridge with any OpenAI or Anthropic client, and Inspect logs every call.
                    await stack.enter_async_context(sandbox_agent_bridge())
                    env |= {"OPENAI_BASE_URL": "http://localhost:13131/v1", "ANTHROPIC_BASE_URL": "http://localhost:13131", "OPENAI_API_KEY": "inspect", "ANTHROPIC_API_KEY": "inspect"}
                start = await sample(sb, names, track, timeline)
                await check(sb.exec(["/harness/run.sh", command], env=env))

                # Sample the accounts until the budget runs out or the program ends; then stop it.
                end_tick, deadline = start + budget, time.monotonic() + 2 * budget * tick_ms / 1000 + 120
                stopped_by, now = "budget", start
                while True:
                    await asyncio.sleep(min(sample_ticks, end_tick - now) * tick_ms / 1000)
                    now = await sample(sb, names, track, timeline, saved_every=sample_ticks)
                    if now >= end_tick:
                        break
                    if time.monotonic() > deadline:
                        stopped_by = "wall clock (the engine ran slower than its tick rate)"
                        break
                    if (await sb.exec(["sh", "-c", "kill -0 $(cat /run/program.pid)"])).returncode != 0:
                        stopped_by = "program exited"
                        break
                await sb.exec(["/harness/stop.sh"], timeout=60)

            # 3. log every account out at once, so the server writes the final save
            logout = await sb.exec(["bun", "/harness/logout.ts", *names], timeout=180)
            final = await sample(sb, names, track, timeline)
            exit_code = (await sb.exec(["cat", "/run/program.exit"])).stdout.strip()
            state.metadata["program"] = {
                "command": command,
                "stopped_by": stopped_by,
                "exit": exit_code,
                "ticks": final - start,
                "logout": json.loads((logout.stdout.strip().splitlines() or ["{}"])[-1]),
                "output": (await sb.exec(["tail", "-c", "6000", f"{OUT}/program.log"])).stdout,
            }
            if track:
                state.metadata["timeline"] = [{**p, "tick": p["tick"] - start} for p in timeline]
            await save_run(sb, run_dir, state)
            return state
        finally:
            (run_dir / "live.json").unlink(missing_ok=True)

    return solve


async def read_saves(state) -> Accounts:
    """Every account of this sample, from the server's save files (after logout: the final state)."""
    names = [a["username"] for a in state.metadata["accounts"]]
    result = await check(sandbox().exec(["bun", "/harness/sample.ts", *names]))
    return json.loads(result.stdout)["accounts"]


async def sample(sb, names, track, timeline, saved_every: int | None = None) -> int:
    """Read the engine's tick and the accounts' latest saves; record the eval's measure.
    With saved_every, the saves are the engine's autosaves, made at multiples of that tick."""
    result = json.loads((await check(sb.exec(["bun", "/harness/sample.ts", *names]))).stdout)
    tick = result["tick"] or (timeline[-1]["tick"] if timeline else 0)
    if track and result["accounts"]:
        point = {"tick": tick - tick % saved_every if saved_every else tick, "value": track(result["accounts"]), "accounts": {n: track({n: a}) for n, a in result["accounts"].items()}}
        if not timeline or point["value"] != timeline[-1]["value"] or point["accounts"] != timeline[-1]["accounts"]:
            transcript().info(point, source="score over time")
        timeline.append(point)
    return tick


def local_run_dir(state) -> Path:
    """Where this sample's game recording goes: next to its Inspect log."""
    active = sample_active()
    log = active.log_location if active and active.log_location and "://" not in active.log_location else "logs/run.eval"
    return Path(log).with_suffix("") / f"{state.sample_id}-{state.epoch}"


async def announce_live(sb, run_dir: Path, names: list[str]) -> None:
    """Tell people where the live world feed is, when the sandbox publishes the engine's port."""
    try:
        ports = (await sb.connection()).ports or []
    except Exception:
        return
    for p in ports:
        if p.container_port == 8888 and p.mappings:
            run_dir.mkdir(parents=True, exist_ok=True)
            (run_dir / "live.json").write_text(json.dumps({"port": p.mappings[0].host_port, "accounts": names}))
            transcript().info({"world_feed_port": p.mappings[0].host_port, "accounts": names}, source="live view")


async def save_run(sb, run_dir: Path, state) -> None:
    """Copy the sample's game recording, logs and timeline out of the sandbox, next to the log."""
    await sb.exec(["sh", "-c", f"kill $(cat /run/record.pid); sleep 1; gzip -f {OUT}/world.jsonl; tar czf /tmp/out.tgz -C {OUT} ."])
    data = await sb.read_file("/tmp/out.tgz", text=False)
    run_dir.mkdir(parents=True, exist_ok=True)
    with tarfile.open(fileobj=io.BytesIO(data)) as tar:
        tar.extractall(run_dir, filter="data")
    (run_dir / "sample.json").write_text(json.dumps({k: state.metadata.get(k) for k in ["accounts", "world", "budget_ticks", "program", "timeline"]}))
    state.metadata["run_dir"] = str(run_dir)


async def check(result_awaitable):
    result = await result_awaitable
    if not result.success:
        raise RuntimeError(f"exit {result.returncode}: {result.stderr[-2000:]}")
    return result
