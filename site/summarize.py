"""Tell each exported run in one sentence and chapters, then each eval in what set its runs apart,
with omp agents that read the runs' full logs, for the site.

    python site/summarize.py runs <logs dir> [...] [--data site/public/data] [--only <run id> ...]
    python site/summarize.py evals [--data site/public/data] [--only <eval id> ...]

Run it after site/export.py and before site/publish-data.sh, with inspect_ai installed (it reads the
logs) and omp (--omp, default the one on PATH) at the version evals/omp.py pins.

`runs`: for each run, measures its facts (site/runlog.py: subagents, background jobs, accounts,
deaths, when the score first and last moved, quitting early, ...) into runs/<id>.facts.json (and
those of its eval's other runs, when missing: the agent sees each fact beside the eval's), lays
the run out in a folder (its transcripts and its subagents', the files it wrote, its run folder,
its exported data, its facts), and starts omp in print mode (--model, Claude Haiku 5.5 by default)
in that folder with a shell. The agent reads, greps and computes, checks its claims against the
data and writes summary.json, which this script checks (`check`: chapters inside the run, in order,
without gaps) and writes to runs/<id>.summary.json:

    {"summary": "...", "chapters": [{"from_tick", "to_tick", "title", "text"}], "run_summary",
     "model", "thinking", "prompt_hash", "telling": {"calls", "seconds", "input_tokens", "output_tokens"}}

`evals`: for each eval, an omp agent (--model, Claude Sonnet 5.5 by default) reads every run's
summary, chapters and facts and writes what separated the runs (a short note) and, per run, a few
traits that set it apart and its sentence again, saying what was distinctive about it. The note and
traits go to evals/<id>.compare.json; each run's summary.json gets its `traits` and the new
`summary` (the run's own sentence is kept as `run_summary`).

A run or eval already told with the same prompt and model (and, for an eval, the same runs' texts
and facts) is skipped; --force tells it again. Writes each run's summary into index.json too, so the
site shows them without another export.

Models are reached through omp's auth gateway (Sam's subscriptions; GATEWAY_URL, default
http://127.0.0.1:4000) by way of a proxy in this script that sends every request once: omp's own
retries are off, and the proxy turns a reply its HTTP client would send again (408, 409, 429, 5xx,
no connection) into a 400, so a failed call fails that run, which this script reports.
"""

import argparse
import concurrent.futures
import hashlib
import http.client
import http.server
import json
import os
import re
import shutil
import subprocess
import sys
import threading
import time
import urllib.parse
from pathlib import Path

SITE = Path(__file__).resolve().parent

VOICE = """\
Write like a RuneScape player telling a mate how the run went: plain, with game slang where it fits \
(blitzed, ground out, speedran, farmed, got turned away), naming the quests, places, skills, items \
and methods that mattered.

The voice, from other runs of Dragon Slayer:
- "Farmed the quest scripts out to helper agents, blitzed the prerequisites, then speedran Dragon \
Slayer from map to Elvarg in four minutes."
- "Ground out the quest points one script at a time, then took three trips to Crandor before Elvarg \
went down."
- "Read the wiki, walked to the Champions' Guild, got turned away for having no quest points, and \
logged off."
"""

