"""Model portability: the vision step is provider-agnostic via LiteLLM."""

import pytest

from app.config import settings
from app.services.vision import (
    VisionResult,
    analyze_image_content,
    model_provider,
    vision_enabled,
)
from tests.util import make_jpeg


@pytest.fixture(autouse=True)
def clean_provider_env(monkeypatch):
    """Start each case with no provider credentials in the environment."""
    for name in ["OPENAI_API_KEY", "ANTHROPIC_API_KEY", "GEMINI_API_KEY", "GROQ_API_KEY"]:
        monkeypatch.delenv(name, raising=False)
    monkeypatch.setattr(settings, "llm_api_key", "")
    monkeypatch.setattr(settings, "llm_api_base", "")
    monkeypatch.setattr(settings, "llm_model", "openai/gpt-4.1-mini")


@pytest.mark.parametrize(
    ("model", "provider"),
    [
        ("openai/gpt-4.1-mini", "openai"),
        ("anthropic/claude-sonnet-4-5", "anthropic"),
        ("gemini/gemini-2.5-flash", "gemini"),
        ("ollama/llava", "ollama"),
        ("gpt-4.1-mini", "openai"),  # a bare name is OpenAI, as LiteLLM assumes
    ],
)
def test_provider_is_read_from_the_model_name(monkeypatch, model, provider):
    monkeypatch.setattr(settings, "llm_model", model)
    assert model_provider() == provider


def test_disabled_when_nothing_is_configured():
    assert vision_enabled() is False


def test_an_explicit_key_enables_any_provider(monkeypatch):
    monkeypatch.setattr(settings, "llm_model", "anthropic/claude-sonnet-4-5")
    monkeypatch.setattr(settings, "llm_api_key", "sk-ant-...")
    assert vision_enabled() is True


@pytest.mark.parametrize(
    ("model", "env_var"),
    [
        ("openai/gpt-4.1-mini", "OPENAI_API_KEY"),
        ("anthropic/claude-sonnet-4-5", "ANTHROPIC_API_KEY"),
        ("gemini/gemini-2.5-flash", "GEMINI_API_KEY"),
    ],
)
def test_the_provider_own_env_var_is_enough(monkeypatch, model, env_var):
    """No app-specific config needed if the usual provider variable is set."""
    monkeypatch.setattr(settings, "llm_model", model)
    monkeypatch.setenv(env_var, "a-key")
    assert vision_enabled() is True


def test_another_providers_key_does_not_count(monkeypatch):
    monkeypatch.setattr(settings, "llm_model", "anthropic/claude-sonnet-4-5")
    monkeypatch.setenv("OPENAI_API_KEY", "sk-...")
    assert vision_enabled() is False


def test_local_models_need_no_credential(monkeypatch):
    monkeypatch.setattr(settings, "llm_model", "ollama/llava")
    assert vision_enabled() is True


def test_a_base_url_alone_is_enough(monkeypatch):
    """Pointing at a LiteLLM proxy or a self-hosted server."""
    monkeypatch.setattr(settings, "llm_model", "hosted_vllm/qwen2-vl")
    monkeypatch.setattr(settings, "llm_api_base", "http://vllm.internal:8000/v1")
    assert vision_enabled() is True


async def test_analysis_is_skipped_when_no_provider_is_configured(tmp_path):
    image = tmp_path / "a.jpg"
    image.write_bytes(make_jpeg(color=(1, 2, 3)))
    assert await analyze_image_content(image, "image/jpeg") is None


async def test_the_agent_runs_on_a_litellm_model(monkeypatch, tmp_path):
    """The configured provider/model reaches the SDK as a LiteLLM model."""
    from agents.extensions.models.litellm_model import LitellmModel

    monkeypatch.setattr(settings, "llm_model", "anthropic/claude-sonnet-4-5")
    monkeypatch.setattr(settings, "llm_api_key", "sk-ant-test")
    monkeypatch.setattr(settings, "llm_api_base", "https://proxy.internal/v1")

    captured = {}

    class FakeResult:
        final_output = VisionResult(kind="other", caption="a photo", labels=["x"])

    async def fake_run(agent, input):  # noqa: A002 - matches the SDK's signature
        captured["model"] = agent.model
        captured["input"] = input
        return FakeResult()

    monkeypatch.setattr("agents.Runner.run", fake_run)

    image = tmp_path / "a.jpg"
    image.write_bytes(make_jpeg(color=(4, 5, 6)))
    result = await analyze_image_content(image, "image/jpeg")

    assert result is not None and result.caption == "a photo"
    model = captured["model"]
    assert isinstance(model, LitellmModel)
    assert model.model == "anthropic/claude-sonnet-4-5"
    assert model.api_key == "sk-ant-test"
    assert model.base_url == "https://proxy.internal/v1"
    # The image still travels as a data URL, whichever provider is behind it
    assert captured["input"][0]["content"][0]["image_url"].startswith("data:image/jpeg;base64,")


async def test_stored_analysis_names_the_model_that_produced_it(
    client, db_sessionmaker, monkeypatch
):
    """So a later provider switch is traceable in the data."""
    import sqlalchemy as sa

    import app.services.analysis as analysis_mod
    from app.models import ImageAnalysis
    from app.services.analysis import run_image_analysis
    from tests.conftest import register

    monkeypatch.setattr(settings, "llm_model", "gemini/gemini-2.5-flash")

    async def fake_vision(path, mime):
        return VisionResult(kind="food", caption="a bowl of ramen", labels=["ramen"])

    monkeypatch.setattr(analysis_mod, "analyze_image_content", fake_vision)

    await register(client)
    created = (
        await client.post(
            "/api/images",
            files=[("files", ("a.jpg", make_jpeg(color=(7, 8, 9)), "image/jpeg"))],
        )
    ).json()
    async with db_sessionmaker() as db:
        await run_image_analysis(db, created[0]["id"])
        analysis = await db.scalar(sa.select(ImageAnalysis))
        assert analysis.model == "gemini/gemini-2.5-flash"
