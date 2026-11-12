"""Turn Inspect logs into the site's data: one index of every run, and one file per run.

    python site/export.py <log dir> [<log dir> ...] --prices prices.yaml --out site/public/data

A run is one sample of one log: an eval, an agent, a model, an epoch. Everything here is read from
the logs and the run folders next to them; nothing is recomputed from the game.
"""

import argparse
import gzip
import json
from collections import Counter
from pathlib import Path

import fsspec
import yaml
from inspect_ai.log import list_eval_logs, read_eval_log

IDEAS = Path(__file__).resolve().parent.parent / "ideas.yaml"
AGENT_NAMES = {"react": "Model + bash", "inspect_swe/claude_code": "Claude Code", "inspect_swe/codex_cli": "Codex", "command": "Program"}
EVAL_NAMES = {"cooks_assistant": "Cook's Assistant", "shrimps": "Cook 500 shrimps", "coins": "Coins", "gold": "Gold"}


def eval_of(task: str, attempts: int) -> str:
    """The eval a task runs, from its registered name (matrix tasks are named <eval>_<agent>)."""
    base = "cooks_assistant" if task.startswith("cooks") else task.split("_")[0] if task.startswith("shrimps") else task
    return f"{base}_x{attempts}" if attempts > 1 else base


def eval_title(eval_id: str) -> str:
    base, _, tries = eval_id.partition("_x")
    return EVAL_NAMES.get(base, base) + (f", {tries} tries" if tries else "")


def agent_of(steps) -> tuple[str, dict]:
    step = steps[-1]
    params = {k: v for k, v in (step.params or {}).items() if k in ("version", "cmd") and v not in (None, "auto")}
    return step.solver, params


def cost(usage: dict, prices: dict) -> float | None:
    total = 0.0
    for model, u in usage.items():
        p = prices.get(model)
        if not p:
            return None
        total += (
            u.input_tokens * p["input"]
            + u.output_tokens * p["output"]
            + (u.input_tokens_cache_write or 0) * p["input_cache_write"]
            + (u.input_tokens_cache_read or 0) * p["input_cache_read"]
        ) / 1e6
    return round(total, 5)


def run_dir_files(run_dir: str) -> dict[str, bytes]:
    fs, path = fsspec.core.url_to_fs(run_dir)
    out = {}
    for name in ["sample.json", "world.jsonl.gz", "program.log"]:
        if fs.exists(f"{path}/{name}"):
            with fs.open(f"{path}/{name}", "rb") as f:
                out[name] = f.read()
    return out


def turns_of(sample) -> list[dict]:
    """The agent's turns, the same way for every agent: each model call (when it started, how long
    it took, its tokens), the tool calls it made with their results, and how long until the next
    model call (the agent running its tools and code)."""
    results = {m.tool_call_id: m for m in sample.messages if m.role == "tool"}
    calls = [e for e in sample.events if e.event == "model"]
    t0 = sample.events[0].timestamp
    turns = []
    for i, e in enumerate(calls):
        u = e.output.usage if e.output else None
        msg = e.output.message if e.output and e.output.choices else None
        actions = []
        for tc in (msg.tool_calls or []) if msg else []:
            r = results.get(tc.id)
            args = tc.arguments or {}
            text = args.get("command") or args.get("cmd") or json.dumps(args)
            actions.append({"tool": tc.function, "input": str(text)[:4000], "output": (r.text[:3000] if r else None), "error": (r.error.message[:500] if r and r.error else None)})
        done = e.completed or e.timestamp
        nxt = calls[i + 1].timestamp if i + 1 < len(calls) else None
        turns.append({
            "at": round((e.timestamp - t0).total_seconds(), 1),
            "model_seconds": round(e.working_time or (done - e.timestamp).total_seconds(), 2),
            "then_seconds": round((nxt - done).total_seconds(), 1) if nxt else None,
            "input_tokens": u and (u.input_tokens + (u.input_tokens_cache_read or 0) + (u.input_tokens_cache_write or 0)),
            "output_tokens": u and u.output_tokens,
            "text": (msg.text[:2000] if msg and msg.text else None),
            "actions": actions,
            "error": str(e.error)[:300] if e.error else None,
        })
    return turns


def last_answer(sample) -> str | None:
    for m in reversed(sample.messages):
        if m.role == "assistant" and m.text:
            return m.text[:4000]
    return None


def start_tick(recording: bytes, account: str) -> int | None:
    """The engine tick at which the account joined the world in a recording (runs from before the
    harness recorded its start tick)."""
    for line in gzip.decompress(recording).decode().splitlines():
        m = json.loads(line)
        if m.get("t") == "roster":
            for row in m.get("p") or m.get("j") or []:
                if str(row[1]).lower() == account.lower():
                    return m["k"]
    return None


