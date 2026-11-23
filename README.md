# osrs-evals

Evals in RuneScape, on [Inspect AI](https://inspect.aisi.org.uk/) and Max Bittker's
[rs-sdk](https://github.com/MaxBittker/rs-sdk) (a 2004scape server with its gameplay tweaks: faster
XP, infinite run energy, no random events).

Inspect does the eval framework: tasks, scoring, repeats, limits, parallel samples, the agent, the
model, where it runs, logs and the log viewer. This repo adds only the game:

1. **an eval is a world, accounts and a score.** `game()`, a task's setup step, starts a fresh world
   with the eval's settings and its accounts' start saves, logs the accounts in, and tells the agent
   what it has. Scorers read the result from the server's own saves.
2. **the agent is any Inspect agent**, chosen with `--solver`: omp (the one harness every model is
   compared in), a model with a shell, Claude Code, Codex, or `command()`, which runs any program (a
   script, a swarm, another agent's CLI) with the accounts in `$EVAL`. The game does not know or care
   which.
3. **the game is recorded**: the eval's measure over time, read from the server, and the world feed,
   which you can watch live or replay in 3D with Max's [rs-world](https://github.com/MaxBittker/rs-world).
   The game ends at the eval's tick budget, or as soon as its done condition holds, whatever the
   agent is doing.

## The whole simple example

**The eval:** one account in Lumbridge, 2,000 engine ticks (100 s at 20 ticks a second, 8× normal
speed), scored by the coins it holds at the end. **The agent:** a 9-line script that pickpockets men forever.

### The files

`evals/coins.py`, the eval and how it is scored:

```python
from inspect_ai import Task, task
from inspect_ai.dataset import Sample
from inspect_ai.scorer import Score, mean, scorer

from harness import command, game, read_saves


def coins_held(accounts):
    """Coins the accounts hold, in their inventories and banks."""
    return sum(a["inv"].get("995", 0) + a["bank"].get("995", 0) for a in accounts.values())


@task
def coins(ticks: int = 2000):
    return Task(
        dataset=[
            Sample(
                input="Get as many coins as you can.",
                metadata={
                    "accounts": [{"username": "acct1", "save": "lumbridge.sav"}],
                    "world": {"NODE_TICKRATE": "50", "GE_ENABLED": "false"},
                    "budget_ticks": ticks,
                },
            )
        ],
        setup=game(track=coins_held),
        solver=command("bun /programs/pickpocket.ts"),  # the default agent; --solver picks another
        scorer=coins_total(),
        sandbox=("docker", "compose.yaml"),
    )


@scorer(metrics=[mean()])
def coins_total():
    async def score(state, target):
        accounts = await read_saves(state)  # the server's saves, once the game is over
        return Score(value=coins_held(accounts), metadata={name: coins_held({name: a}) for name, a in accounts.items()})

    return score
```

`programs/pickpocket.ts`, the program. It knows nothing about Inspect; it reads its accounts from `$EVAL`:

```ts
import { runScript } from '/opt/sdk/runner';

const { accounts } = await Bun.file(process.env.EVAL!).json();
process.env.BOT_USERNAME = accounts[Number(process.env.ACCOUNT ?? 0)].username;
process.env.PASSWORD = accounts[Number(process.env.ACCOUNT ?? 0)].password;

await runScript(async ({ bot }) => {
    for (;;) await bot.pickpocketNpc(/^man$/i);
});
```

`saves/make.ts`, the start state, made once with rs-sdk's own save generator (`saves/lumbridge.sav` is committed):

```ts
// Builds the start saves with rs-sdk's own save generator (MIT). Run inside the world image:
//   docker run --rm --user $(id -u) -v $PWD/saves:/evals/saves rs-evals-world:71d949d bun /evals/saves/make.ts
import { createSaveData } from '/opt/sdk/test/utils/save-generator';

// A new character in Lumbridge, next to the men by the castle.
await Bun.write(`${import.meta.dir}/lumbridge.sav`, createSaveData({ position: { x: 3231, z: 3218 } }));
```

`evals/compose.yaml`, where it runs (a local Docker; another place is another file, chosen with `--sandbox`):

```yaml
# Where the evals run: one container per sample on the local Docker. The harness copies in what
# it needs, so another place to run (a k8s cluster, EC2) only needs this image; choose it with
# --sandbox.
services:
  default:
    image: rs-evals-world:71d949d
    init: true
    ports:
      - "8888"   # the engine's web port (world feed, /mapview) on a free host port
```

### The one command

```sh
PYTHONPATH=. inspect eval evals/coins.py --model none
```

It takes 2 minutes on a 2-CPU VM. Inspect prints:

```text
╭──────────────────────────────────────────────────────────────────────────────╮
│coins (1 sample): none/none                                                   │
╰──────────────────────────────────────────────────────────────────────────────╯
total time:                                   0:02:00
coins_total
mean         15.000
Log: logs/2026-11-11T11-58-23-00-00_coins_5oLB7WzvzsiNQZLLyefLrr.eval
```

In those 2 minutes Inspect starts a fresh container from `compose.yaml`, and:

1. `game()` copies in `harness/`, `saves/` and `programs/`, puts `lumbridge.sav` in the engine's
   players folder as `acct1`, starts rs-sdk's engine and gateway with the eval's `world` settings
   (about 8 s), and logs `acct1` in with rs-sdk's headless client (about 4 s)
2. the agent, `command(...)`, starts the program with `$EVAL`
3. every 100 ticks the harness reads the account from the server's own save and records the eval's
   measure (`track=coins_held`)
4. at 2,000 engine ticks it stops the program, clicks the account's logout button so the server
   saves it, and the scorer reads that save. The score, 15, is what the program itself last saw.
   The coins went up and down all run (peak 180): the men fight back, the account dies, and its
   coins drop to the ground.

`--model none` means there is no model; see "Swapping the agent" for agents that use one.

### What comes out

**The Inspect log** (`inspect view`): the score and config, then the sample. Its transcript has every
step, where the live world feed is while it runs, the coins every 100 ticks ("score over time") and
"game over" (how it ended, ticks, seconds, the logout). The scoring tab has the score per account.

![Inspect View, transcript](docs/inspect-transcript.jpg)

![Inspect View, scoring](docs/inspect-scoring.jpg)

**The run folder** next to the log, `logs/<log name>/<sample>-<epoch>/`: `world.jsonl.gz` (the
recorded world feed), `sample.json` (settings, how the game ended, timeline), `program.log` for a
`command()` agent, and the engine's and clients' logs.

**The game view** (`viewer/`, below): every run with its score over time, and rs-world following an
account, live or replayed.

![Runs in the viewer](docs/viewer-runs.jpg)

![Replay in rs-world, following acct1](docs/replay.jpg)

## Setup, once per machine

```sh
image/build.sh                                  # the world image: rs-sdk at 71d949d, and omp, ~3 min
docker build -f viewer/Dockerfile -t rs-evals-viewer:71d949d .   # the game view (rs-world), ~5 min
python -m venv .venv && . .venv/bin/activate && pip install inspect_ai
pip install anthropic openai inspect_swe        # model providers, and Inspect's CLI coding agents
```

To regenerate the start saves: `docker run --rm --user $(id -u) -v $PWD/saves:/evals/saves rs-evals-world:71d949d bun /evals/saves/make.ts`.

## Swapping the agent

The agent is the task's `solver`, and `--solver` replaces it without touching the eval. Every
agent starts with the same thing: the eval's goal and a note on the machine it is on (the accounts,
the budget, rs-sdk at `/opt/sdk` and its docs). From there it works however it works. The model
agents below play by writing a TypeScript script against rs-sdk, running it, reading what happened,
and writing the next one, until the goal is met or the budget runs out.

`evals/quest_points.py` is "get as many quest points as you can": one new character, 36,000
ticks, scored by the server's quest points variable at the end. Its default agent is a model with a
shell (Inspect's `react` with the `bash` tool):

```sh
PYTHONPATH=. inspect eval evals/quest_points.py --model anthropic/claude-haiku-5-5
PYTHONPATH=. inspect eval evals/quest_points.py --model anthropic/claude-haiku-5-5 --solver evals/omp.py@omp -S thinking=high
PYTHONPATH=. inspect eval evals/quest_points.py --model anthropic/claude-haiku-5-5 --solver inspect_swe/claude_code
```

**omp** ([oh-my-pi](https://github.com/can1357/oh-my-pi), `evals/omp.py`) is the harness the
evals compare models in, so every model gets the same tools, prompts and loop. It runs omp's
release binary (pinned, 19.0.1, installed in the world image) in print mode as the
`agent` user in `/work`, with the goal and machine note as its prompt and `--thinking <level>`.
omp talks to the model through its own provider for that model (its request format, context window
and thinking levels), pointed at Inspect's agent bridge, which serves every call with `--model` and
logs it with its tokens; the bridge passes omp's thinking settings through. Every omp role (smol,
slow, plan) is the same model, omp's bundled subagents run at the run's thinking level, and omp's
auxiliary services stay on the model. omp's tool-call intents
(`tools.intentTracing`) are on, so each tool call carries a few words on what it is for (its `i`
argument). The thinking level is the solver's `thinking` argument (`off`, `minimal`, `low`,
`medium`, `high`, `xhigh`, `max`, always passed to omp; default `high`; `none` for a model with no
thinking levels), recorded in the log's plan.

Any other agent or program goes through `command()`, which runs it with `$EVAL` (below) and, when
the eval has a model, with `OPENAI_BASE_URL` and `ANTHROPIC_BASE_URL` pointing at Inspect's agent
bridge, so its calls reach `--model` and are logged:

```sh
PYTHONPATH=. inspect eval evals/quest_points.py --model anthropic/claude-haiku-5-5 \
  --solver harness/__init__.py@command -S cmd="my-agent-cli --prompt \"\$(jq -r .goal \$EVAL)\""
```

A CLI that isn't in the world image has to be installed in it (or in a derived image) first.

Which model, and which provider account pays for it, is not in this repo: it is `--model` plus
Inspect's usual provider settings (such as `ANTHROPIC_BASE_URL` and `ANTHROPIC_API_KEY`) in the
environment where you run `inspect`.

## Comparing agents and models

A set of runs is a file of tasks, one per variant, and Inspect's `eval-set`. `evals/matrix.py` has
quest points, Dragon Slayer, Hero's Quest, total level, collection and team wealth, each played by
omp, two epochs each. The models and omp's thinking level are given at run time, so the same file compares models
(`--model a,b`) and thinking levels (one `-T thinking=<level>` per run, into the same log dir):

```sh
PYTHONPATH=. inspect eval-set evals/matrix.py --model anthropic/claude-haiku-5-5 -T thinking=high --log-dir logs/haiku --retry-attempts 0
PYTHONPATH=. inspect eval-set evals/matrix.py --model anthropic/claude-haiku-5-5 -T thinking=low --log-dir logs/haiku --log-dir-allow-dirty --retry-attempts 0
```

Nothing is retried. A failed game stays failed: `--retry-attempts 0` stops eval-set from replaying it
(it replays up to 10 times by default). A failed model call reaches the agent as it failed: omp's
solver sends each call once (Inspect retries without limit by default and its OpenAI and Anthropic
clients twice), turns off omp's own retries, and forwards a 429 or 5xx to omp as a 400, which omp's
HTTP client does not send again. Run the same command on the same log dir to rerun what is missing
or failed, by hand. Every run pins its
thinking level; a model with no thinking levels takes `-T thinking=none` (omp sends it no thinking
setting), recorded as such.

## The evals

| Eval | File | What it measures |
| --- | --- | --- |
| Coins | `evals/coins.py` | Coins held after 2,000 ticks. The simple example. |
| Quest points in 30 minutes | `evals/quest_points.py` | Quest points after 36,000 ticks from a new character, read from the server's quest points variable. The prompt is only the goal; which quests and in what order is up to the agent. |
| Dragon Slayer | `evals/dragon_slayer.py` | Ticks to complete Dragon Slayer from a new character, within four hours of game time (288,000 ticks). It needs 32 quest points to start and a level-83 dragon to finish; how to get there is up to the agent. The shell agent compacts its history (Inspect's `CompactionAuto`). |
| Total level | `evals/total_level.py` | The sum of every skill's level after 36,000 ticks (30 minutes) from a new character, each level from the skill's saved xp on rs-sdk's xp curve. |
| Collection | `evals/collection.py` | Distinct items held in the inventory, bank and worn equipment after 72,000 ticks (1 hour) from a new character. A noted item counts as the item it notes, by the game's own cert link. |
| Hero's Quest | `evals/heros_quest.py` | Ticks to complete Hero's Quest on either of two new characters, within eight hours of game time (576,000 ticks). Achietties starts it only for 55 quest points with Shield of Arrav, Lost City, Merlin's Crystal and Dragon Slayer done, and its master thief armband takes a Phoenix Gang member and a Black Arm Gang member working together (they kill Grip and loot Scarface Pete's candlesticks), so both accounts need those quests; the feather and the eel need 53 Fishing and Cooking, 25 Herblore and 50 Mining. A run that does not finish is scored with each account's quest stage, gang, quest points, the four quests and the four skill levels in the score's metadata. |
| Team wealth | `evals/team_wealth.py` | Four new characters in Lumbridge, 72,000 ticks: the total store value (the item config's `cost`, coins at face value) of everything the four hold in their inventories, banks and worn equipment. |
| Gold | `evals/gold.py` | Four accounts, 100,000 coins between them. |

Ideas for more are in `ideas.yaml`.

Every eval says "as fast as you can": the world runs in real time, so the time a model spends
thinking and writing code is game time too. Each run records both clocks: ticks (game time, the
score) and wall-clock seconds, plus the time spent waiting on the model, the tokens, and cost at
list price, which `site/export.py` reads from [models.dev](https://models.dev) for each model it exports, call by call, so a long prompt is priced at its model's long-context rate.

## The site

`site/` is a website for all of it. The overview is a grid of every model and agent against every
eval, then every run's progress over time; each eval page overlays its runs' progress, cost and the
paths they walked on the world map; each run page puts score, spend, context, model calls and game
actions on one timeline beside the map and the transcript; `/compare` cuts any measure by model,
vendor or agent. Every view is a link. It is built from the logs:

```sh
python site/export.py logs/<dir> [logs/<dir> ...]       # the logs -> site/public/data
site/game/build.sh avatars                                # each run's character, from its recording
bun site/capture.ts && python site/export.py logs/<dir>   # screenshots of each run's last moment
cd site && pnpm install && pnpm build && cd ..
bun viewer/serve.ts                                       # http://localhost:7576
```

The game art in `site/public/assets` (item, skill and quest icons, the world map) is regenerated from
the game cache by `site/game/build.sh`; logos and their sources are in `site/public/assets/brands`.
or in one image: `docker build -f viewer/Dockerfile -t rs-evals-viewer:71d949d .` and
`docker run -p 7576:7576 rs-evals-viewer:71d949d`, with the data built in.

Every push to main builds that image in GitHub Actions (`.github/workflows/viewer.yml`) and pushes
it to `ghcr.io/samcm/osrs-evals-viewer` as `:main` and `:sha-<commit>`; a deployment pulls `:main`.
The data isn't in git, so after an export `site/publish-data.sh` uploads it as the `site-data`
release and starts that build.
`site/AGENTS.md` has the rules for changing it.

## Where runs are stored

Each run is one Inspect log (`.eval`) in the log dir: the task and its arguments, the agent and its
arguments, the model, the repo commit, the scores, the score over time, how the game ended and every
model call. Next to it is a folder per sample with the game recording (`world.jsonl.gz`), the
server's and clients' logs and `sample.json`. Inspect View lists and compares runs across all of these.

The log dir is a deployment setting: a local folder (the default, `logs/`, not committed) or any
fsspec location such as `--log-dir s3://bucket/path`, which Inspect and the run folders both write
to. The viewer in `viewer/` reads a local folder only.

## More with the same pieces

**More accounts.** `evals/gold.py` gives 4 accounts (`-T accounts=N`) 36,000 ticks (30 minutes at 8×)
to hold 100,000 coins between them, and scores the coins at the end and the first tick they
reached the target, read off the score over time. Its default agent runs a one-account script once
per account (`programs/each.sh`).

**Repeats and parallel runs.** Every sample gets its own world on its own free host port, so
Inspect's own flags work: `--epochs 5 --max-samples 3`.

**Watch the game.** The site's server relays a running sample's world feed to rs-world, and
replays a finished one's recording (`?speed=4` on the feed URL plays faster, `?from=<tick>` skips
ahead).

**Where it runs.** The harness copies `harness/`, `saves/` and `programs/` into the sandbox, so
another place to run needs only the world image: for example `--sandbox k8s:values.yaml` with
Inspect's k8s sandbox package. Nothing in the evals or the harness names a host.

## What an agent gets

- **The prompt:** the eval's goal, then a note with the accounts, the budget, and how to reach them
  with rs-sdk.
- **The sandbox:** rs-sdk's server, gateway and SDK (`/opt/sdk`, with `README.md` and `API.md`),
  bun, and `/work` to write in. Agents run as an unprivileged `agent` user, so they can play but
  can't edit the server's saves the score is read from. `/work` is kept with the run. Each account is already in the game through rs-sdk's headless
  client, so a script connects to it with the SDK, as rs-sdk's own scripts do.
- **`$EVAL`** (for `command()` programs): a JSON file with `goal`, `accounts` (username and
  password), `gateway`, `budget_ticks`, `tick_ms`, `attempts` and `out` (`/work/out`, kept with the
  run). With several attempts, `/run/attempt.json` says which one is running and how the others went.
- **The end:** at the budget or when the eval is done, the harness stops any `command()` program
  (SIGTERM to its process group, SIGKILL 10 s later), logs every account out, and Inspect scores the
  sample. An agent that finishes earlier ends the game itself.

## How it works

| File | What it does |
| --- | --- |
| `harness/__init__.py` | `game()`, the setup step: copies the files in, starts the world, logs the accounts in, tells the agent, and starts a watchdog that samples the eval's measure every 100 ticks and ends the game at the budget or when done. `read_saves()` for scorers (ends the game first if it is still on). `command()`, the agent that runs a program. |
| `harness/objs.ts` | Every item's name, store value and the item a note stands for, from the server's own obj config in the world image (`harness.OBJS`, for evals that value or count items). |
| `evals/omp.py` | omp as the agent, at a pinned version, through Inspect's agent bridge. |
| `harness/saves.ts` | Reads an account from the server's save file: position, skills, varps (quest progress), inventory, worn items and bank. |
| `harness/sample.ts` | The engine's tick and every account's latest save. The world image lets the harness set the engine's autosave interval, so this is the score over time. |
| `harness/record.ts` | Records the engine's world feed around the accounts (it follows them), plus the all-player roster. |
| `harness/logout.ts`, `client.sh`, `start-world.sh`, `run.sh`, `stop.sh` | The steps above. Logout clicks the game's logout button, so the server saves at once. |
| `image/` | The world image: rs-sdk's own server image at a pinned commit, plus its pathfinding data and a settable autosave interval. |
| `site/` | The website (React, TanStack, ECharts), `export.py` (logs to its data), `capture.ts` (run screenshots) and `game/` (game art from the cache). |
| `viewer/` | `serve.ts`, which serves the site, its data, rs-world built against the same map cache, the live feed relay and the replays; and the Dockerfile for all of it. |

Licences: rs-sdk is MIT and rs-world is BSD-2-Clause; both are built from their repositories at
pinned commits, not copied in. Nothing comes from RuneBench, which has no licence file.

## Status

Verified by running, with Inspect 0.3.289 and rs-sdk 71d949d: the examples above in a 2-CPU, 4 GB
VM, and the runs below on an 8-CPU, 16 GB one. The total level, collection and team wealth scorers
were checked against saves made with rs-sdk's save generator with known answers (79 levels from
set xp, 4 distinct items including noted ones, 1,588 coins of value across four accounts).

Quest points in 30 minutes, first look at Claude Sonnet 5.5 (two runs per agent, same machine):

| Agent | Quest points per run | Ended by | Cost per run | Model calls | Output tok/s | Time waiting on model |
| --- | --- | --- | --- | --- | --- | --- |
| model + bash | 4, 3 | agent, agent | $1.98, $1.02 | 111, 72 | 107 | 19–24% |
| Claude Code | 3, 2 | agent, budget | $1.62, $1.33 | 120, 102 | 91–101 | 27–33% |

The agents chose Sheep Shearer, Cook's Assistant, Rune Mysteries and The Restless Ghost; both bash
runs started Romeo & Juliet without finishing it. The quests each agent said it finished match
the server's quest points.

Also checked: score over time on every run; recordings replayed in rs-world, live view, screenshots
from recordings; four accounts in one world (Gold); parallel samples on free ports; runs written to
S3 (against a local S3 server); a sample errors when its model is never reached; agents run as an
unprivileged user and can't write the server's saves.

Not verified:

- **Codex needs an OpenAI-family model and a pinned version.** With Claude models the Anthropic
  API rejects Codex's free-form tools (no input schema). Codex 0.167 sends its tools in a
  "namespace" with a grammar-based shell, which reached the model through an OpenAI-compatible
  proxy as no usable tool, so it stopped after one message; 0.130.0 sends plain function tools and
  plays. Which versions work depends on the provider behind `--model`.
- **OpenCode and `command()` with an agent CLI** use the same path but have not been run here.
- **Sandboxes left behind.** While Codex samples failed in setup and eval-set retried them, their
  game containers were not removed and piled up until memory ran low. Whether Inspect or the
  harness's game watchdog keeps them alive is not yet known.
- **Viewer on remote logs.** Runs write to S3 (checked against a local S3 server), but the
  viewer reads only a local log folder.
- **Other places to run.** Only the local Docker sandbox has run. The harness uses only Inspect's
  sandbox calls (exec, file copy and, for the live view, published ports), so k8s or EC2 should need
  only the world image in a registry and a sandbox config, but that is untested.
- **Speed under load.** The budget is in engine ticks, so a slow engine plays the same game, only
  slower. A 4-account run on 2 CPUs ran at about 60% of its 20 ticks per second. A game ends anyway
  after twice its budget in wall-clock time.
- **Recording area.** The engine's feed caps one recorded area at 384×384 tiles. Accounts spread
  further apart are recorded as dots from the roster, not in full.
