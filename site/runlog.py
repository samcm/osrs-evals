"""One run's full record, read from its Inspect log and run folder: the agents' conversations as
text, the scripts they wrote, and facts measured from the data (no model).

    python site/runlog.py <logs dir> [...] [--data site/public/data] [--only <run id> ...]

writes runs/<id>.facts.json for every exported run (site/summarize.py does too, before it tells a
run). A run's sample is found through its exported runs/<id>.json (`batch`, `log`), in the given
logs dirs: <dir>/<batch>/<log> or <dir>/<log>; its run folder is the sample's `run_dir` or, for logs
moved off the machine that ran them, <log without .eval>/<sample>-<epoch> beside it.

An omp run's model calls are several conversations: the agent's own (its first message is the
eval's prompt), its subagents' (omp's task tool, each opened with "Complete assignment"), and omp's
helpers (a background job's watcher, a task's title), which make no tool calls of their own beyond
`respond`. Facts count the agent and its subagents; helpers are left out.
"""

import argparse
import hashlib
import json
import re
import sys
from collections import Counter
from concurrent.futures import ProcessPoolExecutor
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import export  # noqa: E402  (the export's own readers of the run folder, so both read it one way)

RESULT_CHARS = 6000  # a tool result in the transcript, beyond which it is cut in the middle
THOUGHT_CHARS = 2000  # the model's reasoning before a call
BACKGROUND = re.compile(r"\bnohup\b|\bsetsid\b|\bdisown\b|\btmux\b|\bscreen -d|&\s*(?:$|;|\n|echo|sleep|disown|wait\b|PID|pid)", re.M)
SERVER_SOURCE = re.compile(r"/opt/server\b")
HEREDOC = re.compile(r"cat\s*>\s*([\w./-]+)\s*<<-?\s*['\"]?(\w+)['\"]?[^\n]*\n(.*?)\n\2\s*$", re.S | re.M)
WIKI = re.compile(r"(?:runescape|osrs|2004scape)\.(?:wiki|fandom)|wiki\.(?:runescape|osrs)|curl\s+[^|;]*https?://", re.I)


def text_of(m) -> str:
    c = m.content
    if isinstance(c, str):
        return c
    return "\n".join(getattr(x, "text", None) or "" for x in c)


def reasoning_of(m) -> str:
    c = m.content
    if isinstance(c, str):
        return ""
    # Redacted reasoning is an encrypted blob; its readable summary stands in for it
    texts = [(x.summary if getattr(x, "redacted", False) else x.reasoning) or "" for x in c if getattr(x, "type", "") == "reasoning"]
    return "\n".join(t for t in texts if t)


def sample_ref(run_id: str) -> tuple[str, int]:
    """(sample id, epoch) from an exported run id <run>-<task>-<sample>-<epoch>."""
    rest, epoch = run_id.rsplit("-", 1)
    return rest.split("-", 2)[2], int(epoch)


def find_log(detail: dict, log_dirs: list[str]) -> Path:
    for d in log_dirs:
        for p in (Path(d) / detail["batch"] / detail["log"], Path(d) / detail["log"]):
            if p.exists():
                return p
    raise FileNotFoundError(f"{detail['log']} is in none of {log_dirs}")


def read_sample(log: Path, run_id: str):
    from inspect_ai.log import read_eval_log_sample

    sid, epoch = sample_ref(run_id)
    return read_eval_log_sample(str(log), id=int(sid) if sid.isdigit() else sid, epoch=epoch, resolve_attachments=True)


def run_folder(log: Path, sample) -> Path | None:
    rd = (sample.metadata or {}).get("run_dir")
    if not rd:
        return None
    for p in (Path(rd), log.with_suffix("") / rd.rstrip("/").split("/")[-1]):
        if p.is_dir():
            return p
    return None


