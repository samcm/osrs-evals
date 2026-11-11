import json

from inspect_ai.solver import solver
from inspect_ai.util import sandbox

PLAYERS = "/opt/server/data/players/main"


@solver
def run_program(command: str):
    """Set up the eval's world, hand the program its accounts and goal, stop it at the budget."""

    async def solve(state, generate):
        sb, m = sandbox(), state.metadata
        accounts = m["accounts"]

        # 1. a fresh world with this eval's settings and start saves
        await sb.exec(["mkdir", "-p", PLAYERS, "/run/out"])
        for a in accounts:
            await sb.exec(["cp", f"/evals/saves/{a['save']}", f"{PLAYERS}/{a['username']}.sav"])
            await sb.write_file(f"/opt/bots/{a['username']}/bot.env", f"BOT_USERNAME={a['username']}\nPASSWORD=pw\nSERVER=localhost:8888\nGATEWAY_URL=ws://localhost:7780\n")
        await sb.exec(["/harness/start-world.sh"], env=m["world"], timeout=600)

        # 2. one headless client per account, then the program
        for a in accounts:
            await sb.exec(["/harness/client.sh", a["username"]], timeout=120)
        contract = {
            "goal": state.input_text,
            "accounts": [{"username": a["username"], "password": "pw"} for a in accounts],
            "server": "localhost",
            "budget_ticks": m["budget_ticks"],
            "out": "/run/out",
        }
        await sb.write_file("/run/eval.json", json.dumps(contract))
        seconds = m["budget_ticks"] * int(m["world"]["NODE_TICKRATE"]) // 1000
        result = await sb.exec(
            ["timeout", "-k", "10", str(seconds), "sh", "-c", command],
            env={"EVAL": "/run/eval.json"},
            timeout=seconds + 60,
        )
        state.metadata["program"] = {"command": command, "exit": result.returncode, "stdout": result.stdout[-4000:], "stderr": result.stderr[-4000:]}

        # 3. log every account out so the server writes its save
        await sb.exec(["/harness/logout.sh"], timeout=180)
        return state

    return solve


async def read_saves(state):
    paths = [f"{PLAYERS}/{a['username']}.sav" for a in state.metadata["accounts"]]
    result = await sandbox().exec(["bun", "/harness/savecoins.ts", *paths])
    return json.loads(result.stdout)
