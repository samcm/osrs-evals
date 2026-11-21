from inspect_ai import Task, task
from inspect_ai.agent import react
from inspect_ai.dataset import Sample
from inspect_ai.scorer import Score, mean, scorer
from inspect_ai.tool import bash

from harness import game, read_saves

UNUSED = {"stat18", "stat19"}  # the save's two empty skill slots, not skills in this game


def level_total(accounts):
    """The sum of every skill's level, each from its saved xp on rs-sdk's xp curve (saves.ts)."""
    return sum(s["level"] for a in accounts.values() for name, s in a["skills"].items() if name not in UNUSED)


@task
def total_level(ticks: int = 36000, tick_ms: int = 50):
    """The highest total level in the budget, from a new character in Lumbridge. Which skills, and
    how, is the agent's business."""
    return Task(
        dataset=[
            Sample(
                input="Raise your total level as high as you can.",
                metadata={
                    "accounts": [{"username": "skiller1", "save": "lumbridge.sav"}],
                    "world": {"NODE_TICKRATE": str(tick_ms), "GE_ENABLED": "false"},
                    "budget_ticks": ticks,
                },
            )
        ],
        setup=game(track=level_total),
        solver=react(tools=[bash(timeout=600, user="agent")]),  # the default agent: a model with a shell; --solver picks another
        scorer=total_level_total(),
        sandbox=("docker", "compose.yaml"),
    )


@scorer(metrics=[mean()])
def total_level_total():
    """The sum of all 19 skills' levels at the end of the game, each from the skill's xp in the server's save on rs-sdk's xp curve."""

    async def score(state, target):
        accounts = await read_saves(state)  # the server's saves, once the game is over
        return Score(value=level_total(accounts), metadata={name: level_total({name: a}) for name, a in accounts.items()})

    return score
