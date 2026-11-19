"""Cook's Assistant (one try, and five tries in one run), 500 shrimps, quest points and Dragon Slayer, each played by each agent. The model is not fixed here: give it (or several) at
run time, with the log dir:

    PYTHONPATH=. inspect eval-set evals/matrix.py --model anthropic/claude-haiku-5-5 --log-dir <dir>

eval-set runs every task x model x epoch into <dir>, and run again on the same dir it does only what
is missing or failed.
"""

from inspect_ai import task, task_with
from inspect_ai.agent import react
from inspect_ai.tool import bash
from inspect_swe import claude_code, codex_cli

from harness import command

from cooks_assistant import cooks_assistant
from dragon_slayer import dragon_slayer
from quest_points import quest_points
from shrimps import shrimps

EPOCHS = 5  # one-try Cook's Assistant
LONG_EPOCHS = 3  # five tries, and shrimps: up to 25 minutes each


def agents():
    # Codex 0.167 sends its tools in a "namespace" with a grammar-based shell, which reached the model
    # through an OpenAI-compatible proxy as no usable tool; 0.130.0 sends plain function tools.
    # Every agent runs as the sandbox's unprivileged "agent" user (see harness.AGENT_USER), in /work,
    # the one folder it can write (the CLIs keep their own config there).
    return {"bash": react(tools=[bash(timeout=600, user="agent")]), "claude_code": claude_code(user="agent", cwd="/work"), "codex": codex_cli(version="0.130.0", user="agent", cwd="/work")}


@task
def cooks_bash():
    return task_with(cooks_assistant(), solver=agents()["bash"], epochs=EPOCHS)


@task
def cooks_claude_code():
    return task_with(cooks_assistant(), solver=agents()["claude_code"], epochs=EPOCHS)


@task
def cooks_codex():
    return task_with(cooks_assistant(), solver=agents()["codex"], epochs=EPOCHS)


@task
def cooks_5_tries_bash():
    return task_with(cooks_assistant(ticks=6000, attempts=5), solver=agents()["bash"], epochs=LONG_EPOCHS)


@task
def shrimps_bash():
    return task_with(shrimps(), solver=agents()["bash"], epochs=LONG_EPOCHS)


@task
def shrimps_claude_code():
    return task_with(shrimps(), solver=agents()["claude_code"], epochs=LONG_EPOCHS)


@task
def shrimps_codex():
    return task_with(shrimps(), solver=agents()["codex"], epochs=LONG_EPOCHS)


@task
def shrimps_script():
    """The scripted baseline: no model."""
    return task_with(shrimps(), solver=command("bun /programs/cook_shrimps.ts"), epochs=LONG_EPOCHS)


@task
def qp_bash():
    return task_with(quest_points(), solver=agents()["bash"], epochs=2)


@task
def qp_claude_code():
    return task_with(quest_points(), solver=agents()["claude_code"], epochs=2)


@task
def qp_codex():
    return task_with(quest_points(), solver=agents()["codex"], epochs=2)


# Dragon Slayer from a new character: hours of play, so the shell agent compacts its history
@task
def ds_bash():
    return task_with(dragon_slayer(), epochs=2)


@task
def ds_claude_code():
    return task_with(dragon_slayer(), solver=agents()["claude_code"], epochs=2)


@task
def ds_codex():
    return task_with(dragon_slayer(), solver=agents()["codex"], epochs=2)

