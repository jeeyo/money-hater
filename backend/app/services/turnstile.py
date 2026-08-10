"""Cloudflare Turnstile — the human check in front of sign-in and sign-up.

Off unless both keys are configured (see `Settings.turnstile_site_key`), so
development, the test suite and a self-hosted box with no Cloudflare account
all keep an ordinary login form.

Switched on, it fails closed: if Cloudflare cannot be reached the login is
refused rather than waved through, because a check that any outage disables is
not a check. The message says to try again, and the outage is logged.
"""

import logging

import httpx
from fastapi import HTTPException, status

from app.config import settings

log = logging.getLogger(__name__)


def turnstile_enabled() -> bool:
    return bool(settings.turnstile_secret_key)


async def verify_turnstile(token: str | None) -> None:
    """Raise unless `token` is a Turnstile response Cloudflare vouches for.

    The client's IP is deliberately not sent. Turnstile rejects the token when
    the `remoteip` it is given disagrees with the one that solved the
    challenge, and behind an ingress or a reverse proxy the address FastAPI
    sees is the proxy's — which would turn every login into a failure on the
    exact deployments this app is written for.
    """
    if not turnstile_enabled():
        return
    if not token:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Please complete the human check")

    try:
        async with httpx.AsyncClient(timeout=10) as client:
            response = await client.post(
                settings.turnstile_verify_url,
                data={"secret": settings.turnstile_secret_key, "response": token},
            )
            response.raise_for_status()
            payload = response.json()
    except (httpx.HTTPError, ValueError) as exc:
        log.warning("Turnstile verification unreachable: %s", exc)
        raise HTTPException(
            status.HTTP_503_SERVICE_UNAVAILABLE,
            "Could not reach the human check. Please try again.",
        ) from exc

    if not payload.get("success"):
        # Codes are Cloudflare's, and one of them ("timeout-or-duplicate")
        # simply means the widget's token went stale while the form sat open —
        # the frontend resets the widget so the next attempt has a fresh one.
        log.info("Turnstile rejected a token: %s", payload.get("error-codes"))
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST, "Human check failed. Please try again."
        )
