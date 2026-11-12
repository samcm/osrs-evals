from inspect_ai import Task, task
from inspect_ai.dataset import Sample

from coins import coins_held, coins_total
from harness import command, game
from scorers import ticks_to_target


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
