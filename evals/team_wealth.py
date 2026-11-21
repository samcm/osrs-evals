from inspect_ai import Task, task
from inspect_ai.agent import react
from inspect_ai.dataset import Sample
from inspect_ai.scorer import Score, mean, scorer
from inspect_ai.tool import bash

from harness import OBJS, game, read_saves


def wealth(accounts):
    """What the accounts hold in their inventories, banks and worn equipment, each item at its store
    value in the game's own item config (a note at its item's value; coins at face value)."""
    return sum(n * OBJS[int(i)]["cost"] for a in accounts.values() for where in ("inv", "bank", "worn") for i, n in a[where].items())


@task
def team_wealth(accounts: int = 4, ticks: int = 72000, tick_ms: int = 50):
    """The most wealth held between a group of new characters in Lumbridge at the end of the budget."""
    return Task(
        dataset=[
            Sample(
                input="Become as rich as you can between you.",
                metadata={
                    "accounts": [{"username": f"wealth{i + 1}", "save": "lumbridge.sav"} for i in range(accounts)],
                    "world": {"NODE_TICKRATE": str(tick_ms), "GE_ENABLED": "false"},
                    "budget_ticks": ticks,
                },
            )
        ],
        setup=game(track=wealth),
        solver=react(tools=[bash(timeout=600, user="agent")]),  # the default agent: a model with a shell; --solver picks another
        scorer=team_wealth_total(),
        sandbox=("docker", "compose.yaml"),
    )


@scorer(metrics=[mean()])
def team_wealth_total():
    """The store value of everything the four accounts hold in their inventories, banks and worn equipment at the end of the game, from the server's saves: each item at its cost in the obj config, a note at its item's cost, coins at face value."""

    async def score(state, target):
        accounts = await read_saves(state)  # the server's saves, once the game is over
        return Score(value=wealth(accounts), metadata={name: wealth({name: a}) for name, a in accounts.items()})

    return score
