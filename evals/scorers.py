from inspect_ai.scorer import SampleScore, Score, mean, metric, scorer

from harness import read_saves


@metric
def mean_ticks_when_reached():
    def compute(scores: list[SampleScore]) -> float:
        ticks = [s.score.metadata["ticks"] for s in scores if s.score.metadata.get("ticks") is not None]
        return sum(ticks) / len(ticks) if ticks else float("nan")

    return compute


@scorer(metrics=[mean(), mean_ticks_when_reached()])
def ticks_to_target():
    """1 if the eval's measure reached its target within the budget, with the first tick (and
    wall-clock seconds) at which a sample showed it, counted from the start of the attempt. With
    several attempts: the fastest attempt, and every attempt's result in the metadata."""

    async def score(state, target):
        await read_saves(state)  # ends the game if the agent stopped first: final saves, full timeline
        goal, timeline = state.metadata["target"], state.metadata.get("timeline", [])
        per_attempt = []
        for k in sorted({p.get("attempt", 1) for p in timeline}):
            points = [p for p in timeline if p.get("attempt", 1) == k]
            first, reached = points[0], next((p for p in points if p["value"] >= goal), None)
            per_attempt.append({
                "attempt": k,
                "ticks": reached and reached["tick"] - first["tick"],
                "seconds": reached and round(reached["seconds"] - first["seconds"], 1),
                "best_value": max(p["value"] for p in points),
            })
        done = [a for a in per_attempt if a["ticks"] is not None]
        best = min(done, key=lambda a: a["ticks"]) if done else None
        return Score(
            value=1 if best else 0,
            answer=str(best and best["ticks"]),
            metadata={"ticks": best and best["ticks"], "seconds": best and best["seconds"], "target": goal, "attempts": per_attempt},
        )

    return score