RUN_PROMPT = """\
You're writing the captions for a site where people watch language-model agents play the 2004 \
MMORPG RuneScape (2004scape). This folder holds the whole record of one run, and your job is to \
tell it. The agent played through a TypeScript SDK for up to {budget} of game time. Its goal: \
"{goal}". It's scored by {measure}.

What's here (read with the shell: grep, sed -n, python3; the files are big, so search, don't read \
them whole):
- facts.txt: measured from the data, not told by anyone, each with what it means and the same fact \
across this eval's runs (median, how many above 0), so you can see what's usual and what isn't: \
subagents, background jobs, accounts used, deaths, game minutes when the score first and last \
moved, minutes the score sat flat at the end, whether the agent quit early. Trust these over your \
impressions.
- record.txt: the run as one line per event in tick order: its tick, its game time, then SAID (the \
agent's words), DID (a tool call with the intent it gave) or GAME (the score changing, quests, \
quest stages, levels, items gained and lost, deaths, teleports). Start here for the shape of the run.
- transcript.txt: the agent's own conversation in full, call by call with its tick and game time: \
what it thought, said and ran, the scripts it wrote and every result it got back.
- subagents/<n>.txt: the same for each subagent it handed tasks to (only when it did).
- files/: the last version of every file the agents wrote with the write tool (their scripts).
- run.json: the site's data for the run; run_folder/: the raw run folder (states.jsonl.gz, the \
accounts' saved state over time; world.log, the game server and SDK gateway's log).

Work it out before you write: what the plan was, where the score came from and when, what went \
wrong and what it cost, and how the agent worked. Check every claim against the files (grep for \
it); never say anything the data doesn't show. A long stretch where the score didn't move is part \
of the story: say what the agent was doing then. The run ended with {result}; that's shown next to \
your text, so don't state the final score or whether it reached the target.

{voice}
Rules:
- Say what made this run this run, not what every run does. Every run starts the same way: a fresh \
character in Lumbridge and the same docs, SDK and server files to read, so don't spend words on \
reading them, and never title or open a chapter with it. Mention research only when it took much \
longer than usual (facts.txt: first_game_action_minutes) or what it found changed the run.
- Say plainly how the agent worked: when facts.txt shows subagents it handed tasks to, several \
accounts at once, or scripts left running in the background while it did something else that \
shaped the run, say so in the summary or a chapter; when it didn't, don't suggest it did.
- Be specific: the quest, the place, the monster, the method, the mistake. "Ground out skills" is \
too vague; "chopped willows at Draynor" says something.
- Don't mention what the agent didn't do (no helpers, no deaths) unless that is the story.
- Use your own words, not the agent's names for its scripts or modes. Call something a grind, a \
detour or a mistake when the data shows it.

Write summary.json in this folder:
{{"summary": "...", "chapters": [{{"from_tick": 0, "to_tick": 1200, "title": "...", "text": "..."}}]}}
1. "summary": one sentence in that voice, at most 25 words, with no colon and no list of more than \
three things.
2. "chapters": 2 to 4 chapters, split where the run changed course or its progress sped up or \
stalled, not at every new task. Each has "from_tick" and "to_tick" (whole ticks from record.txt; \
together they cover tick 0 to {end_tick} in order, with no gaps or overlaps), a "title" of 2 to 6 \
words in the same voice ("Blitzing the prerequisites", "Three trips to Crandor"), and a "text" of \
one sentence in the same voice with at most two numbers (levels, coins, quest stages, or game time \
as m:ss or h:mm:ss; never tick counts), telling events in the order they happened.

Then check your own words: find every number, time, place, quest and event in summary.json in \
record.txt, facts.txt or the transcript, and fix or drop what you can't find. Then run `{check}` \
and fix what it reports until it prints "ok". Answer with one line when done.
"""

EVAL_PROMPT = """\
You're writing for a site where people watch language-model agents play the 2004 MMORPG RuneScape \
(2004scape). Every run in this folder played the same eval, "{title}": the goal "{goal}", up to \
{budget} of game time, scored by {measure}. Each run is one model at one thinking level in the omp \
agent harness; most pairings ran twice.

What's here (use the shell: grep, python3, jq):
- runs.tsv: one row per run: its id, model, thinking level, result, cost, then every measured fact. \
The facts are measured from the data, not told; facts.txt says what each column means.
- runs/<id>.json: one run: its model, thinking level, result, cost, facts, and the sentence and \
chapters another agent wrote after reading the run's full logs.
- runs.md: every run's sentence and chapters in one file, best result first.

Find what set the runs apart: the key split indicators. Things one run or a handful did that the \
rest didn't (only one used subagents; three never touched the game for the first half hour), \
choices that went with the best and the worst results, and the ways runs failed. Count and \
compare with the shell; every claim about how many runs did something must come from runs.tsv or \
the files, never a guess. A fact that every run shares isn't a split.

Write compare.json in this folder:
{{"note": "...", "runs": {{"<run id>": {{"traits": ["...", "..."], "summary": "..."}}}}}}
- "note": what separated the runs, for the eval's page: 2 to 4 plain sentences, at most 90 words, \
naming the splits and the models on each side (by their names in runs.tsv), with counts.
- For every run in runs.tsv: "traits", 1 to 3 short phrases (2 to 6 words each) on what set this \
run apart from the others in this eval ("only run to use subagents", "never left Lumbridge", \
"three deaths to Elvarg"), and "summary", the run's sentence told again so it says what was \
distinctive about this run among these: keep what's right in its own sentence, at most 25 words, \
no colon, and don't repeat its result (shown beside it).

{voice}
Then run `{check}` and fix what it reports until it prints "ok". Answer with one line when done.
"""