def conversations(sample) -> list[dict]:
    """The sample's model calls grouped into conversations, in the order they began: each with its
    kind ("agent", "subagent" or "helper"), its opening message and the indexes of its calls among
    the sample's model events (the exported run's turns, one to one)."""
    calls = [e for e in sample.events if e.event == "model"]
    goal = (sample.input if isinstance(sample.input, str) else text_of(sample.input[0]))[:200]
    convs: dict[str, dict] = {}
    for i, e in enumerate(calls):
        system = "|".join(text_of(m) for m in e.input if m.role == "system")[:4000]
        rest = [m for m in e.input if m.role != "system"]
        first = text_of(rest[0]) if rest else ""
        key = hashlib.sha1((system + "\0" + first).encode()).hexdigest()
        c = convs.setdefault(key, {"opening": first, "system": hashlib.sha1(system.encode()).hexdigest(), "calls": [], "tools": Counter(), "compactions": 0,
                                   "carried": [m.tool_call_id for m in rest if m.role == "tool"]})
        c["calls"].append(i)
    # omp compacts a long conversation and goes on in a new one that opens with what came before
    # ("Resume prior conversation", "Context replaced"): join it to the one it continues, found by
    # the tool results it carried over, else the last one with the same system prompt
    roots: list[dict] = []
    owner: dict[str, dict] = {}
    for c in sorted(convs.values(), key=lambda c: c["calls"][0]):
        head = re.sub(r"^<system-reminder>.*?</system-reminder>\s*", "", c["opening"], flags=re.S)[:200]
        parent = None
        if head.startswith(("Resume prior conversation", "Context replaced")):
            parent = next((owner[t] for t in c["carried"] if t in owner), None) or next(
                (r for r in reversed(roots) if r["system"] == c["system"] and r["calls"][-1] < c["calls"][0]), None)
        if parent:
            parent["calls"] = sorted(parent["calls"] + c["calls"])
            parent["compactions"] += 1
        else:
            roots.append(c)
        for i in c["calls"]:
            for tc in (calls[i].output.message.tool_calls or []) if calls[i].output and calls[i].output.choices else []:
                owner[tc.id] = parent or c
    out = roots
    for c in out:
        for i in c["calls"]:
            for tc in (calls[i].output.message.tool_calls or []) if calls[i].output and calls[i].output.choices else []:
                c["tools"][tc.function] += 1
        acts = sum(n for t, n in c["tools"].items() if t != "respond")
        if goal and goal in c["opening"]:
            c["kind"] = "agent"
        elif acts and "Complete assignment" in c["opening"][:400]:
            c["kind"] = "subagent"
        elif acts and not c["opening"].lstrip().startswith(("<job>", "<user>")):
            c["kind"] = "subagent"
        else:
            c["kind"] = "helper"
    return out


def clock(seconds: float) -> str:
    s = int(seconds)
    return f"{s // 3600}:{s // 60 % 60:02d}:{s % 60:02d}" if s >= 3600 else f"{s // 60}:{s % 60:02d}"


def middle_cut(text: str, n: int) -> str:
    if len(text) <= n:
        return text
    half = n // 2
    return f"{text[:half]}\n[... {len(text) - n:,} characters cut ...]\n{text[-half:]}"


def transcript(sample, conv: dict, turns: list[dict], tick_ms: int) -> str:
    """One conversation as text, call by call: when (tick and game time), what the model thought,
    said and called (in full: commands, the scripts it wrote), and what each call returned."""
    calls = [e for e in sample.events if e.event == "model"]
    results: dict[str, str] = {}
    errors: dict[str, str] = {}
    seen_users: set[str] = set()
    lines: list[str] = []
    first = calls[conv["calls"][0]]
    opening = [m for m in first.input if m.role != "system"]
    lines.append("=== opening message ===\n" + (text_of(opening[0]) if opening else ""))
    if opening:
        seen_users.add(hashlib.sha1(text_of(opening[0]).encode()).hexdigest())
    for n, i in enumerate(conv["calls"]):
        e = calls[i]
        for m in e.input:
            if m.role == "tool" and m.tool_call_id:
                results[m.tool_call_id] = text_of(m)
                if getattr(m, "error", None):
                    errors[m.tool_call_id] = str(m.error.message)
        # Messages that reached the model between calls: a background job's result, a subagent's
        # report, a summary after the context was compacted
        for m in e.input:
            if m.role == "user":
                h = hashlib.sha1(text_of(m).encode()).hexdigest()
                if h not in seen_users:
                    seen_users.add(h)
                    compacted = re.search(r"^(<system-reminder>.*?</system-reminder>\s*)?(Resume prior conversation|Context replaced)", text_of(m)[:600], re.S)
                    label = "context compacted: the agent went on from this summary" if compacted else "message to the agent"
                    lines.append(f"--- {label} ---\n" + middle_cut(text_of(m), RESULT_CHARS))
        t = turns[i] if i < len(turns) else {}
        tick = t.get("tick")
        when = f"tick {tick} ({clock(tick * tick_ms / 1000)} game time)" if tick is not None else "after the game"
        lines.append(f"\n=== call {n + 1} of {len(conv['calls'])}, {when} ===")
        if not (e.output and e.output.choices):
            lines.append(f"MODEL CALL FAILED: {str(e.error)[:300]}")
            continue
        msg = e.output.message
        if thought := reasoning_of(msg).strip():
            lines.append("THOUGHT: " + middle_cut(thought, THOUGHT_CHARS))
        if said := text_of(msg).strip():
            lines.append("SAID: " + said)
        for tc in msg.tool_calls or []:
            args = dict(tc.arguments or {})
            intent = args.pop("i", None) or args.pop("intent", None)
            head = f"CALL {tc.function}" + (f" ({intent})" if intent else "") + (" [background job]" if args.get("async") else "")
            if "command" in args and len(args) <= 3:
                body = str(args["command"])
            elif tc.function == "write" and "path" in args:
                body = f"{args['path']}:\n{args.get('content', '')}"
            else:
                body = json.dumps(args, indent=1, ensure_ascii=False)
            lines.append(f"{head}:\n{body}")
            # The result arrives in a later call's input (the conversation's next call)
            lines.append(("ERROR: " + errors[tc.id] + "\n" if tc.id in errors else "") + "RESULT:\n" + middle_cut(results.get(tc.id, "(no result recorded)"), RESULT_CHARS))
    return "\n".join(lines)


