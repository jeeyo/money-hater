"""The vision step runs on the OpenAI Agents SDK, and only when it can."""

import pytest

from app.config import settings
from app.services.llm import llm_enabled
from app.services.vision import VisionResult, analyze_image_content
from tests.util import make_jpeg


@pytest.fixture(autouse=True)
def clean_provider_env(monkeypatch):
    """Start each case with no credentials anywhere."""
    monkeypatch.delenv("OPENAI_API_KEY", raising=False)
    monkeypatch.setattr(settings, "llm_api_key", "")
    monkeypatch.setattr(settings, "llm_model", "gpt-4.1-mini")


def test_disabled_when_nothing_is_configured():
    assert llm_enabled() is False


def test_an_explicit_key_enables_it(monkeypatch):
    monkeypatch.setattr(settings, "llm_api_key", "sk-explicit")
    assert llm_enabled() is True


def test_the_usual_env_var_is_enough(monkeypatch):
    """No app-specific config needed when OPENAI_API_KEY is already set."""
    monkeypatch.setenv("OPENAI_API_KEY", "sk-from-env")
    assert llm_enabled() is True


async def test_analysis_is_skipped_when_no_key_is_configured(tmp_path):
    image = tmp_path / "a.jpg"
    image.write_bytes(make_jpeg(color=(1, 2, 3)))
    assert await analyze_image_content(image, "image/jpeg") is None


async def test_the_configured_model_reaches_the_sdk(monkeypatch, tmp_path):
    monkeypatch.setattr(settings, "llm_model", "gpt-4.1")
    monkeypatch.setattr(settings, "llm_api_key", "sk-test")

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
    assert captured["model"] == "gpt-4.1"
    assert captured["input"][0]["content"][0]["image_url"].startswith("data:image/jpeg;base64,")


async def test_tracing_is_off_so_photos_are_not_uploaded_to_the_trace_store(monkeypatch, tmp_path):
    """A self-hosted logger must not ship itinerary metadata to a dashboard."""
    import agents

    monkeypatch.setattr(settings, "llm_api_key", "sk-test")

    class FakeResult:
        final_output = VisionResult(kind="other", caption="a photo", labels=["x"])

    async def fake_run(agent, input):  # noqa: A002 - matches the SDK's signature
        return FakeResult()

    monkeypatch.setattr("agents.Runner.run", fake_run)

    image = tmp_path / "a.jpg"
    image.write_bytes(make_jpeg(color=(7, 7, 7)))
    await analyze_image_content(image, "image/jpeg")

    from agents.tracing import get_trace_provider

    assert get_trace_provider()._disabled is True
    assert agents  # imported for the side effect of the SDK being configured


async def test_stored_analysis_names_the_model_that_produced_it(
    client, db_sessionmaker, monkeypatch
):
    """So a later model switch is traceable in the data."""
    import sqlalchemy as sa

    import app.services.analysis as analysis_mod
    from app.models import ImageAnalysis
    from app.services.analysis import run_image_analysis
    from tests.conftest import register

    monkeypatch.setattr(settings, "llm_model", "gpt-4.1-mini")

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
        assert analysis.model == "gpt-4.1-mini"
