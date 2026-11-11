from inspect_ai import Task, task
from inspect_ai.dataset import Sample

from gold import ticks_to_target
from inspect_ai.agent import react
from inspect_ai.tool import bash

from harness import game

COOKQUEST = "29"  # the server's varp for Cook's Assistant: 0 not started, 1 started, 2 complete


def quest_stage(accounts):
    return max(a["varps"].get(COOKQUEST, 0) for a in accounts.values())


@task
def cooks_assistant(ticks: int = 12000, tick_ms: int = 50):
    """Complete Cook's Assistant as fast as possible, from a new character outside Lumbridge Castle."""
    return Task(
        dataset=[
            Sample(
                input="Complete the quest Cook's Assistant as fast as you can.",
                metadata={
                    "accounts": [{"username": "cook1", "save": "lumbridge.sav"}],
                    "world": {"NODE_TICKRATE": str(tick_ms), "GE_ENABLED": "false"},
                    "budget_ticks": ticks,
                    "target": 2,
                },
            )
        ],
        setup=game(track=quest_stage, done=lambda accounts: quest_stage(accounts) >= 2),
        solver=react(tools=[bash(timeout=600)]),  # the default agent: a model with a shell; --solver picks another
        scorer=ticks_to_target(),
        sandbox=("docker", "compose.yaml"),
    )