RUN_HASH = hashlib.sha256((RUN_PROMPT + VOICE).encode()).hexdigest()[:12]
EVAL_HASH = hashlib.sha256((EVAL_PROMPT + VOICE).encode()).hexdigest()[:12]
MAX_LINE = 280  # characters of one record line
# Reading what every run is given; worth words only when a run took much longer over it than most
READING = re.compile(r"\b(read|reading|studied|studying|skimm?(ed|ing)?)\b[^.;]{0,40}\b(docs?|sdk|api|readme|server|source|scripts? files|files)\b", re.I)
TOOLS = "bash,read,grep,glob,write,edit"


def cut(text: str, n: int = MAX_LINE) -> str:
    text = re.sub(r"\s+", " ", text or "").strip()
    return text if len(text) <= n else text[: n - 1] + "…"


def clock(seconds: float) -> str:
    """Game time as m:ss, or h:mm:ss from an hour."""
    s = int(seconds)
    return f"{s // 3600}:{s // 60 % 60:02d}:{s % 60:02d}" if s >= 3600 else f"{s // 60}:{s % 60:02d}"


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


def render(record: list[tuple[int, str, str]], tick_ms: float) -> str:
    return "\n".join(f"{tick} {clock(tick * tick_ms / 1000)} {kind} {text}" for tick, kind, text in record)


def parse(raw: dict, end_tick: int) -> dict:
    """A run's told JSON, checked: chapters inside the run, in order, without gaps or overlaps (a
    gap goes to the chapter before it, an overlap to the one after); raises on what can't be fixed."""
    chapters = []
    for c in sorted(raw.get("chapters") or [], key=lambda c: int(c.get("from_tick", 0))):
        a, b = max(0, int(c["from_tick"])), min(end_tick, int(c["to_tick"]))
        title, body = cut(str(c.get("title", "")), 60), cut(str(c.get("text", "")), 400)
        if b <= a or not title or not body:
            continue
        chapters.append({"from_tick": a, "to_tick": b, "title": title, "text": body})
    if not chapters:
        raise ValueError("no chapter inside the run")
    chapters[0]["from_tick"] = 0
    for prev, nxt in zip(chapters, chapters[1:]):
        nxt["from_tick"] = prev["to_tick"] = max(prev["from_tick"] + 1, nxt["from_tick"])
    chapters = [c for c in chapters if c["from_tick"] < end_tick]
    chapters[-1]["to_tick"] = end_tick
    summary = one_sentence(raw.get("summary"))
    return {"summary": summary, "chapters": chapters}


def one_sentence(text) -> str:
    """The reply's sentence as it comes, cut to its first sentence when it has more than one."""
    s = cut(re.split(r"(?<=[.!?])\s+(?=\S)", str(text or "").strip())[0], 240)
    if not s:
        raise ValueError("no summary")
    return s


