"""What the log says when Google refuses.

A place lookup that fails is invisible from the outside: the photo still ends
'analyzed', just with no place on it. The worker log is the only place the
reason can appear, so it has to carry one. `raise_for_status()` alone does not
— it stringifies to the status and the URL, while the actual cause (the Places
API (New) not enabled on the project, a browser-restricted key used from a
server, billing off) sits in the response body it drops.
"""

import httpx
import pytest

import app.services.places as places_mod
from app.config import settings

DENIED = {
    "error": {
        "code": 403,
        "status": "PERMISSION_DENIED",
        "message": "Places API (New) has not been used in project 1234 before or it is disabled.",
    }
}


class _FailingClient:
    """An httpx.AsyncClient stand-in that answers every call the same way."""

    response: httpx.Response | None = None
    raises: Exception | None = None

    def __init__(self, *args, **kwargs):
        pass

    async def __aenter__(self):
        return self

    async def __aexit__(self, *args):
        return False

    async def post(self, url, **kwargs):
        if type(self).raises is not None:
            raise type(self).raises
        return httpx.Response(
            403, json=DENIED, request=httpx.Request("POST", url)
        )


@pytest.fixture
def google_refuses(monkeypatch):
    monkeypatch.setattr(settings, "google_maps_api_key", "AIza-looks-fine")
    monkeypatch.setattr(places_mod.httpx, "AsyncClient", _FailingClient)
    _FailingClient.raises = None
    yield _FailingClient


async def test_a_refused_lookup_logs_googles_reason(db, google_refuses, caplog):
    with caplog.at_level("WARNING", logger="app.services.places"):
        assert await places_mod.resolve_place(db, 13.7563, 100.5018) is None

    logged = caplog.text
    assert "403" in logged
    assert "PERMISSION_DENIED" in logged, "the reason, not just the status"
    assert "has not been used in project" in logged


async def test_a_refused_text_search_logs_it_too(db, google_refuses, caplog):
    with caplog.at_level("WARNING", logger="app.services.places"):
        assert await places_mod.search_place_by_text(db, "somewhere new") is None

    assert "PERMISSION_DENIED" in caplog.text


async def test_a_transport_failure_still_says_something(db, google_refuses, caplog):
    """No response to quote — the exception is the whole story, so log that."""
    _FailingClient.raises = httpx.ConnectError("[Errno 111] Connection refused")

    with caplog.at_level("WARNING", logger="app.services.places"):
        assert await places_mod.resolve_place(db, 13.7563, 100.5018) is None

    assert "Connection refused" in caplog.text
