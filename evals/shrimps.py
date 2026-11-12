from inspect_ai import Task, task
from inspect_ai.agent import react
from inspect_ai.dataset import Sample
from inspect_ai.scorer import Score, mean, scorer
from inspect_ai.tool import bash

from harness import game, read_saves
from scorers import ticks_to_target

RAW, NOTED_RAW, COOKED, BURNT = "317", "318", "315", "323"
COUNT = 500


def held(accounts, item):
    return sum(a[c].get(item, 0) for a in accounts.values() for c in ("inv", "bank"))


def shrimps_done(accounts):
    """Raw shrimps no longer held: cooked, burnt (or got rid of; the cooked count shows that)."""
    return COUNT - held(accounts, RAW) - held(accounts, NOTED_RAW)


@task
def shrimps(ticks: int = 30000, tick_ms: int = 50, attempts: int = 1):
    """Cook 500 raw shrimps from the bank as fast as possible: a task any model should finish, so the
    result is how fast and how cheaply it does."""
    return Task(
        dataset=[
            Sample(
                input=f"Cook all {COUNT} raw shrimps in your bank as fast as possible. You are scored on how many game ticks it takes until none are left raw.",
                metadata={
                    "accounts": [{"username": "chef1", "save": "alkharid_shrimps.sav"}],
                    "world": {"NODE_TICKRATE": str(tick_ms), "GE_ENABLED": "false"},
                    "budget_ticks": ticks,
                    "attempts": attempts,
                    "target": COUNT,
                },
            )
        ],
        setup=game(track=shrimps_done, done=lambda accounts: shrimps_done(accounts) >= COUNT),
        solver=react(tools=[bash(timeout=600, user="agent")]),  # the default agent: a model with a shell; --solver picks another
        scorer=[ticks_to_target(), shrimps_cooked()],
        sandbox=("docker", "compose.yaml"),
    )


@scorer(metrics=[mean()])
def shrimps_cooked():
    """Cooked shrimps held at the end, with burnt and raw ones."""

    async def score(state, target):
        accounts = await read_saves(state)
        cooked, burnt, raw = held(accounts, COOKED), held(accounts, BURNT), held(accounts, RAW) + held(accounts, NOTED_RAW)
        return Score(value=cooked, metadata={"cooked": cooked, "burnt": burnt, "raw": raw, "other": COUNT - cooked - burnt - raw})

    return score
