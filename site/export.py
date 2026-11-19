"""Turn Inspect logs into the site's data: one index of every run, one file per run, one per eval.

    python site/export.py <log dir> [<log dir> ...] --prices prices.yaml --out site/public/data

A run is one sample of one log: an eval, an agent, a model, an epoch. Everything here is read from
the logs and the run folders next to them (the world recording, the engine's log, the accounts'
saved states); nothing is recomputed from the game.

One clock for everything: `seconds` are wall-clock seconds since the game started (the harness's
first sample, tick 0), and `tick`s are game ticks since then, counted straight through every
attempt. Shapes are in site/src/data/types.ts.
"""

import argparse
import bisect
import gzip
import json
import os
import re
import statistics
from collections import Counter
from datetime import datetime
from pathlib import Path

import fsspec
import yaml
from inspect_ai.log import list_eval_logs, read_eval_log

SITE = Path(__file__).resolve().parent
QUESTS = SITE / "game" / "quests.json"  # written by site/game/quests.py from rs-sdk's content
AGENT_NAMES = {"react": "Model + bash", "inspect_swe/claude_code": "Claude Code", "inspect_swe/codex_cli": "Codex", "command": "Program"}
EVAL_NAMES = {"quest_points": "Quest points in 30 minutes", "cooks_assistant": "Cook's Assistant", "dragon_slayer": "Dragon Slayer", "shrimps": "Cook 500 shrimps", "coins": "Coins", "gold": "Gold"}
MEASURES = {"quest_points": "Quest points", "cooks_assistant": "Quest stage", "dragon_slayer": "Quest stage", "shrimps": "Shrimps cooked", "coins": "Coins", "gold": "Coins"}
VENDORS = {"anthropic": "Anthropic", "openai": "OpenAI", "google": "Google", "mistral": "Mistral", "grok": "xAI", "deepseek": "DeepSeek", "openrouter": "OpenRouter"}

BUCKET = 100  # ticks per bucket of the binned series (SDK actions, activity)
PATH_EVERY = 10  # ticks between path points in a run's file
EVAL_PATH_EVERY = 50  # ... and in the eval's file
GRID = 151  # points of the eval file's shared tick grid
JUMP = 10  # tiles moved in one tick without walking that count as a teleport

# The world feed (rs-sdk server/engine/src/web/worldfeed.ts): step directions NW=0 .. SE=7.
DX = [-1, 0, 1, -1, 1, -1, 0, 1]
DZ = [1, 1, 1, 0, 0, -1, -1, -1]
DEATH_ANIM = 836  # seq human_death

# Where each quest is usually finished, for guessing which quest a quest-points jump was when the
# saves' varps were not recorded: the NPC types handed in to (rs-sdk 71d949d content/pack/npc.pack)
# and the tile it happens near. Keys are site/game/quests.json ids.
QUEST_HINTS = {
    "cooks_assistant": ([278], (3209, 3214)),  # cook, Lumbridge kitchen
    "sheep_shearer": ([758], (3189, 3273)),  # fred_the_farmer
    "restless_ghost": ([457, 456], (3250, 3193)),  # ghostx, father_aereck; the coffin
    "rune_mysteries_quest": ([300], (3104, 9571)),  # head_wizard, Wizards' Tower basement
    "romeo_and_juliet": ([639, 637], (3211, 3423)),  # romeo, juliet
    "imp_catcher": ([706], (3103, 3163)),  # wizard_mizgog
    "witchs_potion": ([307], (2968, 3205)),  # hetty, Rimmington
    "dorics_quest": ([284], (2951, 3451)),  # doric
    "goblin_diplomacy": ([296, 297], (2957, 3512)),  # generals bentnoze and wartface
    "knights_sword": ([606], (2977, 3343)),  # squire, Falador castle
    "ernest_the_chicken": ([286, 285], (3110, 3366)),  # professor_oddenstein, veronica
    "prince_ali_rescue": ([923], (3298, 3163)),  # hassan, Al Kharid palace
    "vampire_slayer": ([755, 757], (3077, 9771)),  # morgan, count_draynor
    "demon_slayer": ([879], (3227, 3370)),  # delrith, the stone circle
    "black_knights_fortress": ([608], (2961, 3338)),  # sir_amik_varze
    "pirates_treasure": ([375], (2999, 3383)),  # redbeard_frank; the dig in Falador park
    "shield_of_arrav": ([648, 646], (3222, 3473)),  # king_roald, curator
}

