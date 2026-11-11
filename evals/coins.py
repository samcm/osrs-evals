from inspect_ai import Task, task
from inspect_ai.dataset import Sample
from inspect_ai.scorer import Score, mean, scorer
from harness import run_program, read_saves


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
        solver=run_program(program),
        scorer=coins_total(),
        sandbox=("docker", "compose.yaml"),
    )


@scorer(metrics=[mean()])
def coins_total():
    async def score(state, target):
        saves = await read_saves(state)  # read from the server's save files, after logout
        return Score(value=sum(s["coins"] for s in saves.values()), metadata=saves)

    return score
