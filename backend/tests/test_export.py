"""Exporting a trip as one HTML page, and keeping it on disk until it changes."""

import json
import re
from datetime import UTC, datetime
from pathlib import Path

import pytest

from app.config import settings
from app.services.export import cache
from app.services.export.render import ExportOptions, fingerprint, render_page
from tests.conftest import register
from tests.util import make_jpeg

FRONTEND = Path(__file__).resolve().parents[2] / "frontend"


async def _expense(client, total: str, when: str, description: str = "") -> dict:
    response = await client.post(
        "/api/expenses",
        json={
            "total": total,
            "currency": "THB",
            "description": description,
            "spent_at": when,
        },
    )
    assert response.status_code == 201, response.text
    return response.json()


async def _photo(client, db_sessionmaker, when: datetime, lat=18.8049, lng=98.9217) -> dict:
    """A photo, analyzed — which is what puts it in a stop, and a stop is what
    the exported page has somewhere to draw."""
    from app.services.analysis import run_image_analysis

    created = (
        await client.post(
            "/api/images",
            files=[("files", ("a.jpg", make_jpeg(lat, lng, taken_at=when), "image/jpeg"))],
        )
    ).json()
    assert created, "upload rejected"
    async with db_sessionmaker() as db:
        await run_image_analysis(db, created[0]["id"])
    return created[0]


async def _trip(client, title: str = "Chiang Mai weekend") -> dict:
    start = await _expense(client, "150.00", "2026-09-12T09:00:00Z", "coffee")
    end = await _expense(client, "340.00", "2026-09-13T19:10:00Z", "khao soi")
    response = await client.post(
        "/api/trips",
        json={"title": title, "start_expense_id": start["id"], "end_expense_id": end["id"]},
    )
    assert response.status_code == 201, response.text
    return response.json()


async def _export(client, trip_id: int, **params):
    query = "&".join(f"{key}={value}" for key, value in params.items())
    return await client.get(f"/api/trips/{trip_id}/export.html?{query}")


async def test_a_trip_downloads_as_one_page_named_after_the_trip(client):
    await register(client)
    trip = await _trip(client)

    response = await _export(client, trip["id"])

    assert response.status_code == 200, response.text
    assert response.headers["content-type"].startswith("text/html")
    assert 'filename="chiang-mai-weekend-2026-09-12.html"' in (
        response.headers["content-disposition"]
    )
    page = response.text
    assert "<title>Chiang Mai weekend</title>" in page
    assert "khao soi" in page
    # The map ships as data, not as a picture of one
    assert "maplibregl.Map" in page
    # …and nothing in the page points back at an API nobody else can reach
    assert "/api/" not in page


async def test_the_same_trip_is_built_once_and_served_from_disk(client):
    """The point of the cache: a second export touches no photograph."""
    await register(client)
    trip = await _trip(client)

    first = await _export(client, trip["id"])
    exports = list((settings.media_root / "1" / "exports").iterdir())
    assert len(exports) == 1
    written_at = exports[0].stat().st_mtime_ns

    second = await _export(client, trip["id"])

    assert second.text == first.text
    assert exports[0].stat().st_mtime_ns == written_at, "the page was rebuilt"


async def test_a_changed_trip_replaces_the_page_it_had(client):
    await register(client)
    trip = await _trip(client)
    await _export(client, trip["id"])
    before = list((settings.media_root / "1" / "exports").iterdir())[0]

    renamed = await client.patch(f"/api/trips/{trip['id']}", json={"title": "Chiang Mai again"})
    assert renamed.status_code == 200, renamed.text
    response = await _export(client, trip["id"])

    after = list((settings.media_root / "1" / "exports").iterdir())
    assert len(after) == 1, "the stale page was left behind"
    assert after[0] != before
    assert "Chiang Mai again" in response.text
    # The download keeps naming the trip, so the reader's copy is replaced
    assert 'filename="chiang-mai-again-2026-09-12.html"' in (
        response.headers["content-disposition"]
    )


