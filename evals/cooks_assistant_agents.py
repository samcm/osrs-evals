"""Cook's Assistant, played by each agent, 3 attempts each. The model is not fixed here: give it (or
several) at run time, with the log dir:

    PYTHONPATH=. inspect eval-set evals/cooks_assistant_agents.py --model anthropic/claude-haiku-5-5 --log-dir <dir>

eval-set runs every agent x model x attempt into <dir>, and run again on the same dir it does only
what is missing or failed.
"""

from inspect_ai import task, task_with
from inspect_ai.agent import react
from inspect_ai.tool import bash
from inspect_swe import claude_code, codex_cli

from cooks_assistant import cooks_assistant

EPOCHS = 3


@task
def cooks_bash():
    return task_with(cooks_assistant(), solver=react(tools=[bash(timeout=600)]), epochs=EPOCHS)


@task
def cooks_claude_code():
    return task_with(cooks_assistant(), solver=claude_code(), epochs=EPOCHS)


@task
def cooks_codex():
    return task_with(cooks_assistant(), solver=codex_cli(), epochs=EPOCHS)
