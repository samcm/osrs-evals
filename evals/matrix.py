"""Every eval played by omp, the one agent harness, so every model plays on the same footing. The
model is not fixed here, and neither is omp's thinking level: give them at run time, with the log dir:

    PYTHONPATH=. inspect eval-set evals/matrix.py --model anthropic/claude-haiku-5-5 -T thinking=high --log-dir <dir>

eval-set runs every task x model x epoch into <dir>, and run again on the same dir it does only what
is missing or failed. Each thinking level is its own run: give another -T thinking=<level> on the
same dir (with --log-dir-allow-dirty) to add it. -T thinking=null passes no level, for a model
that has none.
"""

from inspect_ai import task, task_with

from collection import collection
from dragon_slayer import dragon_slayer
from omp import omp
from quest_points import quest_points
from team_wealth import team_wealth
from total_level import total_level

EPOCHS = 2


@task
def qp_omp(thinking: str | None = "high"):
    return task_with(quest_points(), solver=omp(thinking=thinking), epochs=EPOCHS)


@task
def ds_omp(thinking: str | None = "high"):
    return task_with(dragon_slayer(), solver=omp(thinking=thinking), epochs=EPOCHS)


@task
def total_level_omp(thinking: str | None = "high"):
    return task_with(total_level(), solver=omp(thinking=thinking), epochs=EPOCHS)


@task
def collection_omp(thinking: str | None = "high"):
    return task_with(collection(), solver=omp(thinking=thinking), epochs=EPOCHS)


@task
def team_wealth_omp(thinking: str | None = "high"):
    return task_with(team_wealth(), solver=omp(thinking=thinking), epochs=EPOCHS)
