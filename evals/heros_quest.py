from inspect_ai import Task, task
from inspect_ai.agent import react
from inspect_ai.dataset import Sample
from inspect_ai.model import CompactionAuto
from inspect_ai.scorer import mean, scorer
from inspect_ai.tool import bash

from harness import game, read_saves
from scorers import mean_ticks_when_reached, ticks_to_target

# The server's varps (rs-sdk content/pack/varp.pack) and Hero's Quest's stages
# (content/scripts/quests/quest_hero/configs/quest_hero.constant). The Phoenix Gang's way to the
# armband is stages 2-6, the Black Arm Gang's 7-13; 15 is complete.
HERO = "188"
COMPLETE = 15
QP = "101"
STAGES = {
    0: "Not started", 1: "Started",
    2: "Phoenix: spoke to Straven", 3: "Phoenix: gave Alfonse the password", 4: "Phoenix: spoke to Charlie the cook",
    5: "Phoenix: killed Grip", 6: "Phoenix: has the master thief armband",
    7: "Black Arm: spoke to Katrine", 8: "Black Arm: gave Grubor the password", 9: "Black Arm: has Hartigen's ID papers",
    10: "Black Arm: inside Scarface Pete's mansion", 11: "Black Arm: gave Grip the ID papers", 12: "Black Arm: looted the candlesticks",
    13: "Black Arm: has the master thief armband", 15: "Complete",
}
# What Achietties asks before she starts the quest (content/scripts/quests/quest_hero/scripts/quest_hero.rs2):
# 55 quest points and these quests, each complete at its varp's value. Shield of Arrav is done in
# either gang, and each account's gang decides its way through Hero's Quest.
QUEST_POINTS = 55
QUESTS = {
    "shield_of_arrav": lambda v: v.get("145", 0) == 4 or v.get("146", 0) == 10,
    "lost_city": lambda v: v.get("147", 0) >= 6,
    "merlins_crystal": lambda v: v.get("14", 0) >= 7,
    "dragon_slayer": lambda v: v.get("176", 0) >= 10,
}
# The levels the quest checks where they are used: the rockslide to the Ice Queen's lair (Mining),
# blamish oil (Herblore), the lava eel's fishing spot and cooking it.
SKILLS = {"cooking": 53, "fishing": 53, "mining": 50, "herblore": 25}


def quest_stage(accounts):
    return max(a["varps"].get(HERO, 0) for a in accounts.values())


def gang(varps) -> str | None:
    if varps.get("145", 0) >= 3:
        return "Black Arm"
    if varps.get("146", 0) >= 9:
        return "Phoenix"
    return None


def progress(account) -> dict:
    """How far one account got: its quest stage, and which of the quest's requirements it meets."""
    v, stage = account["varps"], account["varps"].get(HERO, 0)
    quests = {q: done(v) for q, done in QUESTS.items()}
    skills = {s: account["skills"][s]["level"] for s in SKILLS}
    met = [q for q, ok in quests.items() if ok] + [s for s, lvl in skills.items() if lvl >= SKILLS[s]] + (["quest_points"] if v.get(QP, 0) >= QUEST_POINTS else [])
    return {
        "stage": stage,
        "stage_name": STAGES.get(stage, f"Stage {stage}"),
        "gang": gang(v),
        "quest_points": v.get(QP, 0),
        "quests": quests,
        "skills": skills,
        "requirements_met": len(met),
        "requirements": len(QUESTS) + len(SKILLS) + 1,
    }


@task
def heros_quest(ticks: int = 576000, tick_ms: int = 50):
    """Complete Hero's Quest on either of two new characters outside Lumbridge Castle, as fast as
    possible. Achietties starts it only for 55 quest points with Shield of Arrav, Lost City, Merlin's
    Crystal and Dragon Slayer done, and its armband needs a Phoenix Gang member and a Black Arm Gang
    member working together, so both accounts need those requirements; the eel and the feather need
    53 Fishing and Cooking, 25 Herblore and 50 Mining. How to get there is the agent's business. The
    budget is eight hours of game time."""
    return Task(
        dataset=[
            Sample(
                input="Complete Hero's Quest on at least one of your accounts as fast as you can.",
                metadata={
                    "accounts": [{"username": f"hero{i + 1}", "save": "lumbridge.sav"} for i in range(2)],
                    "world": {"NODE_TICKRATE": str(tick_ms), "GE_ENABLED": "false"},
                    "budget_ticks": ticks,
                    "target": COMPLETE,
                },
            )
        ],
        setup=game(track=quest_stage, done=lambda accounts: quest_stage(accounts) >= COMPLETE),
        # The default agent: a model with a shell that compacts its history; --solver picks another.
        solver=react(tools=[bash(timeout=600, user="agent")], compaction=CompactionAuto()),
        scorer=heros_quest_score(),
        sandbox=("docker", "compose.yaml"),
    )


@scorer(metrics=[mean(), mean_ticks_when_reached()])
def heros_quest_score():
    """ticks_to_target on the best account's quest stage (1 when one account completed the quest, with
    the tick it did), plus each account's progress at the end: its stage, gang, quest points, the
    four quests, the four skill levels, and how many of the nine requirements it meets."""
    reached = ticks_to_target()

    async def score(state, target):
        s = await reached(state, target)
        accounts = await read_saves(state)
        s.metadata["accounts"] = {name: progress(a) for name, a in accounts.items()}
        return s

    return score