# rs-sdk's xp table (harness/saves.ts): its faster curve, in tenths of xp.
LEVEL_XP: list[int] = []
_acc = 0
for _level in range(1, 99):
    _acc += int(_level + 2 ** (_level / 10) * 300)
    LEVEL_XP.append(_acc // 4 * 10)


def level_of(xp: float) -> int:
    return 1 + bisect.bisect_right(LEVEL_XP, round(xp * 10))


def eval_base(task: str) -> str:
    return "cooks_assistant" if task.startswith("cooks") else "shrimps" if task.startswith("shrimps") else "quest_points" if task.startswith(("qp_", "quest_points")) else "dragon_slayer" if task.startswith(("ds_", "dragon_slayer")) else task


def eval_of(task: str, attempts: int) -> str:
    """The eval a task runs, from its registered name (matrix tasks are named <eval>_<agent>)."""
    base = eval_base(task)
    return f"{base}_x{attempts}" if attempts > 1 else base


def eval_title(eval_id: str) -> str:
    base, _, tries = eval_id.partition("_x")
    return EVAL_NAMES.get(base, base) + (f", {tries} tries" if tries else "")


def agent_of(steps) -> tuple[str, dict]:
    step = steps[-1]
    params = {k: v for k, v in (step.params or {}).items() if k in ("version", "cmd") and v not in (None, "auto")}
    return step.solver, params


# Inspect providers that name a model's maker: a model reached through another provider's API (an
# OpenAI-compatible gateway serving "anthropic/claude-haiku-5-5" as openai/anthropic/claude-haiku-5-5)
# is still that maker's model.
MAKERS = {"anthropic", "google", "mistral", "grok", "deepseek"}


def canonical_model(model: str) -> str:
    """The model a run used, whatever route reached it: openai/anthropic/x -> anthropic/x."""
    parts = model.split("/")
    return "/".join(parts[1:]) if len(parts) > 2 and parts[1] in MAKERS else model


def vendor_of(model: str) -> str | None:
    """The model's maker, from the provider prefix of its Inspect name; None for no model."""
    vendor = model.split("/")[0]
    return None if vendor == "none" else vendor


def usage_cost(model: str, u, prices: dict) -> dict | None:
    """USD at list price of one usage record, by kind of token; None when the model has no price."""
    p = prices.get(model)
    if not p or u is None:
        return None
    return {
        "input": (u.input_tokens or 0) * p["input"] / 1e6,
        "output": (u.output_tokens or 0) * p["output"] / 1e6,
        "cache_read": (u.input_tokens_cache_read or 0) * p["input_cache_read"] / 1e6,
        "cache_write": (u.input_tokens_cache_write or 0) * p["input_cache_write"] / 1e6,
    }


def cost(usage: dict, prices: dict) -> float | None:
    total = 0.0
    for model, u in usage.items():
        c = usage_cost(canonical_model(model), u, prices)
        if c is None:
            return None
        total += sum(c.values())
    return round(total, 5)


def run_dir_files(run_dir: str) -> dict[str, bytes]:
    fs, path = fsspec.core.url_to_fs(run_dir)
    out = {}
    for name in ["sample.json", "world.jsonl.gz", "world.log", "states.jsonl.gz", "program.log"]:
        if fs.exists(f"{path}/{name}"):
            with fs.open(f"{path}/{name}", "rb") as f:
                out[name] = f.read()
    return out


def pct(values: list[float], q: float) -> float | None:
    if not values:
        return None
    s = sorted(values)
    return round(s[min(len(s) - 1, int(q * len(s)))], 2)


class Clock:
    """Converts between game ticks and seconds on the run's clock, through the timeline's samples
    (one every 100 ticks); beyond them, at the eval's tick rate."""

    def __init__(self, timeline: list[dict], tick_ms: int):
        self.ms = tick_ms
        self.knots: list[tuple[int, float]] = []
        for p in timeline:
            if not self.knots or (p["tick"] > self.knots[-1][0] and p["seconds"] > self.knots[-1][1]):
                self.knots.append((p["tick"], p["seconds"]))
        if not self.knots:
            self.knots = [(0, 0.0)]
        self.ticks = [k[0] for k in self.knots]
        self.secs = [k[1] for k in self.knots]

    def tick(self, seconds: float) -> int:
        i = bisect.bisect_right(self.secs, seconds) - 1
        if i < 0:
            return max(0, round(self.ticks[0] - (self.secs[0] - seconds) * 1000 / self.ms))
        if i >= len(self.knots) - 1:
            return round(self.ticks[-1] + (seconds - self.secs[-1]) * 1000 / self.ms)
        (t0, s0), (t1, s1) = self.knots[i], self.knots[i + 1]
        return round(t0 + (t1 - t0) * (seconds - s0) / (s1 - s0))

    def seconds(self, tick: float) -> float:
        i = bisect.bisect_right(self.ticks, tick) - 1
        if i < 0:
            return round(self.secs[0] - (self.ticks[0] - tick) * self.ms / 1000, 1)
        if i >= len(self.knots) - 1:
            return round(self.secs[-1] + (tick - self.ticks[-1]) * self.ms / 1000, 1)
        (t0, s0), (t1, s1) = self.knots[i], self.knots[i + 1]
        return round(s0 + (s1 - s0) * (tick - t0) / (t1 - t0), 1)


def timeline_of(raw: list[dict], end_tick: int | None) -> list[dict]:
    """The harness's timeline on the run's clock: seconds from the first sample, ticks clamped to
    the game's end (the last sample is read after the logout, a few ticks later, when the server
    has saved what the agent did before the end)."""
    if not raw:
        return []
    offset = raw[0]["seconds"]
    out: list[dict] = []
    for p in raw:
        q = {**p, "seconds": round(p["seconds"] - offset, 1)}
        if end_tick is not None and q["tick"] > end_tick:
            q["tick"] = end_tick
            if out:
                q["seconds"] = out[-1]["seconds"]
        if out and q["tick"] == out[-1]["tick"]:
            out[-1] = q
        else:
            out.append(q)
    return out


def change_points(timeline: list[dict]) -> list[dict]:
    """The timeline's first and last points and every point where a value or the attempt changed."""
    keep = [p for i, p in enumerate(timeline) if i == 0 or i == len(timeline) - 1 or (p["value"], p.get("accounts"), p.get("attempt")) != (timeline[i - 1]["value"], timeline[i - 1].get("accounts"), timeline[i - 1].get("attempt"))]
    return keep


def attempt_starts(timeline: list[dict]) -> list[tuple[int, int, float]]:
    """(attempt, tick, seconds) of each attempt's first sample."""
    out = []
    for p in timeline:
        a = p.get("attempt", 1)
        if not out or out[-1][0] != a:
            out.append((a, p["tick"], p["seconds"]))
    return out or [(1, 0, 0.0)]


def attempt_at(starts: list[tuple[int, int, float]], tick: int | None) -> int | None:
    if tick is None:
        return None
    a = starts[0][0]
    for attempt, t, _ in starts:
        if tick >= t:
            a = attempt
    return a


SDK_CALL = re.compile(r"\b(?:bot|sdk)\.(\w+)\(")


def category(tool: str, args: dict) -> str:
    """What a tool call was for, the same way for every agent."""
    if tool in ("update_plan", "TodoWrite"):
        return "plan"
    if tool == "submit":
        return "submit"
    if tool == "write_stdin":
        return "stdin" if args.get("chars") else "wait"
    if tool in ("Read", "Grep", "Glob", "LS", "WebFetch", "WebSearch"):
        return "read"
    if tool in ("Write", "Edit", "MultiEdit", "apply_patch"):
        return "write"
    if tool in ("Monitor", "TaskStop", "ListAgents", "BashOutput", "KillShell", "KillBash", "Task", "Agent"):
        return "manage"
    c = str(args.get("command") or args.get("cmd") or "")
    writes = bool(re.search(r"cat\s*>+\s*\S+\.(ts|js|mjs)", c) or re.search(r"<<\s*'?\w+'?", c))
    runs = bool(re.search(r"\bbun\s+(run\s+)?\S+\.(ts|js|mjs)", c)) and "/opt/sdk/cli.ts" not in c
    if writes and runs:
        return "write+run"
    if runs:
        return "run"
    if writes:
        return "write"
    if "/opt/sdk/cli.ts" in c:
        return "state"
    if re.match(r"\s*(sleep|tail|wait|ps\b|jobs)", c):
        return "wait"
    if re.search(r"\b(cat|grep|rg|sed|head|ls|find|less|wc|jq)\b", c):
        return "read"
    return "other"


def stopped_by_harness(error) -> bool:
    """A model call cut off because the harness ended the game (at the budget or when done)."""
    return error is not None and "operator" in str(error).lower()


def turns_of(sample, prices: dict, clock: Clock, starts) -> list[dict]:
    """The agent's turns, the same way for every agent: each model call (when it started on the
    run's clock, how long it took, its tokens and cost), the tool calls it made with their results,
    and how long until the next model call (the agent running its tools and code)."""
    results = {m.tool_call_id: m for m in sample.messages if m.role == "tool"}
    tool_events = {e.id: e for e in sample.events if e.event == "tool"}
    calls = [e for e in sample.events if e.event == "model"]
    # The run's clock starts at the harness's first sample: its "score over time" event.
    t0 = next((e.timestamp for e in sample.events if e.event == "info" and e.source == "score over time"), sample.events[0].timestamp)
    turns = []
    for i, e in enumerate(calls):
        u = e.output.usage if e.output else None
        msg = e.output.message if e.output and e.output.choices else None
        actions = []
        for tc in (msg.tool_calls or []) if msg else []:
            r = results.get(tc.id)
            te = tool_events.get(tc.id)
            args = tc.arguments or {}
            text = args.get("command") or args.get("cmd") or json.dumps(args)
            actions.append({
                "tool": tc.function,
                "category": category(tc.function, args),
                "input": str(text)[:4000],
                "output": (r.text[:3000] if r else None),
                "error": (r.error.message[:500] if r and r.error else None),
                "seconds": round(te.working_time, 2) if te is not None and te.working_time is not None else None,
                "output_chars": len(r.text) if r else None,
                "truncated": bool(te is not None and te.truncated),
                "sdk_calls": sorted(set(SDK_CALL.findall(str(text)))),
                "background": bool(args.get("run_in_background")),
            })
        done = e.completed or e.timestamp
        nxt = calls[i + 1].timestamp if i + 1 < len(calls) else None
        at = round((e.timestamp - t0).total_seconds(), 1)
        tick = clock.tick(at)
        c = usage_cost(canonical_model(e.model), u, prices)
        harness = stopped_by_harness(e.error)
        turns.append({
            "at": at,
            "tick": tick,
            "attempt": attempt_at(starts, tick),
            "model": canonical_model(e.model),
            "model_seconds": round(e.working_time or (done - e.timestamp).total_seconds(), 2),
            "then_seconds": round((nxt - done).total_seconds(), 1) if nxt else None,
            "input_tokens": u and (u.input_tokens + (u.input_tokens_cache_read or 0) + (u.input_tokens_cache_write or 0)),
            "input_uncached": u and u.input_tokens,
            "cache_read": u and (u.input_tokens_cache_read or 0),
            "cache_write": u and (u.input_tokens_cache_write or 0),
            "output_tokens": u and u.output_tokens,
            "reasoning_tokens": u and u.reasoning_tokens,
            "context_tokens": (e.output.input_context_tokens if e.output else None) or (u and (u.input_tokens + (u.input_tokens_cache_read or 0) + (u.input_tokens_cache_write or 0))),
            "cost": round(sum(c.values()), 6) if c else None,
            "stop_reason": "game_over" if harness else (msg and e.output.choices[0].stop_reason),
            "text": (msg.text[:2000] if msg and msg.text else None),
            "actions": actions,
            "error": None if harness else (str(e.error)[:300] if e.error else None),
        })
    return turns


def call_series(turns: list[dict], prices_known: bool) -> dict:
    """Per model call, in order: when (seconds, tick), latency, the gap after it, context size, the
    first tool's category, and cumulative cost and tokens after it."""
    s = {k: [] for k in ("seconds", "tick", "latency", "gap", "context", "category", "cost", "input_uncached", "cache_read", "cache_write", "output", "reasoning")}
    totals = Counter()
    for t in turns:
        s["seconds"].append(t["at"])
        s["tick"].append(t["tick"])
        s["latency"].append(t["model_seconds"])
        s["gap"].append(t["then_seconds"])
        s["context"].append(t["context_tokens"])
        s["category"].append(t["actions"][0]["category"] if t["actions"] else None)
        for k, src in (("cost", "cost"), ("input_uncached", "input_uncached"), ("cache_read", "cache_read"), ("cache_write", "cache_write"), ("output", "output_tokens"), ("reasoning", "reasoning_tokens")):
            totals[k] += t[src] or 0
            s[k].append(round(totals[k], 6) if k == "cost" else totals[k])
    if not prices_known:
        s["cost"] = [None] * len(turns)
    return s


def sdk_of(world_log: str, t0_epoch: float, clock: Clock, end_tick: int | None) -> dict:
    """The rs-sdk actions from the gateway's log: every action with its time and result, binned per
    BUCKET ticks by function, and the times scripts connected. The harness's own logouts (sessions
    that only click the logout button) are left out."""
    sessions: list[dict] = []
    current = None
    for line in world_log.splitlines():
        if m := re.search(r"SDK connected: sdk-(\d+)-", line):
            current = {"seconds": round(int(m.group(1)) / 1000 - t0_epoch, 1), "actions": []}
            sessions.append(current)
        elif (m := re.search(r"SDK action: (\w+) \(act-(\d+)-", line)) and current is not None:
            current["actions"].append([round(int(m.group(2)) / 1000 - t0_epoch, 2), m.group(1), None, ""])
        elif (m := re.search(r"Action result: (success|failed)(.*)", line)) and current is not None and current["actions"] and current["actions"][-1][2] is None:
            current["actions"][-1][2] = m.group(1) == "success"
            current["actions"][-1][3] = m.group(2)
    agent = [s for s in sessions if not (s["actions"] and all(a[1] == "clickComponent" and "2458" in a[3] for a in s["actions"]))]
    agent = [s for s in agent if s["actions"] or end_tick is None or clock.tick(s["seconds"]) <= end_tick]
    functions: list[str] = []
    bins: dict[tuple[int, int], list[int]] = {}
    mix: dict[str, list[int]] = {}
    for s in agent:
        for t, fn, ok, _ in s["actions"]:
            tick = clock.tick(t)
            if end_tick is not None and tick > end_tick:
                continue
            if fn not in functions:
                functions.append(fn)
            b = bins.setdefault((tick // BUCKET * BUCKET, functions.index(fn)), [0, 0])
            b[0 if ok else 1] += 1
            mix.setdefault(fn, [0, 0])[0 if ok else 1] += 1
    return {
        "functions": functions,
        "bins": [[t, f, ok, failed] for (t, f), (ok, failed) in sorted(bins.items())],
        "scripts": [s["seconds"] for s in agent],
        "mix": mix,
    }


def world_of(raw: bytes, account: str, start_tick: int | None, end_tick: int | None) -> dict:
    """Our account in the world recording: where it was every tick it moved, what it did per BUCKET
    ticks, its deaths and teleports, and the NPCs it faced. Ticks count from start_tick (the tick
    the agent got the game; when the harness didn't record it, the tick the account joined)."""
    lines = gzip.decompress(raw).decode().splitlines()
    msgs = (json.loads(line) for line in lines)
    slot = pos = None
    path: list[list[int]] = []  # [tick, x, z, level, jump]
    buckets: dict[int, list[int]] = {}  # tick -> [moving, running, animations, tiles]
    anims: dict[int, Counter] = {}
    deaths, teleports, faced = [], [], []
    npc_type: dict[int, int] = {}
    for m in msgs:
        if m["t"] == "roster":
            for row in m.get("p") or m.get("j") or []:
                if str(row[1]).lower() == account.lower():
                    slot = row[0]
                    if start_tick is None:
                        start_tick = m["k"]
            continue
        if m["t"] != "tick" or start_tick is None:
            continue
        k = m["k"] - start_tick
        for n in m.get("n", ()):
            if "t" in n:
                npc_type[n["i"]] = n["t"]
        if end_tick is not None and k > end_tick:
            break
        me = next((p for p in m.get("p", ()) if p["i"] == slot), None)
        if me is None:
            if k >= 0 and not path and pos is not None:
                path.append([k, *pos, 1])
            continue
        jump = moved = False
        old = pos
        if "x" in me:
            pos = (me["x"], me["z"], me.get("l", 0))
            moved = True
            jump = old is None or me.get("f") == 1 or bool(me.get("tp")) or abs(pos[0] - old[0]) + abs(pos[1] - old[1]) > 2
        elif "m" in me and pos is not None:
            x, z, level = pos
            for d in me["m"]:
                x += DX[d]
                z += DZ[d]
            pos = (x, z, level)
            moved = True
        if k < 0:  # before the agent got the game: only follow where the account is
            continue
        if not path and pos is not None and (not moved or old is not None):
            path.append([k, *(old if moved else pos), 1])
        if moved and old is not None and (me.get("tp") or me.get("f") == 1) and abs(pos[0] - old[0]) + abs(pos[1] - old[1]) > JUMP:
            teleports.append([k, *pos])
        b = buckets.setdefault(k // BUCKET * BUCKET, [0, 0, 0, 0])
        if "m" in me and not me.get("tp"):
            b[0] += 1
            b[3] += len(me["m"])
            if len(me["m"]) == 2:
                b[1] += 1
        if "an" in me and me["an"][0] != -1:
            b[2] += 1
            anims.setdefault(k // BUCKET * BUCKET, Counter())[me["an"][0]] += 1
            if me["an"][0] == DEATH_ANIM and (not deaths or k - deaths[-1] > 10):
                deaths.append(k)
        if "fe" in me and 0 <= me["fe"] < 32768 and me["fe"] in npc_type:
            faced.append((k, npc_type[me["fe"]]))
        if moved and pos is not None:
            path.append([k, *pos, 1 if jump else 0])
    return {"start_tick": start_tick, "path": path, "buckets": buckets, "anims": anims, "deaths": deaths, "teleports": teleports, "faced": faced}


def downsample(path: list[list[int]], every: int) -> list[list[int]]:
    """One point per `every` ticks, plus every jump (with the point before it, so a line stops
    where the jump began) and the last point. A jump point carries a fifth element, 1."""
    out: list[list[int]] = []
    for i, p in enumerate(path):
        nxt_jump = i + 1 < len(path) and path[i + 1][4]
        if not out or p[4] or nxt_jump or i == len(path) - 1 or p[0] - out[-1][0] >= every:
            out.append(p[:4] + ([1] if p[4] and out else []))
    return out


SEQ_NAMES: dict[int, str] | None = None


def seq_names() -> dict[int, str]:
    """Animation names from rs-sdk's content (RS_SDK_CONTENT, else the checkouts image/build.sh and
    the README use); empty when there is none here."""
    global SEQ_NAMES
    if SEQ_NAMES is None:
        SEQ_NAMES = {}
        for root in [os.environ.get("RS_SDK_CONTENT"), SITE.parent / ".cache/rs-sdk/server/content", Path.home() / "src/rs-sdk/server/content"]:
            if root and (Path(root) / "pack/seq.pack").exists():
                for line in (Path(root) / "pack/seq.pack").read_text().splitlines():
                    i, _, name = line.partition("=")
                    if i.isdigit():
                        SEQ_NAMES[int(i)] = name
                break
    return SEQ_NAMES


def quest_done(quest: dict, varps: dict) -> bool:
    for alt in quest["complete"]:
        v = int(varps.get(str(alt["varp"]), 0))
        if "bits" in alt:
            lo, hi = alt["bits"]
            v = (v >> lo) & ((1 << (hi - lo + 1)) - 1)
        if v == alt["value"] if alt["op"] == "eq" else v >= alt["value"]:
            return True
    return False


def states_of(raw: bytes | None, end_tick: int | None) -> list[dict]:
    """The accounts' saved states over time (harness record_state), each record made whole: [{tick,
    seconds, attempt, accounts: {name: state}}]. Seconds are on the harness's clock (not shifted)."""
    if not raw:
        return []
    out, now = [], {}
    for line in gzip.decompress(raw).decode().splitlines():
        r = json.loads(line)
        for name, change in r["accounts"].items():
            s = now.setdefault(name, {"xp": {}, "varps": {}, "inv": {}, "worn": {}, "bank": {}})
            for k, v in change.items():
                if isinstance(v, dict):
                    s[k] = {i: n for i, n in {**s.get(k, {}), **v}.items() if n}
                else:
                    s[k] = v
        out.append({**r, "tick": min(r["tick"], end_tick) if end_tick is not None else r["tick"], "accounts": json.loads(json.dumps(now))})
    return out


def xp_series(states: list[dict]) -> dict[str, list[list[float]]]:
    """XP per skill over time, summed over the accounts: [tick, xp] where it changed."""
    out: dict[str, list[list[float]]] = {}
    for r in states:
        total = Counter()
        for s in r["accounts"].values():
            total.update(s["xp"])
        for skill in set(total) | set(out):
            v = round(total.get(skill, 0), 1)
            series = out.setdefault(skill, [])
            if not series or series[-1][1] != v:
                if series and series[-1][0] == r["tick"]:
                    series[-1][1] = v
                else:
                    series.append([r["tick"], v])
    return out


def quests_of(base: str, timeline: list[dict], states: list[dict], world: dict | None, quests: list[dict], starts) -> list[dict]:
    """Quests completed and when. From the saved varps when the harness recorded the states, or
    from the timeline when the eval's measure is a quest's own varp ('varp'); else, for quest
    points, guessed from each jump, where the account was and whom it last spoke to ('inferred')."""
    by_id = {q["id"]: q for q in quests}
    done: list[dict] = []
    if states:
        prev: dict[str, set[str]] = {}
        for i, r in enumerate(states):
            reset = i == 0 or r.get("attempt") != states[i - 1].get("attempt")
            for name, s in r["accounts"].items():
                now = {q["id"] for q in quests if quest_done(q, s["varps"])}
                if not reset:  # a reset (a new attempt) puts the account back: nothing is newly done
                    for qid in sorted(now - prev.get(name, set())):
                        q = by_id[qid]
                        done.append({"quest": qid, "name": q["name"], "qp": q["qp"], "tick": r["tick"], "attempt": r.get("attempt", 1), "account": name, "source": "varp"})
                prev[name] = now
        return done
    if base == "cooks_assistant":
        q = by_id.get("cooks_assistant", {"id": "cooks_assistant", "name": "Cook's Assistant", "qp": 1})
        seen = set()
        for p in timeline:
            a = p.get("attempt", 1)
            if p["value"] >= 2 and a not in seen:
                seen.add(a)
                done.append({"quest": q["id"], "name": q["name"], "qp": q["qp"], "tick": p["tick"], "attempt": a, "account": None, "source": "varp"})
        return done
    if base != "quest_points" or not world:
        return done
    path, faced = world["path"], world["faced"]
    ticks = [p[0] for p in path]
    taken: set[str] = set()
    for prev, p in zip(timeline, timeline[1:]):
        delta = p["value"] - prev["value"]
        if delta <= 0 or p.get("attempt") != prev.get("attempt"):
            continue
        lo, hi = prev["tick"], p["tick"]
        near = [q for q in path[max(0, bisect.bisect_left(ticks, lo - BUCKET) - 1): bisect.bisect_right(ticks, hi)]]
        spoke = [(t, n) for t, n in faced if lo - 6 * BUCKET <= t <= hi]
        scored = []
        for qid, (npcs, (qx, qz)) in QUEST_HINTS.items():
            q = by_id.get(qid)
            if q is None or q["qp"] != delta or qid in taken:
                continue
            dist = min((abs(x - qx) + abs(z - qz) for _, x, z, _, _ in near), default=None)
            last = max((t for t, n in spoke if n in npcs), default=None)
            at = dist is not None and dist <= 30
            if at or last is not None:
                scored.append((at and last is not None, at, last or -1, qid))
        best = max(scored, default=None)
        q = by_id.get(best[3]) if best else None
        if q:
            taken.add(q["id"])
        done.append({"quest": q and q["id"], "name": q and q["name"], "qp": delta, "tick": hi, "attempt": p.get("attempt", 1), "account": None, "source": "inferred"})
    return done


def activity_of(world: dict, sdk: dict | None, end_tick: int | None) -> list[list]:
    """Per BUCKET ticks: [tick, ticks moving, ticks running, animations started, tiles walked, the
    most common animation's name (or id), SDK actions]."""
    names = seq_names()
    sdk_count = Counter()
    for t, _, ok, failed in (sdk or {}).get("bins", []):
        sdk_count[t] += ok + failed
    last = (end_tick if end_tick is not None else max(world["buckets"], default=0)) // BUCKET * BUCKET
    rows = []
    for t in range(0, last + 1, BUCKET):
        moving, running, anims, tiles = world["buckets"].get(t, [0, 0, 0, 0])
        top = world["anims"].get(t, Counter()).most_common(1)
        anim = (names.get(top[0][0], str(top[0][0])) if top else None)
        rows.append([t, moving, running, anims, tiles, anim, sdk_count.get(t, 0)])
    return rows


def last_answer(sample) -> str | None:
    for m in reversed(sample.messages):
        if m.role == "assistant" and m.text:
            return m.text[:4000]
    return None


def grid_of(budget: int, attempts: int) -> list[int]:
    end = budget * attempts
    return [round(i * end / (GRID - 1)) for i in range(GRID)]


def resample(grid: list[int], timeline: list[dict], clock: Clock, turns: list[dict], end_tick: int | None, has_cost: bool) -> dict:
    """One run on the eval's tick grid: the value held, the clock's seconds and the cost spent by
    then; null past the run's end."""
    ticks = [p["tick"] for p in timeline]
    done_at = [t["at"] + t["model_seconds"] for t in turns]
    cum, total = [], 0.0
    for t in turns:
        total += t["cost"] or 0
        cum.append(total)
    order = sorted(range(len(turns)), key=lambda i: done_at[i])
    done_sorted = [done_at[i] for i in order]
    cum_sorted, running = [], 0.0
    for i in order:
        running += turns[i]["cost"] or 0
        cum_sorted.append(running)
    out = {"seconds": [], "cost": [], "value": []}
    for g in grid:
        if end_tick is None or g > end_tick or not timeline:
            out["seconds"].append(None)
            out["cost"].append(None)
            out["value"].append(None)
            continue
        i = bisect.bisect_right(ticks, g) - 1
        s = clock.seconds(g)
        j = bisect.bisect_right(done_sorted, s) - 1
        out["seconds"].append(s)
        out["value"].append(timeline[i]["value"] if i >= 0 else None)
        out["cost"].append(round(cum_sorted[j], 5) if j >= 0 else 0.0 if has_cost else None)
    return out


def export_sample(log, info, s, prices: dict, quests: list[dict], out: Path, solver: str, solver_params: dict) -> tuple[dict, dict, dict, dict]:
    spec = log.eval
    m = s.metadata
    attempts = m.get("attempts", 1)
    eval_id = eval_of(spec.task, attempts)
    base = eval_base(spec.task)
    main_score = next((sc for name, sc in s.scores.items() if name == "ticks_to_target"), next(iter(s.scores.values())))
    md = main_score.metadata or {}
    files = run_dir_files(m["run_dir"]) if m.get("run_dir") else {}
    game = m.get("game") or {}
    end_tick = game.get("ticks")
    tick_ms = int(m["world"]["NODE_TICKRATE"])
    raw_timeline = m.get("timeline") or []
    offset = raw_timeline[0]["seconds"] if raw_timeline else 0.0
    timeline = timeline_of(raw_timeline, end_tick)
    clock = Clock(timeline, tick_ms)
    starts = attempt_starts(timeline)
    turns = turns_of(s, prices, clock, starts)
    usage = s.model_usage or {}
    account = m["accounts"][0]["username"]
    run_id = f"{spec.run_id[:8]}-{spec.task_id[:6]}-{s.id}-{s.epoch}"
    t0 = next((e.timestamp for e in s.events if e.event == "info" and e.source == "score over time"), s.events[0].timestamp)
    agent_version = next((e.data.get("version") for e in s.events if e.event == "info" and e.source == "inspect_swe" and isinstance(e.data, dict)), None) or solver_params.get("version")

    world = world_of(files["world.jsonl.gz"], account, game.get("start_tick"), end_tick) if "world.jsonl.gz" in files else None
    sdk = sdk_of(files["world.log"].decode(errors="replace"), t0.timestamp(), clock, end_tick) if "world.log" in files else None
    states = states_of(files.get("states.jsonl.gz"), end_tick)
    for r in states:
        r["seconds"] = round(r["seconds"] - offset, 1)
    quests_done = quests_of(base, timeline, states, world, quests, starts)
    xp = xp_series(states) if states else None

    # Events, on both clocks.
    events: list[dict] = []
    for a, t, sec in starts:
        if a > 1 or attempts > 1:
            events.append({"tick": t, "seconds": sec, "kind": "attempt", "attempt": a})
    for sec in (sdk or {}).get("scripts", []):
        events.append({"tick": clock.tick(sec), "seconds": sec, "kind": "script"})
    if world:
        for t in world["deaths"]:
            events.append({"tick": t, "seconds": clock.seconds(t), "kind": "death"})
        for t, x, z, level in world["teleports"]:
            events.append({"tick": t, "seconds": clock.seconds(t), "kind": "teleport", "x": x, "z": z, "level": level})
    for q in quests_done:
        events.append({"tick": q["tick"], "seconds": clock.seconds(q["tick"]), "kind": "quest", "quest": q["quest"], "name": q["name"], "qp": q["qp"], "source": q["source"]})
    if states:
        levels: dict[tuple[str, str], int] = {}
        for i, r in enumerate(states):
            for name, st in r["accounts"].items():
                for skill, v in st["xp"].items():
                    lv = level_of(v)
                    if i and lv > levels.get((name, skill), 1):
                        events.append({"tick": r["tick"], "seconds": r["seconds"], "kind": "level", "skill": skill, "level": lv})
                    levels[(name, skill)] = lv
    events.sort(key=lambda e: (e["tick"], e["kind"]))

    activity = activity_of(world, sdk, end_tick) if world else None
    path = world["path"] if world else []

    # Metrics.
    model_turns = [t for t in turns if t["stop_reason"] != "game_over" or t["output_tokens"]]
    latencies = [t["model_seconds"] for t in model_turns]
    gaps = [t["then_seconds"] for t in turns if t["then_seconds"] is not None]
    tool_mix = Counter(a["category"] for t in turns for a in t["actions"])
    tool_names = Counter(a["tool"] for t in turns for a in t["actions"])
    tool_errors = Counter()
    for e in s.events:
        if e.event == "tool" and e.error and e.error.type != "cancelled":
            tool_errors[e.error.type] += 1
    in_uncached = sum(u.input_tokens or 0 for u in usage.values())
    cache_read = sum(u.input_tokens_cache_read or 0 for u in usage.values())
    cache_write = sum(u.input_tokens_cache_write or 0 for u in usage.values())
    all_in = in_uncached + cache_read + cache_write
    costs = [usage_cost(canonical_model(model), u, prices) for model, u in usage.items()]
    cost_by = {k: round(sum(c[k] for c in costs), 5) for k in ("input", "output", "cache_read", "cache_write")} if costs and all(costs) else None
    first = next((p for p in timeline if p["value"] != timeline[0]["value"]), None) if timeline else None
    buckets = (world or {}).get("buckets", {})
    sdk_by_bucket = {r[0]: r[6] for r in activity or []}
    played = [t for t in range(0, (end_tick or 0) + 1, BUCKET)] if end_tick else []
    idle = [t for t in played if not any(buckets.get(t, [0, 0, 0, 0])[:3]) and not sdk_by_bucket.get(t)]
    model_seconds = sum(latencies)
    metrics = {
        "first_progress_tick": first and first["tick"],
        "first_progress_seconds": first and first["seconds"],
        "input_uncached": in_uncached,
        "cache_read": cache_read,
        "cache_write": cache_write,
        "reasoning_tokens": sum(u.reasoning_tokens or 0 for u in usage.values()) if any(u.reasoning_tokens is not None for u in usage.values()) else None,
        "cache_hit_rate": round(cache_read / all_in, 4) if all_in else None,
        "max_context_tokens": max((t["context_tokens"] or 0 for t in turns), default=None) or None,
        "cost_by": cost_by,
        "wall_seconds": round(s.total_time, 1) if s.total_time is not None else None,
        "setup_seconds": round((t0 - datetime.fromisoformat(str(s.started_at))).total_seconds(), 1) if s.started_at else None,
        "latency_p50": pct(latencies, 0.5),
        "latency_p90": pct(latencies, 0.9),
        "gap_p50": pct(gaps, 0.5),
        "gap_p90": pct(gaps, 0.9),
        "tool_seconds": round(sum(gaps), 1),
        "model_share": round(model_seconds / (model_seconds + sum(gaps)), 3) if model_seconds + sum(gaps) > 0 and turns else None,
        "stop_reasons": dict(Counter(t["stop_reason"] for t in turns if t["stop_reason"])),
        "model_errors": sum(1 for t in turns if t["error"]),
        "tool_mix": dict(tool_mix),
        "tool_names": dict(tool_names),
        "tool_errors": dict(tool_errors),
        "sdk_actions": sum(ok + failed for ok, failed in sdk["mix"].values()) if sdk else None,
        "sdk_failed": sum(failed for _, failed in sdk["mix"].values()) if sdk else None,
        "sdk_mix": sdk["mix"] if sdk else None,
        "scripts_run": len(sdk["scripts"]) if sdk else None,
        "tiles_walked": sum(b[3] for b in buckets.values()) if world else None,
        "moving_ticks": sum(b[0] for b in buckets.values()) if world else None,
        "running_ticks": sum(b[1] for b in buckets.values()) if world else None,
        "idle_share": round(len(idle) / len(played), 3) if world and played else None,
        "teleports": len(world["teleports"]) if world else None,
        "deaths": len(world["deaths"]) if world else None,
        "regions_visited": len({(x >> 6, z >> 6) for _, x, z, _, _ in path}) if world else None,
        "quests": quests_done,
    }

    run = {
        "id": run_id,
        "eval": eval_id,
        "agent": solver,
        "agent_name": AGENT_NAMES.get(solver, solver),
        "agent_params": solver_params,
        "agent_version": agent_version,
        "model": canonical_model(spec.model),
        "vendor": vendor_of(canonical_model(spec.model)),
        "epoch": s.epoch,
        "started": spec.created,
        "sample_started": str(s.started_at) if s.started_at else None,
        "commit": spec.revision.commit if spec.revision else None,
        "batch": Path(info.name).parent.name,
        "eval_set_id": spec.eval_set_id,
        "success": main_score.value == 1 if "target" in md else None,
        "score": main_score.value,
        "scores": {k: v.value for k, v in s.scores.items()},
        "ticks": md.get("ticks"),
        "seconds": md.get("seconds"),
        "budget_ticks": m["budget_ticks"],
        "tick_ms": tick_ms,
        "attempts": attempts,
        "attempt_results": md.get("attempts"),
        "ended_by": game.get("ended_by"),
        "limit": s.limit.type if s.limit else None,
        "game_ticks": end_tick,
        "game_seconds": round(game["seconds"] - offset, 1) if game.get("seconds") is not None else None,
        "final_value": timeline[-1]["value"] if timeline else None,
        "target": m.get("target"),
        "model_calls": len(turns),
        "tool_calls": sum(len(t["actions"]) for t in turns),
        "model_seconds": round(sum(t["model_seconds"] for t in turns), 1),
        "output_tokens_per_second": round(sum(t["output_tokens"] or 0 for t in turns) / max(1e-9, sum(t["model_seconds"] for t in turns if t["output_tokens"])), 1) if turns else None,
        "input_tokens": all_in,
        "output_tokens": sum(u.output_tokens for u in usage.values()),
        "cost": cost(usage, prices),
        "has_replay": "world.jsonl.gz" in files,
        "account": account,
        "start_tick": game.get("start_tick") or (world and world["start_tick"]),
        "screenshot": f"runs/{run_id}.jpg" if (out / "runs" / f"{run_id}.jpg").exists() else None,
        "metrics": metrics,
    }
    evl = {
        "id": eval_id, "base": base, "title": eval_title(eval_id), "measure": MEASURES.get(base, "Value"),
        "goal": s.input if isinstance(s.input, str) else str(s.input), "budget_ticks": m["budget_ticks"], "tick_ms": tick_ms,
        "attempts": attempts, "target": m.get("target"), "accounts": [a["username"] for a in m["accounts"]], "task_file": spec.task_file,
    }
    detail = {
        **run,
        "goal": evl["goal"],
        "prompt": next((msg.text for msg in s.messages if msg.role == "user"), None),
        "timeline": change_points(timeline),
        "score_metadata": {k: v.metadata for k, v in s.scores.items()},
        "turns": turns,
        "path": downsample(path, PATH_EVERY),
        "series": {
            "calls": call_series(turns, run["cost"] is not None),
            "sdk": {"bucket_ticks": BUCKET, "functions": sdk["functions"], "bins": sdk["bins"]} if sdk else None,
            "activity": {"bucket_ticks": BUCKET, "rows": activity} if activity is not None else None,
            "xp": xp,
        },
        "events": events,
        "has_states": bool(states),
        "answer": last_answer(s),
        "program_output": (m.get("program") or {}).get("output"),
        "log": Path(info.name).name,
    }
    (out / "runs" / f"{run_id}.json").write_text(json.dumps(detail, separators=(",", ":")))
    if "world.jsonl.gz" in files:
        (out / "runs" / f"{run_id}.world.jsonl.gz").write_bytes(files["world.jsonl.gz"])
    grid = resample(grid_of(m["budget_ticks"], attempts), timeline, clock, turns, end_tick, run["cost"] is not None)
    grid["path"] = downsample(path, EVAL_PATH_EVERY)
    return run, evl, detail, grid


def export(log_dirs: list[str], prices: dict, out: Path):
    """Writes index.json, runs/<id>.json, evals/<id>.json and each run's recording; leaves
    screenshots and character renders (runs/<id>.*, made by other scripts) in place."""
    (out / "runs").mkdir(parents=True, exist_ok=True)
    (out / "evals").mkdir(parents=True, exist_ok=True)
    quests = json.loads(QUESTS.read_text()) if QUESTS.exists() else []
    runs, evals, grids = [], {}, {}
    for log_dir in log_dirs:
        for info in list_eval_logs(log_dir):
            log = read_eval_log(info.name, resolve_attachments=True)
            if log.status != "success" or not log.samples:
                continue  # failed logs are retried by eval-set; their samples have no scores
            solver, solver_params = agent_of(log.plan.steps)
            if solver == "command":
                continue  # scripted programs play without a model; the site is about models
            for s in log.samples:
                if s.error or not s.scores:
                    continue
                run, evl, _, grid = export_sample(log, info, s, prices, quests, out, solver, solver_params)
                runs.append(run)
                evals.setdefault(run["eval"], evl)
                grids.setdefault(run["eval"], {})[run["id"]] = grid
    runs.sort(key=lambda r: (r["eval"], r["model"], r["agent"], r["started"], r["epoch"]))
    keep = {r["id"] for r in runs}
    for f in (out / "runs").iterdir():  # this script's files of runs no longer in these logs
        if f.name.endswith((".json", ".world.jsonl.gz")) and f.name.split(".")[0] not in keep:
            f.unlink()
    for eval_id, by_run in grids.items():
        e = evals[eval_id]
        (out / "evals" / f"{eval_id}.json").write_text(json.dumps({
            "eval": eval_id,
            "ticks": grid_of(e["budget_ticks"], e["attempts"]),
            "path_every": EVAL_PATH_EVERY,
            "runs": by_run,
        }, separators=(",", ":")))
    for f in (out / "evals").iterdir():
        if f.suffix == ".json" and f.stem not in evals:
            f.unlink()
    vendors = {v: VENDORS.get(v, v.capitalize()) for v in sorted({r["vendor"] for r in runs if r["vendor"]})}
    (out / "index.json").write_text(json.dumps({"evals": sorted(evals.values(), key=lambda e: e["id"]), "runs": runs, "prices": prices, "vendors": vendors}))
    print(f"{len(runs)} runs, {len(evals)} evals:", dict(Counter((r['eval'], r['model'], r['agent_name']) for r in runs)))


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("log_dirs", nargs="+")
    ap.add_argument("--prices", default="prices.yaml")
    ap.add_argument("--out", default="site/public/data")
    a = ap.parse_args()
    export(a.log_dirs, yaml.safe_load(open(a.prices)) if Path(a.prices).exists() else {}, Path(a.out))
