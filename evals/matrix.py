"""Cook's Assistant and 500 shrimps, each played by each agent, 5 runs per variant; Cook's
Assistant also with five tries in one run. The model is not fixed here: give it (or several) at
run time, with the log dir:

    PYTHONPATH=. inspect eval-set evals/matrix.py --model anthropic/claude-haiku-5-5 --log-dir <dir>

eval-set runs every task x model x epoch into <dir>, and run again on the same dir it does only what
is missing or failed.
"""

from inspect_ai import task, task_with
from inspect_ai.agent import react
from inspect_ai.tool import bash
from inspect_swe import claude_code, codex_cli

from cooks_assistant import cooks_assistant
from shrimps import shrimps

EPOCHS = 5


def agents():
    # Codex 0.167 sends its tools in a "namespace" with a grammar-based shell, which reached the model
    # through an OpenAI-compatible proxy as no usable tool; 0.130.0 sends plain function tools.
    # Every agent runs as the sandbox's unprivileged "agent" user (see harness.AGENT_USER).
    return {"bash": react(tools=[bash(timeout=600, user="agent")]), "claude_code": claude_code(user="agent"), "codex": codex_cli(version="0.130.0", user="agent")}


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
    return task_with(cooks_assistant(ticks=6000, attempts=5), solver=agents()["bash"], epochs=EPOCHS)


@task
def shrimps_bash():
    return task_with(shrimps(), solver=agents()["bash"], epochs=EPOCHS)


@task
def shrimps_claude_code():
    return task_with(shrimps(), solver=agents()["claude_code"], epochs=EPOCHS)


@task
def shrimps_codex():
    return task_with(shrimps(), solver=agents()["codex"], epochs=EPOCHS)
