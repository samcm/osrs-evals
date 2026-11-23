"""Tell each exported run in chapters and one sentence, with a model, for the site.

    python site/summarize.py [--data site/public/data] [--model claude-haiku-5-5] [--thinking medium]
        [--api anthropic|openai] [--base-url http://127.0.0.1:4000] [--jobs 4] [--only <run id> ...]

Run it after site/export.py and before site/publish-data.sh. It reads each run's exported file
(runs/<id>.json: the model's words, its tool calls' intents and commands, the game's events, what
the accounts held) and writes runs/<id>.summary.json:

    {"summary": "...", "chapters": [{"from_tick", "to_tick", "title", "text"}], "model", "prompt_hash"}

A run whose summary was made with the same prompt and model is skipped, so a publish only pays for
new runs; change the prompt (or --model, --thinking) and every run is told again. Export again
afterwards, or let this script do it: it also writes each summary into index.json's run, which the
export reads from these files next time.

The model is reached through omp's auth gateway (Sam's subscriptions), which serves an Anthropic
Messages endpoint and an OpenAI chat completions endpoint:
    --api anthropic  POST {base}/v1/messages           (thinking: adaptive, output_config.effort)
    --api openai     POST {base}/v1/chat/completions   (reasoning_effort)
Environment: GATEWAY_URL (default http://127.0.0.1:4000, as on the run orbs) and GATEWAY_KEY (sent as
x-api-key and as a bearer token; the gateway on the run orbs needs none).

What it may say: only what the data shows, every chapter on ticks from the data. The prompt asks
for a RuneScape player's voice that says what made the run, skipping what every run does; the script
checks the chapters' ticks and orders them, and drops anything outside the run.
"""

import argparse
import concurrent.futures
import hashlib
import json
import os
import re
import sys
import urllib.request
from pathlib import Path

PROMPT = """\
You're writing the captions for a site where people watch language-model agents play the 2004 \
MMORPG RuneScape (2004scape). Below is the whole record of one run: the agent played through a \
TypeScript SDK for up to {budget} of game time. Its goal: "{goal}". It's scored by {measure}, and \
this run ended with {result}.

Every run starts the same way: a fresh character in Lumbridge and the same docs and SDK to read. \
Mention reading or research only when how long it took matters to how the run went. The run's \
final result is shown next to your text, so don't repeat it.

Write like a RuneScape player telling a mate how the run went: plain, with game slang where it fits \
(blitzed, ground out, speedran, farmed, got turned away), naming the quests, places, skills, items \
and methods that mattered. Say what made this run this run: the plan, where the result came from, \
what went wrong. Name how the agent worked when it shaped the run, in plain terms: subagents it \
handed tasks to, scripts left running in the background, several accounts at once. Use your own \
words, not the agent's names for its scripts or modes. Call something a grind, a detour or a mistake when the record shows it; never \
claim anything the record doesn't show.

The voice, from other runs of Dragon Slayer:
- "Farmed the quest scripts out to helper agents, blitzed the prerequisites, then speedran Dragon \
Slayer from map to Elvarg in four minutes."
- "Ground out the quest points one script at a time, then took three trips to Crandor before Elvarg \
went down."
- "Read the wiki, walked to the Champions' Guild, got turned away for having no quest points, and \
logged off."

Give:
1. "summary": one sentence in that voice, at most 25 words, with no colon and no list of more \
than three things.
2. "chapters": 2 to 4 chapters, split where the run changed course or its progress sped up or \
stalled, not at every new task. Each has "from_tick" and "to_tick" (whole ticks from the record; \
together they cover tick 0 to {end_tick} in order, with no gaps or overlaps), a "title" of 2 to 6 \
words in the same voice ("Blitzing the prerequisites", "Three trips to Crandor"), and a "text" of \
one sentence in the same voice with at most two numbers (levels, coins, quest stages, or game time \
as the record gives it, m:ss or h:mm:ss; never tick counts), telling events in the order they \
happened.

The record: each line is a tick, its game time, then SAID (the agent's words), DID (a tool call with \
the intent the agent gave) or GAME (what happened in the game: the score changing, quests, levels, \
items, deaths, teleports). Answer with JSON only, in this shape:
{{"chapters": [{{"from_tick": 0, "to_tick": 1200, "title": "...", "text": "..."}}], "summary": "..."}}

THE RECORD
{record}
"""

