"""omp (oh-my-pi) as the agent, at a pinned version, so every model plays through the same harness.

It runs the world image's omp in print mode inside the sandbox as the unprivileged agent user, in
/work, with the eval's goal and the machine note every agent gets as its prompt. omp's model calls go to Inspect's
agent bridge, which serves them with --model, so Inspect logs each call with its tokens.

    PYTHONPATH=. inspect eval evals/quest_points.py --model anthropic/claude-haiku-5-5 --solver evals/omp.py@omp -S thinking=high
"""

import json

from pydantic import ValidationError

from inspect_ai.agent import sandbox_agent_bridge
from inspect_ai.agent._bridge import responses_impl
from inspect_ai.agent._bridge.sandbox import service as bridge_service
from inspect_ai.log import transcript
from inspect_ai.model import ChatMessageUser, GenerateConfig, GenerateInput, Model, get_model
from inspect_ai.solver import solver
from inspect_ai.util import sandbox

from harness import check

VERSION = "19.0.1"  # the version image/Dockerfile installs
BRIDGE = "http://localhost:13131"
HOME = "/home/agent"  # the agent user's home: omp's settings and sessions, outside /work
BUDGET_LEVELS = {1024: "minimal", 2048: "low", 8192: "medium", 16384: "high", 32768: "xhigh"}  # omp's thinkingBudgets
# Models on private inference (openai-api/private/<id>, with PRIVATE_BASE_URL and PRIVATE_API_KEY) have no
# provider in omp, so omp gets one that speaks Chat Completions; omp's own reference for the id gives its
# context window and thinking levels. Overrides where the endpoint differs: its Qwen3.8 27B takes only
# reasoning_effort low, medium or xhigh, and the bridge forwards reasoning_effort but not the chat
# template's kwargs, where omp would put Qwen's effort.
PRIVATE_MODELS = {
    "qwen3.8-27b": {"thinking": {"mode": "effort", "efforts": ["low", "medium", "xhigh"]}, "compat": {"thinkingFormat": "openai"}},
}


@solver
def omp(thinking: str = "high", version: str = VERSION, model: str | None = None):
    """omp with the eval's model.

    thinking: omp's --thinking level (off, minimal, low, medium, high, xhigh, max), always passed.
    "none" is for a model with no thinking levels (it takes no thinking setting): omp gets no
    --thinking and sends the model no thinking field.
    version: the omp release the world image must have.
    model: omp's name for the model, as provider/id. Defaults to the eval's model name without
    Inspect's provider (openai/opencode-go/glm-5.3 is omp's opencode-go/glm-5.3;
    anthropic/claude-opus-4-8 is anthropic/claude-opus-4-8). omp formats its requests for that
    model; the bridge serves every request with --model whatever it names.
    """

    # Inspect parses -T/-S values as YAML, so an unquoted `thinking=off` arrives as False
    thinking = "off" if thinking is False else thinking

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
        config = {"baseUrl": f"{BRIDGE}/v1", "apiKey": "inspect", "auth": "apiKey"}
        if provider == "private":
            config |= {"api": "openai-completions", "models": [{"id": model_id, **PRIVATE_MODELS.get(model_id, {})}]}
        await sb.write_file(f"{HOME}/.omp/agent/models.yml", json.dumps({"providers": {provider: config}}))
        # omp's own intent field on every tool call (off by default in print mode), no update check, and
        # no retries: a failed model call reaches the agent as it failed (omp retries 10 times by default).
        await sb.write_file(f"{HOME}/.omp/agent/config.yml", json.dumps({"tools": {"intentTracing": True}, "startup": {"checkUpdate": False}, "retry": {"enabled": False}}))
        await sb.exec(concurrency=False, cmd=["chown", "-R", "agent", f"{HOME}/.omp"])
        if thinking != "none":
            # omp's bundled subagents (task, scout, ...) set their own thinking levels (auto, medium):
            # the same definitions, unpacked as user agents, at this run's level.
            pin = f"for f in {HOME}/.omp/agent/agents/*.md; do grep -q '^thinkingLevel:' $f && sed -i 's/^thinkingLevel:.*/thinkingLevel: {thinking}/' $f || sed -i '0,/^name:/s//thinkingLevel: {thinking}\\nname:/' $f; done"
            await check(sb.exec(concurrency=False, cmd=["sh", "-c", f"omp agents unpack --force >/dev/null && {pin}"], user="agent", env={"HOME": HOME}))

        prompt = "\n\n".join(m.text for m in state.messages if isinstance(m, ChatMessageUser))
        cmd = [
            "omp", "-p", "--auto-approve", *(["--thinking", thinking] if thinking != "none" else []),
            # every role omp has is this model, and auxiliary services stay on its provider (the bridge)
            "--model", name, "--smol", name, "--slow", name, "--plan", name, "--offline", "--no-title",
            # print mode waits for the agent's background jobs and wakes it with their results, as the TUI does
            "--wait-async",
            prompt,
        ]
        env = {"HOME": HOME, "PATH": "/usr/local/bin:/usr/bin:/bin", "PI_OPENAI_STATEFUL": "0"}
        # omp's own generation settings (its thinking level, output cap) reach --model as it sent them
        async with sandbox_agent_bridge(forward_generation_config=True, filter=one_try(thinking)):
            result = await sb.exec(concurrency=False, cmd=cmd, user="agent", cwd="/work", env=env)
        output = (result.stdout + result.stderr)[-6000:]
        state.metadata["omp"] = {"version": version, "model": name, "thinking": thinking, "exit": result.returncode, "output": output}
        calls = [e for e in transcript().events if e.event == "model"]
        if result.returncode != 0 and not any(not e.error for e in calls):
            raise RuntimeError(f"omp exited {result.returncode} without a model call: {output}")
        return state

    return solve