def problems_run(raw: dict, end_tick: int, subagents: int = 0, slow_start: bool = False) -> list[str]:
    """What the agent should fix in its summary.json before this script takes it."""
    out = []
    s = str(raw.get("summary") or "").strip()
    if not s:
        out.append('"summary" is missing')
    elif len(s.split()) > 25:
        out.append(f'"summary" has {len(s.split())} words; at most 25')
    elif ":" in s:
        out.append('"summary" has a colon')
    if s and not slow_start and READING.search(s):
        out.append('"summary" spends words on reading the docs, SDK or server files, which every run does and this one didn\'t take long over; drop it')
    chapters = raw.get("chapters")
    if not isinstance(chapters, list) or not 2 <= len(chapters) <= 4:
        out.append('"chapters" must be a list of 2 to 4 chapters')
        return out
    prev = 0
    for n, c in enumerate(chapters, 1):
        try:
            a, b = int(c["from_tick"]), int(c["to_tick"])
        except (KeyError, TypeError, ValueError):
            out.append(f"chapter {n} needs whole from_tick and to_tick")
            continue
        if a != prev:
            out.append(f"chapter {n} starts at tick {a}; it must start at {prev}, where the one before it ends")
        if b <= a:
            out.append(f"chapter {n} ends at or before it starts")
        prev = b
        if not 2 <= len(str(c.get("title", "")).split()) <= 6:
            out.append(f"chapter {n}'s title must be 2 to 6 words")
        text = str(c.get("text", "")).strip()
        if not text:
            out.append(f"chapter {n} has no text")
        if len(text.split()) > 35:
            out.append(f"chapter {n}'s text has {len(text.split())} words; keep it to one sentence of at most 35")
        if len(re.findall(r"\d[\d,.:]*", text)) > 2:
            out.append(f"chapter {n}'s text has more than two numbers")
        if re.search(r"\btick", text, re.I):
            out.append(f"chapter {n}'s text mentions ticks; use game time (m:ss)")
        if not slow_start and n == 1 and any(re.match(r"\s*(read|research|stud(y|ied|ying)|scour)", t, re.I) for t in (str(c.get("title", "")), text)):
            out.append("chapter 1 opens with reading or research; open with what set the run's course")
        if not slow_start and READING.search(str(c.get("title", "")) + " " + text):
            out.append(f"chapter {n} spends words on reading the docs, SDK or server files, which every run does and this one didn't take long over; drop it")
    if prev != end_tick:
        out.append(f"the last chapter ends at tick {prev}; it must end at {end_tick}")
    told = " ".join([s] + [str(c.get("text", "")) + " " + str(c.get("title", "")) for c in chapters if isinstance(c, dict)])
    if subagents and not re.search(r"helper|subagent|sub-agent|scout|agents|farmed out|handed", told, re.I):
        out.append(f"facts.txt shows {subagents} subagents; say plainly that it handed work to them")
    return out


def problems_eval(raw: dict, ids: list[str]) -> list[str]:
    out = []
    note = str(raw.get("note") or "").strip()
    if not note:
        out.append('"note" is missing')
    elif len(note.split()) > 100:
        out.append(f'"note" has {len(note.split())} words; at most 90')
    runs = raw.get("runs") if isinstance(raw.get("runs"), dict) else {}
    missing = [i for i in ids if i not in runs]
    if missing:
        out.append(f"no entry for {len(missing)} runs: {', '.join(missing[:10])}")
    extra = [i for i in runs if i not in ids]
    if extra:
        out.append(f"entries for runs not in runs.tsv: {', '.join(extra[:10])}")
    for i in ids:
        r = runs.get(i)
        if not isinstance(r, dict):
            continue
        traits = r.get("traits")
        if not isinstance(traits, list) or not 1 <= len(traits) <= 3 or not all(isinstance(t, str) and 1 <= len(t.split()) <= 8 for t in traits):
            out.append(f"{i}: traits must be 1 to 3 short phrases")
        s = str(r.get("summary") or "").strip()
        if not 8 <= len(s.split()) <= 25 or ":" in s:
            out.append(f"{i}: summary must be one sentence of 8 to 25 words with no colon")
    return out


def check(args) -> None:
    """Prints what's wrong with a summary.json or compare.json, or "ok"."""
    raw_text = Path(args.file).read_text() if Path(args.file).exists() else ""
    try:
        raw = json.loads(raw_text)
    except json.JSONDecodeError as err:
        print(f"{args.file} is not JSON: {err}")
        sys.exit(1)
    found = problems_run(raw, args.end_tick, args.subagents, args.slow_start) if args.end_tick is not None else problems_eval(raw, args.ids.split(","))
    print("\n".join(found) if found else "ok")
    sys.exit(1 if found else 0)


# The gateway, through a proxy that sends every request once.

class Proxy(http.server.ThreadingHTTPServer):
    daemon_threads = True

    def __init__(self, upstream: str):
        super().__init__(("127.0.0.1", 0), ProxyHandler)
        u = urllib.parse.urlsplit(upstream)
        self.upstream = (u.hostname, u.port or 80)
        self.calls: dict[str, list[int]] = {}  # tag -> each request's status
        self.lock = threading.Lock()
        threading.Thread(target=self.serve_forever, daemon=True).start()

    def url(self, tag: str) -> str:
        return f"http://127.0.0.1:{self.server_address[1]}/{tag}"