async def test_the_two_variants_are_cached_apart(client):
    await register(client)
    trip = await _trip(client)

    full = await _export(client, trip["id"])
    itinerary = await _export(client, trip["id"], spending="false")

    assert "khao soi" in full.text
    assert "khao soi" not in itinerary.text
    assert full.headers["x-trip-fingerprint"] != itinerary.headers["x-trip-fingerprint"]
    assert len(list((settings.media_root / "1" / "exports").iterdir())) == 2


async def test_photos_travel_inside_the_file(client, db_sessionmaker):
    await register(client)
    await _photo(client, db_sessionmaker, datetime(2026, 9, 12, 10, 15))
    trip = await _trip(client)
    response = await _export(client, trip["id"])

    assert "data:image/jpeg;base64," in response.text
    # And the id the bytes came from, which is what the fingerprint counts
    assert 'data-image-id="1"' in response.text

    without = await _export(client, trip["id"], photos="false")
    assert "data:image/jpeg;base64," not in without.text


async def test_a_deleted_trip_takes_its_pages_with_it(client):
    await register(client)
    trip = await _trip(client)
    await _export(client, trip["id"])
    exports = settings.media_root / "1" / "exports"
    assert list(exports.iterdir())

    await client.delete(f"/api/trips/{trip['id']}")

    assert not list(exports.iterdir())


async def test_one_user_cannot_export_another_user_s_trip(client):
    await register(client)
    trip = await _trip(client)
    await client.post("/api/auth/logout")
    await register(client, email="someone@else.com")

    assert (await _export(client, trip["id"])).status_code == 404


async def test_the_fingerprint_does_not_depend_on_the_photo_bytes(db):
    """What makes the cache lookup possible: the page's identity can be worked
    out before a single JPEG is re-encoded."""
    from app.schemas import TripDetailOut

    trip = TripDetailOut.model_validate(_DETAIL)
    options = ExportOptions()
    moment = datetime(2026, 9, 19, tzinfo=UTC)

    stub = render_page(trip, options, {1: "data:,"}, moment)
    real = render_page(trip, options, {1: "data:image/jpeg;base64,/9j/4AAQSkZJRg=="}, moment)
    missing = render_page(trip, options, {}, moment)

    assert stub.fingerprint == real.fingerprint
    assert missing.fingerprint != real.fingerprint, "a photo that is not there is a change"


async def test_the_stamp_is_not_taken_over_the_footer_that_carries_it(db):
    """Otherwise the export date beside it would move the version of a trip that
    has not moved, and every export would miss the cache."""
    from app.schemas import TripDetailOut

    trip = TripDetailOut.model_validate(_DETAIL)
    early = render_page(trip, ExportOptions(), {}, datetime(2026, 9, 19, tzinfo=UTC))
    late = render_page(trip, ExportOptions(), {}, datetime(2027, 1, 1, tzinfo=UTC))

    assert early.fingerprint == late.fingerprint
    assert early.html != late.html
    assert f'content="{early.fingerprint}"' in early.html
    assert f'<span class="stamp">{early.fingerprint}</span>' in early.html


def test_user_text_cannot_become_markup():
    trip_json = dict(_DETAIL, title="<script>alert(1)</script>")
    from app.schemas import TripDetailOut

    page = render_page(
        TripDetailOut.model_validate(trip_json),
        ExportOptions(),
        {},
        datetime(2026, 9, 19, tzinfo=UTC),
    ).html

    assert "<script>alert(1)</script>" not in page
    assert "&lt;script&gt;alert(1)&lt;/script&gt;" in page
    # The three that really end this page's scripts: the data block, the CDN
    # tag, and the page's own
    assert page.count("</script>") == 3


def test_a_stale_page_is_swept_rather_than_overwritten(tmp_path, monkeypatch):
    monkeypatch.setattr(settings, "media_root", tmp_path)
    full = "photos-spending"
    cache.store(1, 7, full, "aaaaaaaa", "<html>old</html>")
    cache.store(1, 7, full, "bbbbbbbb", "<html>new</html>")
    # Neither another variant of the same trip nor another trip is this one's
    # to sweep: both are current pages in their own right.
    cache.store(1, 7, "photos-nospending", "dddddddd", "<html>itinerary</html>")
    cache.store(1, 9, full, "cccccccc", "<html>another trip</html>")

    names = sorted(path.name for path in cache.export_dir(1).iterdir())

    assert names == [
        "7-photos-nospending-dddddddd.html",
        "7-photos-spending-bbbbbbbb.html",
        "9-photos-spending-cccccccc.html",
    ]