def one_try(thinking: str):
    """The bridge's filter for a run at this thinking level: every model call is sent once (Inspect
    retries a failed call, 429 or 5xx, without limit by default), and its thinking is the level's."""

    async def filter(model: Model, messages, tools, tool_choice, config: GenerateConfig):
        """Every model call is sent once: Inspect retries a failed call (429, 5xx) without limit by default.

        omp asks some models for a thinking budget (it speaks Anthropic's API to them, as for Qwen on
        OpenCode Go), and Inspect's OpenAI provider drops budgets: send it the level the budget stands for."""
        client = getattr(model.api, "client", None)
        if client is not None and hasattr(client, "max_retries"):
            client.max_retries = 0  # the provider's SDK client (OpenAI's, Anthropic's) retries twice by default
        update: dict = {"max_retries": 0}
        if str(model).startswith("openai/") and config.reasoning_tokens and not config.reasoning_effort:
            update |= {"reasoning_effort": BUDGET_LEVELS.get(config.reasoning_tokens, "high"), "reasoning_tokens": None}
        # omp's "off" reaches the Anthropic bridge as a thinking type it doesn't map, so Inspect sent
        # adaptive thinking at the default effort. "none" makes it "disabled" for a model that takes
        # it (Haiku 5.5); a model that can't turn thinking off then fails its first call instead of
        # running mislabelled (the omp gateway rejects Sonnet 5.5's "between_tools")
        if thinking == "off" and not config.reasoning_tokens and not config.reasoning_effort:
            update |= {"reasoning_effort": "none"}
        return GenerateInput(messages, tools, tool_choice, config.model_copy(update=update))

    return filter


_echo_tool_choice = responses_impl.responses_tool_choice_param_to_tool_choice


def _echo_tool_choice_or_auto(tool_choice):
    """omp's web_search on an OpenAI model is a Responses call that forces OpenAI's native search
    (tool_choice {"type": "web_search"}). The bridge withholds that tool and serves the call as
    "auto", as it does for Claude's search, but then fails to echo the request's tool_choice in its
    response (its Responses types only know web_search_preview), so omp got an error instead of the
    answer. Echo "auto", the choice the bridge actually served."""
    try:
        return _echo_tool_choice(tool_choice)
    except ValidationError:
        return "auto"


responses_impl.responses_tool_choice_param_to_tool_choice = _echo_tool_choice_or_auto

_provider_error_payload = bridge_service.provider_error_payload


def _not_retryable(ex: Exception):
    """omp's HTTP client sends a request again, up to 5 times, on a 408, 409, 429 or 5xx reply (no
    setting turns that off): forward a failed model call as a 400, with its own status in the message."""
    payload = _provider_error_payload(ex)
    status = payload.get("status")
    if status is None or status in (408, 409, 429) or status >= 500:
        payload["message"] = f"{status or 'error'}: {payload['message']}"
        payload["status"] = 400
    return payload


bridge_service.provider_error_payload = _not_retryable


async def check_installed(sb, version: str) -> None:
    """The world image has omp at the pinned version (image/Dockerfile installs it)."""
    have = await sb.exec(concurrency=False, cmd=["omp", "--version"])
    if have.stdout.strip() != f"omp/{version}":
        raise RuntimeError(f"the sandbox has {have.stdout.strip() or 'no omp'}, not omp/{version}: rebuild the world image (image/build.sh)")
