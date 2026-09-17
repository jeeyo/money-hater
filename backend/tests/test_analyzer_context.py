"""The analyst is told when and where the photo was before it is asked anything.

Everything the model is bad at — what year it is, which country's money the
bare ฿ in front of the total is, what the shop across the top is called when
the print has given up — the phone already knows. Handing that over costs one
paragraph of prompt and no API call, and it is what stops a faint date coming
back as 2019.
"""

from datetime import UTC, datetime

import pytest

import app.services.analysis as analysis_mod
from app.config import settings
from app.models import Place
from app.services.analysis import run_image_analysis
from app.services.vision import PhotoContext, VisionResult, analyze_image_content
from tests.conftest import register
from tests.util import make_jpeg

BKK = (13.7563, 100.5018)


def test_a_context_with_nothing_in_it_says_nothing():
    """No clock, no fix, no name — and so no invitation to infer from a blank."""
    assert PhotoContext().as_prompt() == ""


def test_the_context_names_the_day_and_the_place():
    text = PhotoContext(
        captured_at=datetime(2026, 8, 8, 13, 5),
        captured_at_source="exif",
        now=datetime(2026, 8, 9),
        lat=BKK[0],
        lng=BKK[1],
        place_name="Kopi 1930",
        place_address="1 St Andrew's Rd",
    ).as_prompt()
    assert "2026-08-08 13:05" in text
    assert "camera's own clock" in text
    assert "Today is 2026-08-09" in text
    assert "13.75630, 100.50180" in text
    assert "Kopi 1930, 1 St Andrew's Rd" in text


def test_a_photo_with_no_clock_of_its_own_says_so():
    """Filed under when it arrived, which is not evidence of when it was taken."""
    text = PhotoContext(
        captured_at=datetime(2026, 8, 8, 13, 5), captured_at_source="upload"
    ).as_prompt()
    assert "recorded no time" in text
    assert "2026-08-08 13:05" in text


async def test_the_context_reaches_the_model(monkeypatch, tmp_path):
    monkeypatch.setattr(settings, "llm_api_key", "sk-test")
    captured = {}

    class FakeResult:
        final_output = VisionResult(kind="other", caption="a photo", labels=["x"])

    async def fake_run(agent, input):  # noqa: A002 - matches the SDK's signature
        captured["input"] = input
        return FakeResult()

    monkeypatch.setattr("agents.Runner.run", fake_run)
    image = tmp_path / "a.jpg"
    image.write_bytes(make_jpeg(color=(4, 5, 6)))

    await analyze_image_content(
        image,
        "image/jpeg",
        context=PhotoContext(now=datetime(2026, 8, 9), lat=BKK[0], lng=BKK[1]),
    )

    text = captured["input"][0]["content"][1]["text"]
    assert text.startswith("Analyze this photo.")
    assert "Today is 2026-08-09" in text
    assert "13.75630, 100.50180" in text


async def test_the_pipeline_hands_over_the_photos_own_time_and_fix(
    client, db_sessionmaker, monkeypatch
):
    seen: dict[str, PhotoContext] = {}

    async def fake_vision(path, mime, context=None):
        seen["context"] = context
        return VisionResult(kind="food", caption="ramen", labels=["ramen"])

    monkeypatch.setattr(analysis_mod, "analyze_image_content", fake_vision)
    await register(client)
    taken = datetime(2026, 8, 8, 13, 0)
    created = (
        await client.post(
            "/api/images",
            files=[("files", ("a.jpg", make_jpeg(*BKK, taken_at=taken), "image/jpeg"))],
        )
    ).json()
    async with db_sessionmaker() as db:
        await run_image_analysis(db, created[0]["id"])

    context = seen["context"]
    assert context.captured_at.replace(tzinfo=None) == taken
    assert context.captured_at_source == "exif"
    assert context.now is not None and context.now.tzinfo is UTC
    assert context.lat == pytest.approx(BKK[0], abs=1e-4)
    assert context.lng == pytest.approx(BKK[1], abs=1e-4)


async def test_a_place_already_known_at_those_coordinates_is_named(
    client, db_sessionmaker, monkeypatch
):
    """Free: it is the proximity cache, not a fresh lookup on every photo."""
    seen: dict[str, PhotoContext] = {}

    async def fake_vision(path, mime, context=None):
        seen["context"] = context
        return VisionResult(kind="receipt", caption="a receipt", labels=["receipt"])

    monkeypatch.setattr(analysis_mod, "analyze_image_content", fake_vision)
    await register(client)
    async with db_sessionmaker() as db:
        db.add(
            Place(
                google_place_id="ChIJ-kopi",
                name="Kopi 1930",
                formatted_address="1 St Andrew's Rd",
                lat=BKK[0],
                lng=BKK[1],
                types=["cafe"],
            )
        )
        await db.commit()
    created = (
        await client.post(
            "/api/images",
            files=[("files", ("a.jpg", make_jpeg(*BKK, color=(3, 3, 3)), "image/jpeg"))],
        )
    ).json()
    async with db_sessionmaker() as db:
        await run_image_analysis(db, created[0]["id"])

    assert seen["context"].place_name == "Kopi 1930"
    assert seen["context"].place_address == "1 St Andrew's Rd"


async def test_a_photo_that_cannot_be_read_is_still_logged(client, db_sessionmaker, monkeypatch):
    """Building the context must not become a way for analysis to fail."""

    async def explodes(path, mime, context=None):
        raise RuntimeError("the model fell over")

    monkeypatch.setattr(analysis_mod, "analyze_image_content", explodes)
    await register(client)
    created = (
        await client.post(
            "/api/images",
            files=[("files", ("a.jpg", make_jpeg(color=(2, 2, 2)), "image/jpeg"))],
        )
    ).json()
    async with db_sessionmaker() as db:
        await run_image_analysis(db, created[0]["id"])

    image = (await client.get(f"/api/images/{created[0]['id']}")).json()
    assert image["status"] == "analyzed"
