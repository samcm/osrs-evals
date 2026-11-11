from inspect_ai import Task, task
from inspect_ai.dataset import Sample
from inspect_ai.scorer import Score, SampleScore, mean, metric, scorer

from coins import coins_held, coins_total
from harness import run_program


@task
def gold(program: str = "sh /programs/each.sh bun /programs/pickpocket.ts", accounts: int = 4, ticks: int = 36000, target: int = 100_000):
    """Time for a group of accounts to hold 100,000 coins between them (30 minutes of game at 8x)."""
    return Task(
        dataset=[
            Sample(
                input=f"Get these accounts to {target:,} coins between them, as fast as you can. Coins in their inventories and banks count.",
                metadata={
                    "accounts": [{"username": f"gold{i + 1}", "save": "lumbridge.sav"} for i in range(accounts)],
                    "world": {"NODE_TICKRATE": "50", "GE_ENABLED": "false"},
                    "budget_ticks": ticks,
                    "target": target,
                },
            )
        ],
        solver=run_program(program, track=coins_held),
        scorer=[coins_total(), ticks_to_target()],
        sandbox=("docker", "compose.yaml"),
    )


@metric
def mean_ticks_when_reached():
    def compute(scores: list[SampleScore]) -> float:
        ticks = [s.score.metadata["ticks"] for s in scores if s.score.metadata.get("ticks") is not None]
        return sum(ticks) / len(ticks) if ticks else float("nan")

    return compute


@scorer(metrics=[mean(), mean_ticks_when_reached()])
def ticks_to_target():
    """1 if the accounts reached the target within the budget, with the first tick they held it."""

    async def score(state, target):
        goal = state.metadata["target"]
        reached = next((p["tick"] for p in state.metadata.get("timeline", []) if p["value"] >= goal), None)
        return Score(value=1 if reached is not None else 0, answer=str(reached), metadata={"ticks": reached, "target": goal})

    return score
