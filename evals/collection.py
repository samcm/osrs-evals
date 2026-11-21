from inspect_ai import Task, task
from inspect_ai.agent import react
from inspect_ai.dataset import Sample
from inspect_ai.scorer import Score, mean, scorer
from inspect_ai.tool import bash

from harness import OBJS, game, read_saves


def item_types(accounts):
    """The distinct items the accounts hold in their inventories, banks and worn equipment. A noted
    item counts as the item it notes (the game's own cert link), so noting does not count twice."""
    return {OBJS[int(i)]["unnoted"] for a in accounts.values() for where in ("inv", "bank", "worn") for i in a[where]}


def item_types_held(accounts):
    return len(item_types(accounts))


@task
def collection(ticks: int = 72000, tick_ms: int = 50):
    """The most different items held at the end of the budget, from a new character in Lumbridge."""
    return Task(
        dataset=[
            Sample(
                input="Collect as many different items as you can.",
                metadata={
                    "accounts": [{"username": "collector1", "save": "lumbridge.sav"}],
                    "world": {"NODE_TICKRATE": str(tick_ms), "GE_ENABLED": "false"},
                    "budget_ticks": ticks,
                },
            )
        ],
        setup=game(track=item_types_held),
        solver=react(tools=[bash(timeout=600, user="agent")]),  # the default agent: a model with a shell; --solver picks another
        scorer=collection_total(),
        sandbox=("docker", "compose.yaml"),
    )


@scorer(metrics=[mean()])
def collection_total():
    """Distinct items held in the inventory, bank and worn equipment at the end of the game, from the server's save; a noted item counts as the item it notes (the obj config's cert link)."""

    async def score(state, target):
        accounts = await read_saves(state)  # the server's saves, once the game is over
        return Score(
            value=item_types_held(accounts),
            answer=", ".join(sorted(str(OBJS[i]["name"]) for i in item_types(accounts))),
            metadata={name: item_types_held({name: a}) for name, a in accounts.items()},
        )

    return score
