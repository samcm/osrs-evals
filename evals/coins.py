from inspect_ai import Task, task
from inspect_ai.dataset import Sample
from inspect_ai.scorer import Score, mean, scorer

from harness import read_saves, run_program


def coins_held(accounts):
    """Coins the accounts hold, in their inventories and banks."""
    return sum(a["inv"].get("995", 0) + a["bank"].get("995", 0) for a in accounts.values())


@task
def coins(program: str = "bun /programs/pickpocket.ts", ticks: int = 2000):
    return Task(
        dataset=[
            Sample(
                input="Get as many coins as you can.",
                metadata={
                    "accounts": [{"username": "acct1", "save": "lumbridge.sav"}],
                    "world": {"NODE_TICKRATE": "50", "GE_ENABLED": "false"},
                    "budget_ticks": ticks,
                },
            )
        ],
        solver=run_program(program, track=coins_held),
        scorer=coins_total(),
        sandbox=("docker", "compose.yaml"),
    )


@scorer(metrics=[mean()])
def coins_total():
    async def score(state, target):
        accounts = await read_saves(state)  # the server's saves, written at logout
        return Score(value=coins_held(accounts), metadata={name: coins_held({name: a}) for name, a in accounts.items()})

    return score
