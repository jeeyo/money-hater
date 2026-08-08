"""One place that knows how to reach the model.

Both agents in the app — image understanding and next-stop recommendations —
run on the OpenAI Agents SDK against OpenAI's Responses API. The recommender
uses the SDK's hosted `WebSearchTool`, which only exists there, so the model is
not swappable for another vendor; keeping the wiring here means there is a
single file to change if that ever needs revisiting.
"""

import os

from app.config import settings


def llm_enabled() -> bool:
    """Whether a key is configured — explicitly, or the usual OPENAI_API_KEY."""
    return bool(settings.llm_api_key or os.environ.get("OPENAI_API_KEY"))


def prepare_sdk() -> None:
    """Settings the SDK needs before any agent runs.

    Tracing is off deliberately: the SDK uploads traces to OpenAI's dashboard by
    default, and a self-hosted trip logger quietly shipping your photo metadata
    and itinerary off the box is a surprise nobody asked for.
    """
    from agents import set_default_openai_key, set_tracing_disabled

    set_tracing_disabled(True)
    if settings.llm_api_key:
        # use_for_tracing=False for the same reason: the key must not be handed
        # to the trace exporter we just turned off.
        set_default_openai_key(settings.llm_api_key, use_for_tracing=False)
