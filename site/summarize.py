"""Tell each exported run in chapters and one sentence, with a model, for the site.

    python site/summarize.py [--data site/public/data] [--model claude-sonnet-5-5] [--thinking medium]
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
the model to describe and not judge; the script checks the chapters' ticks and orders them, and
drops anything outside the run.
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
You are reading the record of one run of an evaluation: a language-model agent played the 2004 \
MMORPG RuneScape (2004scape) through a TypeScript SDK, for a fixed budget of game ticks (one tick is \
{tick_ms} ms of game time). The eval's goal, as the agent got it: "{goal}". It is scored by: \
{measure}. This run ended with {result}.

Below is everything the run did, in order, on its game clock (tick numbers): the agent's own words \
(SAID), its tool calls with the intent it gave for each (DID), and what happened in the game \
(GAME: the eval's measure changing, quests, levels, items gained or lost, deaths, teleports).

Tell the run as a reader of the site needs it:
1. Split it into 3 to 8 chapters: stretches where the agent pursued one aim or worked one way \
(set up and read the docs, a route, a money method, a fix after something broke, waiting). Each \
chapter covers whole ticks from the record, and together they cover the run from tick 0 to tick \
{end_tick}, in order, without gaps or overlaps.
2. Give each chapter a title of 2 to 6 words and one or two plain sentences of what the agent did \
and what came of it in the game.
3. Then sum the run up in ONE sentence of at most 25 words: its strategy and route (where it went, \
what it did there, how it got its result), so a reader can tell it from the other runs at a glance. \
One sentence means a single full stop, at the end; count the words, and leave out detail before \
going over 25.

Rules: describe, don't judge (no "cleverly", "wasted", "failed to"); never state anything the \
record doesn't show; name places, items, quests and skills as the record names them; no \
markdown. Answer with JSON only, in this shape:
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


def render(record: list[tuple[int, str, str]]) -> str:
    """The record as text, at most MAX_RECORD characters: game lines always, the agent's lines thinned evenly."""
    lines = [f"{tick} {kind} {text}" for tick, kind, text in record]
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
    prompt = PROMPT.format(
        tick_ms=run.get("tick_ms") or e.get("tick_ms") or 600,
        goal=run.get("goal") or e.get("goal", ""),
        measure=e.get("measure", "its result"),
        result=result,
        end_tick=end_tick,
        record=render(record_of(run, items)),
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
    ap.add_argument("--model", default="claude-sonnet-5-5")
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
