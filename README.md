# osrs-evals

Evals in RuneScape, on [Inspect AI](https://inspect.aisi.org.uk/) and Max Bittker's
[rs-sdk](https://github.com/MaxBittker/rs-sdk) (a 2004scape server with its gameplay tweaks: faster
XP, infinite run energy, no random events).

Inspect does the eval framework: tasks, scoring, repeats, limits, parallel samples, sandboxes (where
it runs), logs and the log viewer. This repo adds only the RuneScape parts. The harness does three
things and knows nothing about how a program organises itself:

1. **sets up an eval**: a fresh world with the eval's settings, its accounts' start saves, a tick budget
2. **runs whatever program it is pointed at** with those accounts and the goal, and stops it at the budget
3. **records what happens in the game**: the eval's score over time, read from the server, and the
   world feed, which you can watch live or replay in 3D with Max's [rs-world](https://github.com/MaxBittker/rs-world)

## The whole simple example

**The eval:** one account in Lumbridge, 2,000 ticks (100 s at 8× speed), scored by the coins it
holds at the end. **The program:** pickpocket men forever.

### The files

`evals/coins.py`, the eval and how it is scored:

```python
from inspect_ai import Task, task
from inspect_ai.dataset import Sample
from inspect_ai.scorer import Score, mean, scorer

from harness import read_saves, run_program


def coins_held(accounts):
    """Coins the accounts hold, in their inventories and banks."""
    return sum(a["inv"].get("995", 0) + a["bank"].get("995", 0) for a in accounts.values())


@task
def coins(program: str = "bun /programs/pickpocket.ts", ticks: int = 2000):
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
        solver=run_program(program, track=coins_held),
        scorer=coins_total(),
        sandbox=("docker", "compose.yaml"),
    )


@scorer(metrics=[mean()])
def coins_total():
    async def score(state, target):
        accounts = await read_saves(state)  # the server's saves, written at logout
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
import { createSaveData } from '/opt/sdk/test/utils/save-generator';

// A new character in Lumbridge, next to the men by the castle.
await Bun.write(`${import.meta.dir}/lumbridge.sav`, createSaveData({ position: { x: 3231, z: 3218 } }));
```

`evals/compose.yaml`, where it runs (a local Docker; another place is another file, chosen with `--sandbox`):

```yaml
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

RUN_OUTPUT

### What comes out

WHAT_COMES_OUT

## Setup, once per machine

```sh
image/build.sh                                  # the world image: rs-sdk at 71d949d, ~3 min
docker build -f viewer/Dockerfile -t rs-evals-viewer:71d949d .   # the game view (rs-world), ~5 min
python -m venv .venv && . .venv/bin/activate && pip install inspect_ai
pip install anthropic openai                    # only to run programs that call a model
```

To regenerate the start saves: `docker run --rm --user $(id -u) -v $PWD/saves:/evals/saves rs-evals-world:71d949d bun /evals/saves/make.ts`.

## Doing more with the same pieces

**Point the same eval at another program.** `programs/llm.ts` has a model play through rs-sdk (it
writes TypeScript against `bot` and `sdk` each turn). Give the eval a model and the harness opens
Inspect's agent bridge, so the program's OpenAI- or Anthropic-style calls reach that model and
Inspect logs each call and its tokens. Nothing in the eval or the harness changes:

```sh
PYTHONPATH=. inspect eval evals/coins.py -T program="bun /programs/llm.ts" --model anthropic/claude-haiku-5-5
```

A program can also call any model itself with its own keys; the harness does not care.

**More accounts.** `evals/gold.py` gives 4 accounts (`-T accounts=N`) 36,000 ticks (30 minutes at 8×)
to hold 100,000 coins between them, and scores the coins at the end and the first tick they
reached the target, read off the score over time. `programs/each.sh` runs a one-account program
once per account:

```sh
PYTHONPATH=. inspect eval evals/gold.py --model none
```

**Repeats and parallel runs.** Every sample gets its own world on its own free host port, so
Inspect's own flags work: `--epochs 5 --max-samples 3`.

**Watch the game.** Run the viewer next to the logs and open http://localhost:7576:

```sh
docker run --rm --network host -v $PWD/logs:/runs:ro rs-evals-viewer:71d949d
```

It lists every sample under `logs/` with its score over time; "watch" opens rs-world following an
account: the live world while the sample runs, its recording afterwards (`?speed=4` on the feed URL
plays faster, `?from=<tick>` skips ahead).

**Where it runs.** The harness copies `harness/`, `saves/` and `programs/` into the sandbox, so
another place to run needs only the world image: for example `--sandbox k8s:values.yaml` with
Inspect's k8s sandbox package. Nothing in the evals or the harness names a host.

## The contract with a program

- **Input:** `$EVAL` is a JSON file with `goal`, `accounts` (username and password), `gateway`
  (rs-sdk's gateway URL), `budget_ticks`, `tick_ms` and `out` (a folder kept with the run). Each
  account is already in the game through rs-sdk's headless client, so the program connects to it
  with the SDK, as rs-sdk's own scripts do.
- **A model, if the eval has one:** `OPENAI_BASE_URL` and `ANTHROPIC_BASE_URL` point at it (any
  model name works).
- **Stop:** SIGTERM to the program's whole process group when the tick budget runs out, SIGKILL
  10 s later. The program's output goes to the run's `program.log`.

## How it works

| File | What it does |
| --- | --- |
| `harness/__init__.py` | `run_program`, the one solver: copies the files in, starts the world, logs the accounts in, starts the program, samples the score every 100 ticks until the budget, stops the program, logs everyone out with the game's logout button (the server saves at once), copies the run out next to the Inspect log. `read_saves` for scorers. |
| `harness/saves.ts` | Reads an account from the server's save file: position, skills, varps (quest progress), inventory, worn items and bank. |
| `harness/sample.ts` | The engine's tick and every account's latest save. The world image lets the harness set the engine's autosave interval, so this is the score over time. |
| `harness/record.ts` | Records the engine's world feed around the accounts (it follows them), plus the all-player roster. |
| `harness/logout.ts`, `client.sh`, `start-world.sh`, `run.sh`, `stop.sh` | The steps above. |
| `image/` | The world image: rs-sdk's own server image at a pinned commit, plus its pathfinding data and a settable autosave interval. |
| `viewer/` | rs-world built against the same map cache, and `serve.ts`: the run list, the live feed proxy and the replay. |

Licences: rs-sdk is MIT and rs-world is BSD-2-Clause; both are built from their repositories at
pinned commits, not copied in. Nothing comes from RuneBench, which has no licence file.

## Status

STATUS
