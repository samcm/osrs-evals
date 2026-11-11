from inspect_ai import Task, task
from inspect_ai.dataset import Sample
from inspect_ai.scorer import Score, SampleScore, mean, metric, scorer

from coins import coins_held, coins_total
from harness import command, game, read_saves


@task
def gold(accounts: int = 4, ticks: int = 36000, target: int = 100_000):
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
        setup=game(track=coins_held),
        solver=command("sh /programs/each.sh bun /programs/pickpocket.ts"),  # the default agent; --solver picks another
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
    """1 if the eval's measure reached its target within the budget, with the first tick (and
    wall-clock seconds since the game started) at which a sample showed it."""

    async def score(state, target):
        await read_saves(state)  # ends the game if the agent stopped first: final saves, full timeline
        goal = state.metadata["target"]
        reached = next((p for p in state.metadata.get("timeline", []) if p["value"] >= goal), None)
        ticks = reached and reached["tick"]
        return Score(value=1 if reached else 0, answer=str(ticks), metadata={"ticks": ticks, "seconds": reached and reached["seconds"], "target": goal})

    return score