class ProxyHandler(http.server.BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"

    def log_message(self, *a):
        pass

    def do_GET(self):
        self.forward()

    def do_POST(self):
        self.forward()

    def forward(self):
        _, tag, rest = (self.path + "/").split("/", 2)
        body = self.rfile.read(int(self.headers.get("content-length") or 0))
        headers = {k: v for k, v in self.headers.items() if k.lower() not in ("host", "content-length", "connection", "accept-encoding")}
        status = None
        try:
            conn = http.client.HTTPConnection(*self.server.upstream, timeout=900)
            conn.request(self.command, "/" + rest.rstrip("/") if rest != "/" else "/", body=body or None, headers=headers)
            r = conn.getresponse()
            status = r.status
        except Exception as err:
            self.fail(f"no reply from the gateway: {err}")
        else:
            if status in (408, 409, 429) or status >= 500:
                self.fail(f"{status}: {r.read()[:500].decode(errors='replace')}")
            else:
                self.send_response(status)
                for k, v in r.getheaders():
                    if k.lower() not in ("transfer-encoding", "content-length", "connection"):
                        self.send_header(k, v)
                self.send_header("transfer-encoding", "chunked")
                self.end_headers()
                while chunk := r.read1(65536):
                    self.wfile.write(f"{len(chunk):x}\r\n".encode() + chunk + b"\r\n")
                    self.wfile.flush()
                self.wfile.write(b"0\r\n\r\n")
            conn.close()
        if self.command == "POST":
            with self.server.lock:
                self.server.calls.setdefault(tag, []).append(status or 0)

    def fail(self, message: str):
        """A 400, which no client sends again, with the real status in its message."""
        data = json.dumps({"type": "error", "error": {"type": "invalid_request_error", "message": message}}).encode()
        self.send_response(400)
        self.send_header("content-type", "application/json")
        self.send_header("content-length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)


def omp(folder: Path, prompt: str, tag: str, args, proxy: Proxy) -> dict:
    """omp in print mode in `folder` with a shell, the model through the proxy; what it cost."""
    home = folder / ".omp-home"
    (home / ".omp/agent").mkdir(parents=True, exist_ok=True)
    provider, model = args.model.split("/", 1) if "/" in args.model else ("anthropic", args.model)
    (home / ".omp/agent/models.yml").write_text(json.dumps({"providers": {provider: {"baseUrl": proxy.url(tag), "apiKey": "gateway", "auth": "apiKey"}}}))
    # No retries (a failed call fails the run), no update check
    (home / ".omp/agent/config.yml").write_text(json.dumps({"retry": {"enabled": False}, "startup": {"checkUpdate": False}}))
    sessions = folder / ".omp-session"
    shutil.rmtree(sessions, ignore_errors=True)
    name = f"{provider}/{model}"
    cmd = [
        args.omp, "-p", "--auto-approve", "--thinking", args.thinking,
        "--model", name, "--smol", name, "--slow", name, "--plan", name,
        "--offline", "--no-title", "--no-skills", "--no-rules", "--no-context-files", "--no-extensions", "--no-lsp",
        "--tools", TOOLS, "--session-dir", str(sessions), "--max-time", args.max_time, prompt,
    ]
    t0 = time.monotonic()
    p = subprocess.run(cmd, cwd=folder, env={**os.environ, "HOME": str(home)}, capture_output=True, text=True)
    seconds = round(time.monotonic() - t0, 1)
    (folder / "omp.log").write_text(p.stdout + p.stderr)
    usage = {"input": 0, "cacheRead": 0, "cacheWrite": 0, "output": 0}
    calls = 0
    for f in sessions.rglob("*.jsonl"):
        for line in f.read_text().splitlines():
            m = json.loads(line).get("message") or {}
            if m.get("role") == "assistant" and m.get("usage"):
                calls += 1
                for k in usage:
                    usage[k] += m["usage"].get(k) or 0
    statuses = proxy.calls.get(tag, [])
    return {
        "calls": len(statuses) or calls,
        "failed_calls": sum(1 for s in statuses if s != 200),
        "seconds": seconds,
        "input_tokens": usage["input"] + usage["cacheRead"] + usage["cacheWrite"],
        "output_tokens": usage["output"],
        "exit": p.returncode,
    }


def stamp_of(args, prompt_hash: str) -> dict:
    return {"model": args.model, "thinking": args.thinking, "prompt_hash": prompt_hash}


def tell_run(run_id: str, args, data: Path, index: dict, proxy: Proxy) -> tuple[str, str, dict | None]:
    import runlog

    path = data / "runs" / f"{run_id}.json"
    out = data / "runs" / f"{run_id}.summary.json"
    stamp = stamp_of(args, RUN_HASH)
    if out.exists() and not args.force:
        old = json.loads(out.read_text())
        if all(old.get(k) == v for k, v in stamp.items()):
            return run_id, "cached", None
    run = json.loads(path.read_text())
    e = next((e for e in index["evals"] if e["id"] == run["eval"]), {})
    try:
        _, sample, convs, folder = runlog.load(run, args.logs)
    except Exception as err:
        return run_id, f"failed: no log ({err})", None
    facts = json.loads((data / "runs" / f"{run_id}.facts.json").read_text())
    peers = [json.loads(f.read_text()) for r in index["runs"] if r["eval"] == run["eval"] and (f := data / "runs" / f"{r['id']}.facts.json").exists()]
    starts = sorted(p["first_game_action_minutes"] for p in peers if p.get("first_game_action_minutes") is not None)
    slow_start = facts.get("first_game_action_minutes") is None or bool(starts) and facts["first_game_action_minutes"] >= max(5, 2 * starts[len(starts) // 2])
    work = Path(args.work).resolve() / "runs" / run_id
    shutil.rmtree(work, ignore_errors=True)
    runlog.write_workspace(work, run, sample, convs, folder, facts, peers)
    end_tick = int(run.get("game_ticks") or max([p["tick"] for p in run.get("timeline", [])] + [1]))
    tick_ms = run.get("tick_ms") or e.get("tick_ms") or 600
    run["measure"] = e.get("measure")
    (work / "record.txt").write_text(render(record_of(run, index.get("items") or {}), tick_ms))
    target = run.get("target")
    result = f"{run.get('final_value')} {e.get('measure', '').lower()}" + (f" ({'reached' if run.get('success') else 'did not reach'} the target {target})" if target is not None else "")
    prompt = RUN_PROMPT.format(
        budget=clock((run.get("budget_ticks") or e.get("budget_ticks") or end_tick) * tick_ms / 1000),
        goal=run.get("goal") or e.get("goal", ""),
        measure=e.get("measure", "its result"),
        result=result,
        end_tick=end_tick,
        voice=VOICE,
        check=f"python3 {SITE / 'summarize.py'} check summary.json --end-tick {end_tick} --subagents {facts['subagents']}" + (" --slow-start" if slow_start else ""),
    )
    if args.print_prompt:
        print(prompt)
        return run_id, "printed", None
    # One omp session per run, never repeated: a failed call or a summary that doesn't pass fails the run
    cost = omp(work, prompt, run_id, args, proxy)
    try:
        if not (work / "summary.json").exists():
            raise ValueError("the agent wrote no summary.json")
        raw = json.loads((work / "summary.json").read_text())
        if found := problems_run(raw, end_tick, facts["subagents"], slow_start):
            raise ValueError("; ".join(found))
        told = parse(raw, end_tick)
    except Exception as err:
        return run_id, f"failed: {err} (omp exit {cost['exit']}, {cost['failed_calls']} failed calls; {work / 'omp.log'})", cost
    out.write_text(json.dumps({**told, "run_summary": told["summary"], **stamp, "telling": cost}, separators=(",", ":")))
    return run_id, "told", cost


def tell_eval(eval_id: str, args, data: Path, index: dict, proxy: Proxy) -> tuple[str, str, dict | None]:
    import runlog

    e = next(e for e in index["evals"] if e["id"] == eval_id)
    runs = [r for r in index["runs"] if r["eval"] == eval_id]
    rows, missing = [], []
    for r in runs:
        s = data / "runs" / f"{r['id']}.summary.json"
        f = data / "runs" / f"{r['id']}.facts.json"
        if not s.exists() or not f.exists():
            missing.append(r["id"])
            continue
        told, facts = json.loads(s.read_text()), json.loads(f.read_text())
        rows.append({
            "id": r["id"], "model": (index.get("models", {}).get(r["model"]) or {}).get("name") or r["model"].split("/")[-1], "thinking": r["thinking"], "result": r["final_value"],
            **({"reached_target": r["success"]} if r.get("target") is not None else {}), "cost_usd": r["cost"],
            "facts": facts, "summary": told.get("run_summary") or told["summary"], "chapters": told["chapters"],
        })
    if missing:
        return eval_id, f"failed: {len(missing)} runs have no summary or facts yet ({', '.join(missing[:5])}...): run `runs` first", None
    out = data / "evals" / f"{eval_id}.compare.json"
    inputs = hashlib.sha256(json.dumps(rows, sort_keys=True).encode()).hexdigest()[:12]
    stamp = {**stamp_of(args, EVAL_HASH), "inputs_hash": inputs}
    if out.exists() and not args.force:
        old = json.loads(out.read_text())
        if all(old.get(k) == v for k, v in stamp.items()):
            return eval_id, "cached", None
    work = Path(args.work).resolve() / "evals" / eval_id
    shutil.rmtree(work, ignore_errors=True)
    (work / "runs").mkdir(parents=True)
    tick_ms = e.get("tick_ms") or 600
    better = (lambda r: (not r.get("reached_target"), r["facts"]["game_minutes"])) if e.get("target") is not None else (lambda r: -(r["result"] or 0))
    rows.sort(key=better)
    for r in rows:
        (work / "runs" / f"{r['id']}.json").write_text(json.dumps(r, indent=1))
    head = ["id", "model", "thinking", "result", *(["reached_target"] if e.get("target") is not None else []), "cost_usd", *rows[0]["facts"]]
    table = [head] + [[{**r, **r["facts"]}.get(k) for k in head] for r in rows]
    (work / "runs.tsv").write_text("\n".join("\t".join(map(str, row)) for row in table) + "\n")
    (work / "facts.txt").write_text("\n".join(f"{k}: {v}" for k, v in runlog.FACT_NOTES.items()) + "\n")
    md = []
    for r in rows:
        md.append(f"## {r['id']}: {r['model']} ({r['thinking']}), result {r['result']}\n{r['summary']}")
        md += [f"- {c['title']} ({clock(c['from_tick'] * tick_ms / 1000)} to {clock(c['to_tick'] * tick_ms / 1000)}): {c['text']}" for c in r["chapters"]]
        md.append("")
    (work / "runs.md").write_text("\n".join(md))
    ids = [r["id"] for r in rows]
    (work / "ids.txt").write_text(",".join(ids))
    prompt = EVAL_PROMPT.format(
        title=e.get("title", eval_id), goal=e.get("goal", ""), budget=clock(e["budget_ticks"] * tick_ms / 1000), measure=e.get("measure", "its result"),
        voice=VOICE, check=f"python3 {SITE / 'summarize.py'} check compare.json --ids $(cat ids.txt)",
    )
    if args.print_prompt:
        print(prompt)
        return eval_id, "printed", None
    cost = omp(work, prompt, eval_id, args, proxy)
    try:
        if not (work / "compare.json").exists():
            raise ValueError("the agent wrote no compare.json")
        raw = json.loads((work / "compare.json").read_text())
        if found := problems_eval(raw, ids):
            raise ValueError("; ".join(found))
    except Exception as err:
        return eval_id, f"failed: {err} (omp exit {cost['exit']}, {cost['failed_calls']} failed calls; {work / 'omp.log'})", cost
    told = {"note": cut(str(raw["note"]), 900), "runs": {i: {"traits": [cut(t, 60) for t in raw["runs"][i]["traits"]], "summary": one_sentence(raw["runs"][i]["summary"])} for i in ids}}
    out.write_text(json.dumps({**told, **stamp, "telling": cost}, separators=(",", ":")))
    for i in ids:
        s = data / "runs" / f"{i}.summary.json"
        run_told = json.loads(s.read_text())
        s.write_text(json.dumps({**run_told, "summary": told["runs"][i]["summary"], "traits": told["runs"][i]["traits"]}, separators=(",", ":")))
    return eval_id, "told", cost


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    sub = ap.add_subparsers(dest="cmd", required=True)
    for name, model in (("runs", "claude-haiku-5-5"), ("evals", "claude-sonnet-5-5")):
        p = sub.add_parser(name)
        if name == "runs":
            p.add_argument("logs", nargs="+", help="the logs dirs the runs were exported from")
        p.add_argument("--data", default="site/public/data")
        p.add_argument("--work", default="site/.summarize", help="where each run's or eval's folder is laid out for its agent")
        p.add_argument("--model", default=model)
        p.add_argument("--thinking", default="medium", help="off, minimal, low, medium, high, xhigh or max")
        p.add_argument("--omp", default=shutil.which("omp") or "omp")
        p.add_argument("--gateway", default=os.environ.get("GATEWAY_URL", "http://127.0.0.1:4000"))
        p.add_argument("--jobs", type=int, default=4)
        p.add_argument("--max-time", default="30m", help="omp's --max-time for one agent")
        p.add_argument("--only", nargs="*", help="run ids (runs) or eval ids (evals)")
        p.add_argument("--force", action="store_true", help="tell again even when current")
        p.add_argument("--print-prompt", action="store_true", help="lay out each folder and print its prompt instead of asking")
    c = sub.add_parser("check", help="what's wrong with an agent's summary.json or compare.json")
    c.add_argument("file")
    c.add_argument("--end-tick", type=int)
    c.add_argument("--subagents", type=int, default=0)
    c.add_argument("--slow-start", action="store_true", help="the run took much longer than most to first act in the game")
    c.add_argument("--ids", default="")
    args = ap.parse_args()
    if args.cmd == "check":
        return check(args)

    data = Path(args.data)
    index = json.loads((data / "index.json").read_text())
    proxy = Proxy(args.gateway)
    if args.cmd == "runs":
        todo = [r["id"] for r in index["runs"] if not args.only or r["id"] in args.only]
        tell = tell_run
        # Facts first (no model): these runs', and any missing among their evals' runs, which each
        # run's agent sees its facts beside
        import runlog

        evals = {r["eval"] for r in index["runs"] if r["id"] in todo}
        need = [r["id"] for r in index["runs"] if r["id"] in todo or (r["eval"] in evals and not (data / "runs" / f"{r['id']}.facts.json").exists())]
        with concurrent.futures.ProcessPoolExecutor(max(args.jobs, 4)) as pool:
            for run_id, err in zip(need, pool.map(runlog.write_facts, need, [data] * len(need), [args.logs] * len(need))):
                if err:
                    print(f"{run_id}: no facts ({err})", file=sys.stderr)
    else:
        todo = [e["id"] for e in index["evals"] if not args.only or e["id"] in args.only]
        tell = tell_eval
    done: dict[str, int] = {}
    total = {"calls": 0, "seconds": 0.0, "input_tokens": 0, "output_tokens": 0}
    t0 = time.monotonic()
    with concurrent.futures.ThreadPoolExecutor(max_workers=args.jobs) as pool:
        for what, status, cost in pool.map(lambda i: tell(i, args, data, index, proxy), todo):
            if status != "printed":
                print(f"{what}: {status}" + (f" ({cost['calls']} calls, {cost['seconds']:.0f}s)" if cost else ""), file=sys.stderr, flush=True)
            done[status.split(":")[0]] = done.get(status.split(":")[0], 0) + 1
            for k in total:
                total[k] += (cost or {}).get(k, 0)
    # The summaries into the index too, so the site shows them without another export
    for r in index["runs"]:
        f = data / "runs" / f"{r['id']}.summary.json"
        r["summary"] = json.loads(f.read_text())["summary"] if f.exists() else None
    (data / "index.json").write_text(json.dumps(index))
    print(f"{args.cmd}: {done.get('told', 0)} told, {done.get('cached', 0)} cached, {done.get('failed', 0)} failed; "
          f"{total['calls']} model calls, {total['input_tokens']:,} tokens in, {total['output_tokens']:,} out, "
          f"{total['seconds'] / 60:.0f} agent-minutes, {(time.monotonic() - t0) / 60:.0f} minutes", file=sys.stderr)
    sys.exit(1 if done.get("failed") else 0)


if __name__ == "__main__":
    main()
