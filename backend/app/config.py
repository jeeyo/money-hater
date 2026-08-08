from pathlib import Path

from pydantic import field_validator
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

    media_root: Path = Path("./data/media")

    # Image understanding goes through LiteLLM, so any provider it supports
    # works: "openai/gpt-4.1-mini", "anthropic/claude-sonnet-4-5",
    # "gemini/gemini-2.5-flash", "ollama/llava", ...
    llm_model: str = "openai/gpt-4.1-mini"
    # Optional. Left blank, LiteLLM reads the provider's own env var
    # (OPENAI_API_KEY, ANTHROPIC_API_KEY, GEMINI_API_KEY, …).
    llm_api_key: str = ""
    # Optional. A LiteLLM proxy, an Ollama host, or any OpenAI-compatible server.
    llm_api_base: str = ""

    google_maps_api_key: str = ""

    daily_analysis_cap: int = 200
    max_upload_bytes: int = 25 * 1024 * 1024

    # ECB reference rates via Frankfurter; no API key. Blank disables FX lookup
    # (foreign expenses then wait for a manually entered rate).
    exchange_rate_api_url: str = "https://api.frankfurter.dev/v1/latest"

    # Visit clustering thresholds (trips are made by hand, never inferred)
    visit_max_gap_minutes: int = 45
    visit_max_distance_m: int = 300


settings = Settings()