def written_files(sample, convs: list[dict]) -> dict[str, str]:
    """The last content each file got from the write tool or a shell heredoc (cat > f <<EOF), by
    path (agent and subagents)."""
    calls = [e for e in sample.events if e.event == "model"]
    out: dict[str, str] = {}
    for c in convs:
        if c["kind"] == "helper":
            continue
        for i in c["calls"]:
            e = calls[i]
            for tc in (e.output.message.tool_calls or []) if e.output and e.output.choices else []:
                a = tc.arguments or {}
                if tc.function == "write" and a.get("path") and isinstance(a.get("content"), str):
                    out[a["path"]] = a["content"]
                elif tc.function == "bash":
                    for path, _, body in HEREDOC.findall(str(a.get("command") or "")):
                        out[path if path.startswith("/") else f"/work/{path}"] = body
    return out


def facts_of(detail: dict, sample, convs: list[dict], folder: Path | None) -> dict:
    """What the data says about how the run went, measured, not told: who worked (subagents,
    background jobs, accounts), what it read, and where the score moved in game time."""
    calls = [e for e in sample.events if e.event == "model"]
    tick_ms = detail.get("tick_ms") or 600
    minutes = lambda tick: None if tick is None else round(tick * tick_ms / 60000, 1)
    end = detail.get("game_ticks") or 0
    budget = detail.get("budget_ticks") or end
    working = [c for c in convs if c["kind"] != "helper"]
    tool_calls = [(c["kind"], tc) for c in working for i in c["calls"] for tc in ((calls[i].output.message.tool_calls or []) if calls[i].output and calls[i].output.choices else [])]
    bash = [(k, tc) for k, tc in tool_calls if tc.function == "bash"]
    command = lambda tc: str((tc.arguments or {}).get("command") or "")
    touched = lambda tc: " ".join(str(v) for k, v in (tc.arguments or {}).items() if k in ("command", "path", "pattern", "paths"))
    jobs = [tc for _, tc in bash if (tc.arguments or {}).get("async")]
    detached = [tc for _, tc in bash if BACKGROUND.search(command(tc))]

    # The score over time, in game ticks
    timeline = detail.get("timeline") or []
    start_value = timeline[0]["value"] if timeline else None
    moves = [p for p in timeline if p["value"] != start_value]
    changes = [p for i, p in enumerate(timeline) if i and p["value"] != timeline[i - 1]["value"]]
    last_change = changes[-1]["tick"] if changes else None

    # The game: every account's moves and deaths, from the world recording; SDK actions from the gateway's log
    accounts = detail.get("accounts") or [detail.get("account")]
    moved, deaths, active_windows = {}, 0, {}
    first_action = None
    if folder and (folder / "world.jsonl.gz").exists():
        raw = (folder / "world.jsonl.gz").read_bytes()
        start = detail.get("start_tick")
        for a in accounts:
            w = export.world_of(raw, a, start, end)
            ticks = [t for t, b in w["buckets"].items() if b[0] or b[2]]
            moved[a] = len(ticks)
            deaths += len(w["deaths"])
            for t in ticks:  # accounts moving or acting in the same minute of game time
                active_windows.setdefault(t * tick_ms // 60000, set()).add(a)
    sdk_ticks = [b[0] for b in ((detail.get("series") or {}).get("sdk") or {}).get("bins", [])]
    if sdk_ticks:
        first_action = min(sdk_ticks)
    script_ticks = sorted(e["tick"] for e in detail.get("events", []) if e.get("kind") == "script")

    # The model's own gaps: the longest stretch of game time with no call from any agent
    call_ticks = sorted(t["tick"] for i, t in enumerate(detail.get("turns") or []) if any(i in c["calls"] for c in working) and t.get("tick") is not None)
    gaps = [b - a for a, b in zip([0] + call_ticks, call_ticks + [end])]
    last_call = call_ticks[-1] if call_ticks else None

    written = written_files(sample, convs)
    return {
        "game_minutes": minutes(end),
        "budget_minutes": minutes(budget),
        "ended_by": detail.get("ended_by"),
        # The agent ended the game (it said it was done) with this much of its budget left
        "quit_minutes_early": minutes(budget - end) if detail.get("ended_by") == "agent finished" and budget - end > budget * 0.02 else 0,
        "first_score_minutes": minutes(moves[0]["tick"]) if moves else None,
        "last_score_minutes": minutes(last_change),
        "flat_end_minutes": minutes(end - last_change) if last_change is not None else minutes(end),
        "score_changes": len(changes),
        "first_game_action_minutes": minutes(first_action),
        "scripts_run": len(script_ticks),
        "model_calls": len([i for c in working for i in c["calls"]]),
        "agent_calls": sum(len(c["calls"]) for c in working if c["kind"] == "agent"),
        "subagents": sum(1 for c in working if c["kind"] == "subagent"),
        "subagent_calls": sum(len(c["calls"]) for c in working if c["kind"] == "subagent"),
        "task_calls": sum(1 for _, tc in tool_calls if tc.function == "task"),
        "compactions": sum(c["compactions"] for c in working),
        "background_jobs": len(jobs),
        "detached_processes": len(detached),
        "longest_silence_minutes": minutes(max(gaps)) if gaps else None,
        "last_call_minutes": minutes(last_call),
        "accounts": len(accounts),
        "accounts_used": sum(1 for n in moved.values() if n) if moved else None,
        "most_accounts_at_once": max(map(len, active_windows.values())) if active_windows else None,
        "deaths": deaths if moved else None,
        "teleports": (detail.get("metrics") or {}).get("teleports"),
        "map_regions_visited": (detail.get("metrics") or {}).get("regions_visited"),
        "game_actions": (detail.get("metrics") or {}).get("sdk_actions"),
        "game_actions_failed_share": round(m["sdk_failed"] / m["sdk_actions"], 2) if (m := detail.get("metrics") or {}).get("sdk_actions") else None,
        "server_source_reads": sum(1 for _, tc in tool_calls if SERVER_SOURCE.search(touched(tc))),
        "web_searches": sum(1 for _, tc in tool_calls if tc.function in ("web_search", "fetch", "browser") or (tc.function == "bash" and WIKI.search(command(tc)))),
        "files_written": len(written),
        "attempts": detail.get("attempts"),
        "model_errors": (detail.get("metrics") or {}).get("model_errors"),
        "cost": detail.get("cost"),
    }


FACT_NOTES = {
    "game_minutes": "game time the run lasted",
    "budget_minutes": "game time it was allowed",
    "ended_by": "what ended the game: the budget, the target reached (done), or the agent saying it had finished",
    "quit_minutes_early": "game minutes left when the agent ended the game itself (0: it didn't)",
    "first_score_minutes": "game time when the score first moved (none: it never did)",
    "last_score_minutes": "game time of the score's last change",
    "flat_end_minutes": "game minutes from the score's last change to the end",
    "score_changes": "times the score changed",
    "first_game_action_minutes": "game time of the first action in the game (walk, talk, attack, ...) through the SDK",
    "scripts_run": "SDK scripts started against the game",
    "model_calls": "model calls by the agent and its subagents (omp's helpers left out)",
    "agent_calls": "model calls by the agent itself",
    "subagents": "subagents it handed tasks to (omp's task tool)",
    "subagent_calls": "model calls by those subagents",
    "task_calls": "times it called the task tool",
    "compactions": "times omp compacted a conversation that grew too long",
    "background_jobs": "shell commands it started as omp background jobs, to run while it went on",
    "detached_processes": "shell commands that left a process running on its own (nohup, &, setsid, tmux)",
    "longest_silence_minutes": "longest stretch of game time with no model call (scripts playing alone, or the agent waiting)",
    "last_call_minutes": "game time of the last model call",
    "accounts": "accounts the eval gave it",
    "accounts_used": "accounts that moved or acted in the game",
    "most_accounts_at_once": "most accounts moving or acting in the same game minute",
    "deaths": "deaths, all accounts",
    "teleports": "teleports",
    "map_regions_visited": "64x64-tile map regions the character went through",
    "game_actions": "SDK actions sent to the game",
    "game_actions_failed_share": "share of those actions that failed",
    "server_source_reads": "tool calls that read the game server's own source and content scripts (/opt/server)",
    "web_searches": "web searches and web page fetches",
    "files_written": "files it wrote (scripts and notes)",
    "attempts": "attempts the eval allowed",
    "model_errors": "model calls that failed",
    "cost": "the run's model cost in US dollars at list price",
}


def facts_text(facts: dict, peers: list[dict]) -> str:
    """The facts with what each means and, beside it, the same fact across the eval's runs (peers)."""
    lines = []
    for k, v in facts.items():
        line = f"{k}: {v}  ({FACT_NOTES.get(k, '')}"
        values = sorted(p[k] for p in peers if isinstance(p.get(k), (int, float)) and not isinstance(p.get(k), bool))
        if isinstance(v, (int, float)) and values:
            line += f"; across this eval's {len(peers)} runs: median {values[len(values) // 2]}, above 0 in {sum(1 for x in values if x > 0)}"
        lines.append(line + ")")
    return "\n".join(lines)


def load(detail: dict, log_dirs: list[str]):
    log = find_log(detail, log_dirs)
    sample = read_sample(log, detail["id"])
    convs = conversations(sample)
    return log, sample, convs, run_folder(log, sample)


def write_workspace(dest: Path, detail: dict, sample, convs: list[dict], folder: Path | None, facts: dict, peers: list[dict]) -> None:
    """A folder an agent can read to tell the run: its transcripts, the files it wrote, its run
    folder and its exported data."""
    dest.mkdir(parents=True, exist_ok=True)
    tick_ms = detail.get("tick_ms") or 600
    turns = detail.get("turns") or []
    n_sub = 0
    for c in convs:
        if c["kind"] == "agent":
            name = "transcript.txt"
        elif c["kind"] == "subagent":
            n_sub += 1
            (dest / "subagents").mkdir(exist_ok=True)
            name = f"subagents/{n_sub}.txt"
        else:
            continue
        (dest / name).write_text(transcript(sample, c, turns, tick_ms))
    files = dest / "files"
    for path, content in written_files(sample, convs).items():
        p = files / path.lstrip("/")
        try:
            p.parent.mkdir(parents=True, exist_ok=True)
            p.write_text(content)
        except OSError:
            pass  # a path that is also a folder (or a file on the way): it is in the transcript anyway
    (dest / "facts.txt").write_text(facts_text(facts, peers) + "\n")
    (dest / "run.json").write_text(json.dumps(detail))
    link = dest / "run_folder"
    if folder and not link.exists():
        link.symlink_to(folder.resolve())


def write_facts(run_id: str, data: Path, log_dirs: list[str]) -> str | None:
    """Writes runs/<id>.facts.json; what went wrong, if anything."""
    detail = json.loads((data / "runs" / f"{run_id}.json").read_text())
    try:
        _, sample, convs, folder = load(detail, log_dirs)
    except Exception as err:
        return str(err)
    (data / "runs" / f"{run_id}.facts.json").write_text(json.dumps(facts_of(detail, sample, convs, folder), separators=(",", ":")))
    return None


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    ap.add_argument("logs", nargs="+")
    ap.add_argument("--data", default="site/public/data")
    ap.add_argument("--only", nargs="*")
    ap.add_argument("--jobs", type=int, default=4)
    args = ap.parse_args()
    data = Path(args.data)
    ids = [r["id"] for r in json.loads((data / "index.json").read_text())["runs"] if not args.only or r["id"] in args.only]
    with ProcessPoolExecutor(args.jobs) as pool:
        errors = {i: e for i, e in zip(ids, pool.map(write_facts, ids, [data] * len(ids), [args.logs] * len(ids))) if e}
    for i, e in errors.items():
        print(f"{i}: {e}", file=sys.stderr)
    print(f"facts: {len(ids) - len(errors)} runs, {len(errors)} failed", file=sys.stderr)
    sys.exit(1 if errors else 0)


if __name__ == "__main__":
    main()
