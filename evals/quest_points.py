from inspect_ai import Task, task
from inspect_ai.agent import react
from inspect_ai.dataset import Sample
from inspect_ai.scorer import Score, mean, scorer
from inspect_ai.tool import bash

from harness import game, read_saves

QP = "101"  # the server's quest points varp; the engine recounts it from every quest's own varp


def qp_held(accounts):
    return sum(a["varps"].get(QP, 0) for a in accounts.values())


@task
def quest_points(ticks: int = 36000, tick_ms: int = 50):
    """As many quest points as possible in the budget, from a new character in Lumbridge. The goal
    is left open: which quests, in what order, is the agent's business."""
    return Task(
        dataset=[
            Sample(
                input="Get as many quest points as you can.",
                metadata={
                    "accounts": [{"username": "quester1", "save": "lumbridge.sav"}],
                    "world": {"NODE_TICKRATE": str(tick_ms), "GE_ENABLED": "false"},
                    "budget_ticks": ticks,
                },
            )
        ],
        setup=game(track=qp_held),
        solver=react(tools=[bash(timeout=600, user="agent")]),  # the default agent: a model with a shell; --solver picks another
        scorer=quest_points_total(),
        sandbox=("docker", "compose.yaml"),
    )


@scorer(metrics=[mean()])
def quest_points_total():
    async def score(state, target):
        accounts = await read_saves(state)  # the server's saves, once the game is over
        return Score(value=qp_held(accounts), metadata={name: qp_held({name: a}) for name, a in accounts.items()})

    return score