PROMPT_HASH = hashlib.sha256(PROMPT.encode()).hexdigest()[:12]
MAX_LINE = 280  # characters of one record line
MAX_RECORD = 240_000  # characters of the whole record, about 60K tokens: long runs keep every game line and thin the rest


def items_table(data: Path) -> dict:
    index = json.loads((data / "index.json").read_text())
    return index.get("items") or {}


def cut(text: str, n: int = MAX_LINE) -> str:
    text = re.sub(r"\s+", " ", text or "").strip()
    return text if len(text) <= n else text[: n - 1] + "…"


def record_of(run: dict, items: dict) -> list[tuple[int, str, str]]:
    """The run as (tick, kind, line), in tick order: what it said, did and what happened."""
    out: list[tuple[int, str, str]] = []
    for t in run.get("turns", []):
        tick = t.get("tick") or 0
        if t.get("text"):
            out.append((tick, "SAID", cut(t["text"])))
        for a in t.get("actions", []):
            what = a.get("intent") or a.get("input") or a.get("tool")
            line = cut(what, 160)
            if a.get("sdk_calls"):
                line += f" [game: {', '.join(a['sdk_calls'][:8])}]"
            if a.get("error"):
                line += " (error)"
            out.append((tick, "DID", line))
        if t.get("error"):
            out.append((tick, "DID", "model call failed: " + cut(t["error"], 120)))
    last = None
    for p in run.get("timeline", []):
        if p.get("value") != last:
            out.append((p["tick"], "GAME", f"{run.get('measure') or 'value'} {p['value']}"))
            last = p.get("value")
    for e in run.get("events", []):
        k = e.get("kind")
        if k == "quest":
            out.append((e["tick"], "GAME", f"finished the quest {e.get('name') or 'a quest'}"))
        elif k == "stage":
            out.append((e["tick"], "GAME", f"quest stage: {e.get('name')}"))
        elif k == "level":
            out.append((e["tick"], "GAME", f"{e['skill']} level {e['level']}"))
        elif k == "death":
            out.append((e["tick"], "GAME", "died"))
        elif k == "teleport":
            out.append((e["tick"], "GAME", f"teleported to tile {e.get('x')},{e.get('z')}"))
        elif k == "attempt":
            out.append((e["tick"], "GAME", f"attempt {e.get('attempt')} began"))
    name = lambda i: (items.get(str(i)) or {}).get("name") or f"item {i}"
    for account, changes in (run.get("held") or {}).items():
        have: dict[str, dict[str, int]] = {"inv": {}, "bank": {}, "worn": {}}
        for c in changes:
            gained, lost = [], []
            for k in ("inv", "bank", "worn"):
                for i, n in (c.get(k) or {}).items():
                    before = have[k].get(i, 0)
                    if n > before:
                        gained.append(f"{name(i)}{f' x{n - before}' if n - before > 1 else ''}" + ("" if k == "inv" else f" ({k})"))
                    elif n < before:
                        lost.append(f"{name(i)}{f' x{before - n}' if before - n > 1 else ''}" + ("" if k == "inv" else f" ({k})"))
                    if n:
                        have[k][i] = n
                    else:
                        have[k].pop(i, None)
            who = f"{account}: " if len(run.get("held") or {}) > 1 else ""
            if gained:
                out.append((c["tick"], "GAME", f"{who}gained {', '.join(gained[:12])}"))
            if lost:
                out.append((c["tick"], "GAME", f"{who}lost {', '.join(lost[:12])}"))
    out.sort(key=lambda r: (r[0], r[1] != "GAME"))
    return out