def test_the_fingerprint_is_eight_hex_characters():
    stamp = fingerprint("<p>anything</p>", "[]", ExportOptions())
    assert re.fullmatch(r"[0-9a-f]{8}", stamp)


@pytest.mark.skipif(not FRONTEND.is_dir(), reason="frontend sources are not in this tree")
def test_the_exported_map_matches_the_app_s_own():
    """The app draws the trip map in TypeScript and this draws it in Python. The
    two copies have no compiler between them, so they are compared here."""
    from app.services.export.basemap import DARK_BASEMAP_PAINT, DAY_HUES, OSM_STYLE

    basemap = (FRONTEND / "src/lib/basemap.ts").read_text()
    colors = (FRONTEND / "src/lib/dayColors.ts").read_text()

    assert OSM_STYLE["sources"]["osm"]["tiles"][0] in basemap
    for prop, value in DARK_BASEMAP_PAINT.items():
        assert f"'{prop}': {value}" in basemap, f"{prop} differs from the app's basemap"
    assert re.findall(r"#[0-9a-f]{6}", colors.split("];")[0]) == list(DAY_HUES)


@pytest.mark.skipif(not FRONTEND.is_dir(), reason="frontend sources are not in this tree")
def test_maplibre_is_pinned_to_the_version_the_app_uses():
    from app.services.export.render import MAPLIBRE_VERSION

    lock = json.loads((FRONTEND / "package-lock.json").read_text())
    assert MAPLIBRE_VERSION == lock["packages"]["node_modules/maplibre-gl"]["version"]


_DETAIL = {
    "id": 7,
    "title": "Chiang Mai weekend",
    "note": None,
    "start_expense_id": 1,
    "end_expense_id": 2,
    "started_at": "2026-09-12T09:00:00Z",
    "ended_at": "2026-09-13T19:10:00Z",
    "day_count": 2,
    "visit_count": 1,
    "image_count": 1,
    "spend": {
        "base_currency": "THB",
        "base_total_minor": 49000,
        "by_currency": [{"currency": "THB", "total_minor": 49000}],
        "unconfirmed_count": 0,
    },
    "expenses": [],
    "days": [
        {
            "date": "2026-09-12",
            "expenses": [],
            "spend": {
                "base_currency": "THB",
                "base_total_minor": 49000,
                "by_currency": [{"currency": "THB", "total_minor": 49000}],
                "unconfirmed_count": 0,
            },
            "visits": [
                {
                    "id": 1,
                    "label": "Wat Phra That Doi Suthep",
                    "place": None,
                    "started_at": "2026-09-12T10:15:00Z",
                    "ended_at": "2026-09-12T11:40:00Z",
                    "lat": 18.8049,
                    "lng": 98.9217,
                    "pinned": False,
                    "expenses": [],
                    "spend": {
                        "base_currency": "THB",
                        "base_total_minor": 49000,
                        "by_currency": [{"currency": "THB", "total_minor": 49000}],
                        "unconfirmed_count": 0,
                    },
                    "images": [
                        {
                            "id": 1,
                            "mime": "image/jpeg",
                            "taken_at": "2026-09-12T10:15:00Z",
                            "exif_taken_at": "2026-09-12T10:15:00Z",
                            "taken_at_source": "exif",
                            "lat": 18.8049,
                            "lng": 98.9217,
                            "status": "analyzed",
                            "error": None,
                            "uploaded_at": "2026-09-12T20:00:00Z",
                            "visit_id": 1,
                            "place": None,
                            "analysis": None,
                            "original_url": "/api/images/1/file",
                            "thumb_url": "/api/images/1/thumb",
                            "has_expense": False,
                        }
                    ],
                }
            ],
        }
    ],
}
