"""omp (oh-my-pi) as the agent, at a pinned version, so every model plays through the same harness.

It runs the world image's omp in print mode inside the sandbox as the unprivileged agent user, in
/work, with the eval's goal and the machine note every agent gets as its prompt. omp's model calls go to Inspect's
agent bridge, which serves them with --model, so Inspect logs each call with its tokens.

    PYTHONPATH=. inspect eval evals/quest_points.py --model anthropic/claude-haiku-5-5 --solver evals/omp.py@omp -S thinking=high
"""

import json

from inspect_ai.agent import sandbox_agent_bridge
from inspect_ai.log import transcript
from inspect_ai.model import ChatMessageUser, get_model
from inspect_ai.solver import solver
from inspect_ai.util import sandbox

VERSION = "19.0.1"  # the version image/Dockerfile installs
BRIDGE = "http://localhost:13131"
HOME = "/home/agent"  # the agent user's home: omp's settings and sessions, outside /work


@solver
def omp(thinking: str | None = "high", version: str = VERSION, model: str | None = None):
    """omp with the eval's model.

    thinking: omp's --thinking level (off, minimal, low, medium, high, xhigh, max); None passes no
    level, for a model that has none.
    version: the omp release the world image must have.
    model: omp's name for the model, as provider/id. Defaults to the eval's model name without
    Inspect's provider (openai/opencode-go/glm-5.3 is omp's opencode-go/glm-5.3;
    anthropic/claude-opus-4-8 is anthropic/claude-opus-4-8). omp formats its requests for that
    model; the bridge serves every request with --model whatever it names.
    """

    async def solve(state, generate):
        sb = sandbox()
        inspect_provider, model_name = str(get_model()).split("/", 1)
        name = model or (model_name if "/" in model_name else f"{inspect_provider}/{model_name}")
        provider, model_id = name.split("/", 1)
        # The bridge serves the OpenAI (Responses, Chat Completions), Anthropic and Google APIs, but not
        # the Codex backend's, so a ChatGPT-plan model is omp's OpenAI one: same model id, Responses API.
        provider = {"openai-codex": "openai"}.get(provider, provider)
        name = f"{provider}/{model_id}"

        await check_installed(sb, version)
        # omp's own provider for the model, in its own API, pointed at the bridge: omp keeps what it knows
        # about the model (context window, thinking levels, request format).
        await sb.write_file(f"{HOME}/.omp/agent/models.yml", json.dumps({"providers": {provider: {"baseUrl": f"{BRIDGE}/v1", "apiKey": "inspect", "auth": "apiKey"}}}))
        # omp's own intent field on every tool call (off by default in print mode), and no update check.
        await sb.write_file(f"{HOME}/.omp/agent/config.yml", json.dumps({"tools": {"intentTracing": True}, "startup": {"checkUpdate": False}}))
        await sb.exec(concurrency=False, cmd=["chown", "-R", "agent", f"{HOME}/.omp"])

        prompt = "\n\n".join(m.text for m in state.messages if isinstance(m, ChatMessageUser))
        cmd = [
            "omp", "-p", "--auto-approve", *(["--thinking", thinking] if thinking else []),
            # every role omp has is this model, and auxiliary services stay on its provider (the bridge)
            "--model", name, "--smol", name, "--slow", name, "--plan", name, "--offline", "--no-title",
            # print mode waits for the agent's background jobs and wakes it with their results, as the TUI does
            "--wait-async",
            prompt,
        ]
        env = {"HOME": HOME, "PATH": "/usr/local/bin:/usr/bin:/bin", "PI_OPENAI_STATEFUL": "0"}
        # omp's own generation settings (its thinking level, output cap) reach --model as it sent them
        async with sandbox_agent_bridge(forward_generation_config=True):
            result = await sb.exec(concurrency=False, cmd=cmd, user="agent", cwd="/work", env=env)
        output = (result.stdout + result.stderr)[-6000:]
        state.metadata["omp"] = {"version": version, "model": name, "thinking": thinking, "exit": result.returncode, "output": output}
        calls = [e for e in transcript().events if e.event == "model"]
        if result.returncode != 0 and not any(not e.error for e in calls):
            raise RuntimeError(f"omp exited {result.returncode} without a model call: {output}")
        return state

    return solve


async def check_installed(sb, version: str) -> None:
    """The world image has omp at the pinned version (image/Dockerfile installs it)."""
    have = await sb.exec(concurrency=False, cmd=["omp", "--version"])
    if have.stdout.strip() != f"omp/{version}":
        raise RuntimeError(f"the sandbox has {have.stdout.strip() or 'no omp'}, not omp/{version}: rebuild the world image (image/build.sh)")
