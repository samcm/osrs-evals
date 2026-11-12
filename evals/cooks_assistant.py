from inspect_ai import Task, task
from inspect_ai.agent import react
from inspect_ai.dataset import Sample
from inspect_ai.tool import bash

from harness import game
from scorers import ticks_to_target

COOKQUEST = "29"  # the server's varp for Cook's Assistant: 0 not started, 1 started, 2 complete


def quest_stage(accounts):
    return max(a["varps"].get(COOKQUEST, 0) for a in accounts.values())


@task
def cooks_assistant(ticks: int = 12000, tick_ms: int = 50, attempts: int = 1):
    """Complete Cook's Assistant as fast as possible, from a new character outside Lumbridge Castle.
    With attempts > 1 the account is reset after each attempt and the agent goes again, keeping
    what it learned; scored by its fastest attempt."""
    return Task(
        dataset=[
            Sample(
                input="Complete the quest Cook's Assistant as fast as you can.",
                metadata={
                    "accounts": [{"username": "cook1", "save": "lumbridge.sav"}],
                    "world": {"NODE_TICKRATE": str(tick_ms), "GE_ENABLED": "false"},
                    "budget_ticks": ticks,
                    "attempts": attempts,
                    "target": 2,
                },
            )
        ],
        setup=game(track=quest_stage, done=lambda accounts: quest_stage(accounts) >= 2),
        solver=react(tools=[bash(timeout=600, user="agent")]),  # the default agent: a model with a shell; --solver picks another
        scorer=ticks_to_target(),
        sandbox=("docker", "compose.yaml"),
    )
