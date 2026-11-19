from inspect_ai import Task, task
from inspect_ai.agent import react
from inspect_ai.dataset import Sample
from inspect_ai.model import CompactionAuto
from inspect_ai.tool import bash

from harness import game
from scorers import ticks_to_target

DRAGONQUEST = "176"  # the server's varp for Dragon Slayer: 0 not started ... 10 complete
COMPLETE = 10


def quest_stage(accounts):
    return max(a["varps"].get(DRAGONQUEST, 0) for a in accounts.values())


@task
def dragon_slayer(ticks: int = 288000, tick_ms: int = 50):
    """Complete Dragon Slayer as fast as possible, from a new character outside Lumbridge Castle.
    The quest needs 32 quest points to start and a level-83 dragon killed to finish; how to get
    there is the agent's business. The budget is four hours of game time."""
    return Task(
        dataset=[
            Sample(
                input="Complete the quest Dragon Slayer as fast as you can.",
                metadata={
                    "accounts": [{"username": "slayer1", "save": "lumbridge.sav"}],
                    "world": {"NODE_TICKRATE": str(tick_ms), "GE_ENABLED": "false"},
                    "budget_ticks": ticks,
                    "target": COMPLETE,
                },
            )
        ],
        setup=game(track=quest_stage, done=lambda accounts: quest_stage(accounts) >= COMPLETE),
        # The default agent: a model with a shell. Hours of play outgrow any context window, so it
        # compacts its history as Inspect does; --solver picks another agent.
        solver=react(tools=[bash(timeout=600, user="agent")], compaction=CompactionAuto()),
        scorer=ticks_to_target(),
        sandbox=("docker", "compose.yaml"),
    )