def clock(seconds: float) -> str:
    """Game time as m:ss, or h:mm:ss from an hour."""
    s = int(seconds)
    return f"{s // 3600}:{s // 60 % 60:02d}:{s % 60:02d}" if s >= 3600 else f"{s // 60}:{s % 60:02d}"


def render(record: list[tuple[int, str, str]], tick_ms: float) -> str:
    """The record as text, each line with its tick and game time, at most MAX_RECORD characters:
    game lines always, the agent's lines thinned evenly."""
    lines = [f"{tick} {clock(tick * tick_ms / 1000)} {kind} {text}" for tick, kind, text in record]
    if sum(len(l) + 1 for l in lines) <= MAX_RECORD:
        return "\n".join(lines)
    game = sum(len(l) + 1 for l, (_, k, _) in zip(lines, record) if k == "GAME")
    agent = [i for i, (_, k, _) in enumerate(record) if k != "GAME"]
    room = max(0, MAX_RECORD - game)
    keep_every = max(1, -(-sum(len(lines[i]) + 1 for i in agent) // max(1, room)))
    keep = {i for n, i in enumerate(agent) if n % keep_every == 0}
    return "\n".join(l for i, l in enumerate(lines) if record[i][1] == "GAME" or i in keep)


def ask(prompt: str, args) -> str:
    """One request to the gateway; the model's text."""
    base = args.base_url.rstrip("/")
    key = os.environ.get("GATEWAY_KEY", "")
    headers = {"content-type": "application/json", **({"x-api-key": key, "authorization": f"Bearer {key}"} if key else {})}
    if args.api == "anthropic":
        body = {"model": args.model, "max_tokens": 16000, "messages": [{"role": "user", "content": prompt}]}
        if args.thinking not in ("off", "none"):
            body |= {"thinking": {"type": "adaptive"}, "output_config": {"effort": args.thinking}}
        url, headers = f"{base}/v1/messages", headers | {"anthropic-version": "2023-06-01"}
    else:
        body = {"model": args.model, "messages": [{"role": "user", "content": prompt}]}
        if args.thinking not in ("off", "none"):
            body["reasoning_effort"] = args.thinking
        url = f"{base}/v1/chat/completions"
    req = urllib.request.Request(url, data=json.dumps(body).encode(), headers=headers, method="POST")
    with urllib.request.urlopen(req, timeout=args.timeout) as r:
        reply = json.loads(r.read())
    if args.api == "anthropic":
        return "".join(b.get("text", "") for b in reply.get("content", []) if b.get("type") == "text")
    return reply["choices"][0]["message"]["content"]


def parse(text: str, end_tick: int) -> dict:
    """The model's JSON, checked: chapters inside the run, in order, without gaps or overlaps."""
    m = re.search(r"\{.*\}", text, re.S)
    if not m:
        raise ValueError("no JSON in the reply")
    raw = json.loads(m.group(0))
    chapters = []
    for c in sorted(raw.get("chapters") or [], key=lambda c: int(c.get("from_tick", 0))):
        a, b = max(0, int(c["from_tick"])), min(end_tick, int(c["to_tick"]))
        title, body = cut(str(c.get("title", "")), 60), cut(str(c.get("text", "")), 400)
        if b <= a or not title:
            continue
        chapters.append({"from_tick": a, "to_tick": b, "title": title, "text": body})
    if not chapters:
        raise ValueError("no chapter inside the run")
    # Contiguous from 0 to the end: each chapter ends where the next begins (a gap goes to the
    # chapter before it, an overlap to the one after)
    chapters[0]["from_tick"] = 0
    for prev, nxt in zip(chapters, chapters[1:]):
        nxt["from_tick"] = prev["to_tick"] = max(prev["from_tick"] + 1, nxt["from_tick"])
    chapters = [c for c in chapters if c["from_tick"] < end_tick]
    chapters[-1]["to_tick"] = end_tick
    # The reply's summary as it comes (the prompt asks for 25 words; replies run a few over), cut to
    # its first sentence when it has more than one
    summary = cut(re.split(r"(?<=[.!?])\s+(?=\S)", str(raw.get("summary", "")).strip())[0], 240)
    if not summary:
        raise ValueError("no summary")
    return {"summary": summary, "chapters": chapters}


def summarize(path: Path, evals: dict, items: dict, args) -> tuple[str, str]:
    run = json.loads(path.read_text())
    out = path.with_name(f"{run['id']}.summary.json")
    stamp = {"model": args.model, "thinking": args.thinking, "prompt_hash": PROMPT_HASH}
    if out.exists() and not args.force and not args.print_prompt:
        old = json.loads(out.read_text())
        if all(old.get(k) == v for k, v in stamp.items()):
            return run["id"], "cached"
    e = evals.get(run["eval"], {})
    end_tick = int(run.get("game_ticks") or max([p["tick"] for p in run.get("timeline", [])] + [1]))
    target = run.get("target")
    result = f"{run.get('final_value')} {e.get('measure', '').lower()}" + (f" ({'reached' if run.get('success') else 'did not reach'} the target {target})" if target is not None else "")
    run["measure"] = e.get("measure")
    tick_ms = run.get("tick_ms") or e.get("tick_ms") or 600
    budget = clock((run.get("budget_ticks") or e.get("budget_ticks") or end_tick) * tick_ms / 1000)
    prompt = PROMPT.format(
        budget=budget,
        goal=run.get("goal") or e.get("goal", ""),
        measure=e.get("measure", "its result"),
        result=result,
        end_tick=end_tick,
        record=render(record_of(run, items), tick_ms),
    )
    if args.print_prompt:
        print(prompt)
        return run["id"], "printed"
    # One request per run, never repeated: a failed or malformed reply fails the run.
    try:
        told = parse(ask(prompt, args), end_tick)
    except Exception as err:
        return run["id"], f"failed: {err}"
    out.write_text(json.dumps({**told, **stamp}, separators=(",", ":")))
    return run["id"], "told"


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    ap.add_argument("--data", default="site/public/data")
    ap.add_argument("--model", default="claude-haiku-5-5")
    ap.add_argument("--thinking", default="medium", help="off, low, medium, high, xhigh or max")
    ap.add_argument("--api", choices=["anthropic", "openai"], default="anthropic")
    ap.add_argument("--base-url", default=os.environ.get("GATEWAY_URL", "http://127.0.0.1:4000"))
    ap.add_argument("--jobs", type=int, default=4)
    ap.add_argument("--timeout", type=float, default=600)
    ap.add_argument("--only", nargs="*", help="run ids")
    ap.add_argument("--force", action="store_true", help="tell runs again even when their summary is current")
    ap.add_argument("--print-prompt", action="store_true", help="print each run's prompt instead of asking")
    args = ap.parse_args()

    data = Path(args.data)
    index = json.loads((data / "index.json").read_text())
    evals = {e["id"]: e for e in index["evals"]}
    items = items_table(data)
    paths = [data / "runs" / f"{r['id']}.json" for r in index["runs"] if not args.only or r["id"] in args.only]
    done = {"told": 0, "cached": 0, "failed": 0}
    with concurrent.futures.ThreadPoolExecutor(max_workers=args.jobs) as pool:
        for run_id, status in pool.map(lambda p: summarize(p, evals, items, args), paths):
            if status != "printed":
                print(f"{run_id}: {status}", file=sys.stderr)
            done[status.split(":")[0]] = done.get(status.split(":")[0], 0) + 1
    # The summaries into the index too, so the site shows them without another export
    for r in index["runs"]:
        f = data / "runs" / f"{r['id']}.summary.json"
        r["summary"] = json.loads(f.read_text())["summary"] if f.exists() else None
    (data / "index.json").write_text(json.dumps(index))
    print(f"summaries: {done['told']} told, {done['cached']} cached, {done['failed']} failed", file=sys.stderr)
    sys.exit(1 if done["failed"] else 0)


if __name__ == "__main__":
    main()
