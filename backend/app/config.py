from pathlib import Path

from pydantic import field_validator, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    database_url: str = "postgresql+asyncpg://moneyhater:moneyhater@localhost:5432/moneyhater"
    queue_database_url: str = "postgresql://moneyhater:moneyhater@localhost:5432/moneyhater"

    @field_validator("database_url")
    @classmethod
    def _force_asyncpg(cls, value: str) -> str:
        # CloudNativePG secrets provide plain postgresql:// URIs; SQLAlchemy
        # needs the asyncpg driver spelled out
        if value.startswith("postgresql://"):
            return value.replace("postgresql://", "postgresql+asyncpg://", 1)
        return value

    @field_validator("queue_database_url")
    @classmethod
    def _strip_driver(cls, value: str) -> str:
        # Procrastinate connects with psycopg and wants a plain URI
        return value.replace("postgresql+asyncpg://", "postgresql://", 1)

    jwt_secret: str = "insecure-dev-secret-change-me-in-production"
    access_token_ttl_seconds: int = 3600
    refresh_token_ttl_days: int = 30
    cookie_secure: bool = False
    # A refresh rotates the token, so the one the browser just replaced is
    # dead. Two tabs (or a tab and the service worker) waking together both
    # present it, and the loser would be signed out through no fault of its
    # own. Honour a just-rotated token for this long instead.
    refresh_rotation_grace_seconds: int = 30

    # Cloudflare Turnstile on the sign-in and sign-up forms. Both blank — the
    # default — turns it off: the devcontainer, the tests and a box on your own
    # LAN have no Cloudflare account, and a login form that cannot be submitted
    # without one is not a sensible default. Set both to switch it on.
    turnstile_site_key: str = ""
    turnstile_secret_key: str = ""
    turnstile_verify_url: str = "https://challenges.cloudflare.com/turnstile/v0/siteverify"

    @model_validator(mode="after")
    def _turnstile_needs_both_keys(self):
        # Half-configured fails in a way nobody enjoys debugging: with only the
        # secret every login is rejected because no widget ever rendered, and
        # with only the site key the challenge is decorative. Refuse to start.
        if bool(self.turnstile_site_key) != bool(self.turnstile_secret_key):
            missing = "TURNSTILE_SECRET_KEY" if self.turnstile_site_key else "TURNSTILE_SITE_KEY"
            raise ValueError(f"Turnstile needs both keys or neither — {missing} is missing")
        return self

    media_root: Path = Path("./data/media")

    # An OpenAI model that can see images (photo analysis) and use the hosted
    # web search tool (next-stop recommendations).
    llm_model: str = "gpt-4.1-mini"
    # Optional. Left blank, the SDK reads OPENAI_API_KEY from the environment.
    llm_api_key: str = ""
    # How long one photo's model call may take before the pipeline gives up on
    # it and logs the photo without a caption. The SDK's own default is ten
    # minutes and it retries on top of that, which is long enough that a photo
    # looks stuck rather than slow.
    vision_timeout_seconds: int = 120

    google_maps_api_key: str = ""

    daily_analysis_cap: int = 200
    max_upload_bytes: int = 25 * 1024 * 1024

    # Next-stop recommendations: how long a set stays fresh before the panel
    # offers to generate again. Arriving somewhere new invalidates it anyway.
    recommendation_ttl_minutes: int = 90
    # Cost guard, like daily_analysis_cap; 0 = unlimited
    daily_recommendation_cap: int = 50

    # ECB reference rates via Frankfurter; no API key. Blank disables FX lookup
    # (foreign expenses then wait for a manually entered rate).
    exchange_rate_api_url: str = "https://api.frankfurter.dev/v1/latest"

    # Visit clustering thresholds (trips are made by hand, never inferred)
    visit_max_gap_minutes: int = 45
    visit_max_distance_m: int = 300


settings = Settings()