def export(log_dirs: list[str], prices: dict, out: Path):
    """Writes index.json and runs/<id>.json, and each run's recording; leaves screenshots
    (runs/<id>.jpg, made by capture.ts) in place."""
    (out / "runs").mkdir(parents=True, exist_ok=True)
    runs, evals = [], {}
    for log_dir in log_dirs:
        for info in list_eval_logs(log_dir):
            log = read_eval_log(info.name, resolve_attachments=True)
            if log.status != "success" or not log.samples:
                continue  # failed logs are retried by eval-set; their samples have no scores
            spec = log.eval
            solver, solver_params = agent_of(log.plan.steps)
            for s in log.samples:
                if s.error or not s.scores:
                    continue
                m = s.metadata
                attempts = m.get("attempts", 1)
                eval_id = eval_of(spec.task, attempts)
                main_score = next((sc for name, sc in s.scores.items() if name == "ticks_to_target"), next(iter(s.scores.values())))
                md = main_score.metadata or {}
                files = run_dir_files(m["run_dir"]) if m.get("run_dir") else {}
                turns = turns_of(s)
                usage = s.model_usage or {}
                run_id = f"{spec.run_id[:8]}-{spec.task_id[:6]}-{s.id}-{s.epoch}"
                run = {
                    "id": run_id,
                    "eval": eval_id,
                    "agent": solver,
                    "agent_name": AGENT_NAMES.get(solver, solver),
                    "agent_params": solver_params,
                    "model": spec.model,
                    "epoch": s.epoch,
                    "started": spec.created,
                    "commit": spec.revision.commit if spec.revision else None,
                    "success": main_score.value == 1 if "target" in md else None,
                    "score": main_score.value,
                    "scores": {k: v.value for k, v in s.scores.items()},
                    "ticks": md.get("ticks"),
                    "seconds": md.get("seconds"),
                    "budget_ticks": m["budget_ticks"],
                    "tick_ms": int(m["world"]["NODE_TICKRATE"]),
                    "attempts": attempts,
                    "attempt_results": md.get("attempts"),
                    "ended_by": (m.get("game") or {}).get("ended_by"),
                    "game_ticks": (m.get("game") or {}).get("ticks"),
                    "game_seconds": (m.get("game") or {}).get("seconds"),
                    "final_value": (m.get("timeline") or [{}])[-1].get("value"),
                    "target": m.get("target"),
                    "model_calls": len(turns),
                    "tool_calls": sum(len(t["actions"]) for t in turns),
                    "model_seconds": round(sum(t["model_seconds"] for t in turns), 1),
                    "output_tokens_per_second": round(sum(t["output_tokens"] or 0 for t in turns) / max(1e-9, sum(t["model_seconds"] for t in turns if t["output_tokens"])), 1) if turns else None,
                    "input_tokens": sum((u.input_tokens + (u.input_tokens_cache_read or 0) + (u.input_tokens_cache_write or 0)) for u in usage.values()),
                    "output_tokens": sum(u.output_tokens for u in usage.values()),
                    "cost": cost(usage, prices),
                    "has_replay": "world.jsonl.gz" in files,
                    "account": m["accounts"][0]["username"],
                    "start_tick": (m.get("game") or {}).get("start_tick") or (start_tick(files["world.jsonl.gz"], m["accounts"][0]["username"]) if "world.jsonl.gz" in files else None),
                    "screenshot": f"runs/{run_id}.jpg" if (out / "runs" / f"{run_id}.jpg").exists() else None,
                }
                runs.append(run)
                evals.setdefault(eval_id, {"id": eval_id, "title": eval_title(eval_id), "goal": s.input if isinstance(s.input, str) else str(s.input), "budget_ticks": m["budget_ticks"], "tick_ms": run["tick_ms"], "attempts": attempts, "target": m.get("target"), "accounts": [a["username"] for a in m["accounts"]], "task_file": spec.task_file})
                detail = {
                    **run,
                    "goal": evals[eval_id]["goal"],
                    "prompt": next((msg.text for msg in s.messages if msg.role == "user"), None),
                    "timeline": m.get("timeline") or [],
                    "score_metadata": {k: v.metadata for k, v in s.scores.items()},
                    "turns": turns,
                    "answer": last_answer(s),
                    "program_output": (m.get("program") or {}).get("output"),
                    "log": Path(info.name).name,
                }
                (out / "runs" / f"{run_id}.json").write_text(json.dumps(detail))
                if "world.jsonl.gz" in files:
                    (out / "runs" / f"{run_id}.world.jsonl.gz").write_bytes(files["world.jsonl.gz"])
    runs.sort(key=lambda r: (r["eval"], r["model"], r["agent"], r["started"], r["epoch"]))
    ideas = yaml.safe_load(open(IDEAS)) if IDEAS.exists() else []
    (out / "index.json").write_text(json.dumps({"evals": sorted(evals.values(), key=lambda e: e["id"]), "runs": runs, "prices": prices, "ideas": ideas}))
    print(f"{len(runs)} runs, {len(evals)} evals:", dict(Counter((r['eval'], r['model'], r['agent_name']) for r in runs)))


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("log_dirs", nargs="+")
    ap.add_argument("--prices", default="prices.yaml")
    ap.add_argument("--out", default="site/public/data")
    a = ap.parse_args()
    export(a.log_dirs, yaml.safe_load(open(a.prices)) if Path(a.prices).exists() else {}, Path(a.out))
