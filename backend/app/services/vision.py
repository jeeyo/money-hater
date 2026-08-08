"""Image understanding via the OpenAI Agents SDK, routed through LiteLLM.

One agent run per image returns a structured VisionResult: what the photo shows
(place / food / item / receipt / ...), a caption, labels, and — for receipts —
merchant, currency, totals, and line items.

The model is named `provider/model` (LLM_MODEL), so switching from OpenAI to
Anthropic, Gemini, a self-hosted vLLM or a local Ollama is a config change, not
a code change. With no provider configured the step is skipped entirely and
images are logged by time and location only.
"""

import base64
import logging
import os
from datetime import UTC, datetime
from pathlib import Path
from typing import Literal

from pydantic import BaseModel, Field

from app.config import settings

log = logging.getLogger(__name__)

ImageKind = Literal["place", "food", "item", "receipt", "document", "other"]


class ReceiptItem(BaseModel):
    name: str
    qty: float = 1.0
    unit_price: float | None = None
    amount: float


class ReceiptData(BaseModel):
    merchant: str | None = None
    datetime_iso: str | None = Field(
        default=None,
        description="Purchase date/time printed on the receipt, ISO 8601, if legible",
    )
    currency: str | None = Field(
        default=None,
        description="ISO 4217 code of the printed amounts, e.g. THB, JPY, USD",
    )
    total: float | None = None
    tax: float | None = None
    tip: float | None = None
    items: list[ReceiptItem] = []


class VisionResult(BaseModel):
    kind: ImageKind
    caption: str = Field(description="One short sentence describing the photo")
    labels: list[str] = Field(description="3-8 lowercase tags, e.g. ramen, restaurant, night")
    place_hint: str | None = Field(
        default=None,
        description="Venue name if visible in the photo (sign, menu, storefront)",
    )
    receipt: ReceiptData | None = Field(
        default=None, description="Only when kind == 'receipt': the parsed receipt"
    )


INSTRUCTIONS = """You analyze a single photo from someone's personal trip log.

Classify what it mainly shows:
- place: scenery, buildings, streets, interiors, landmarks
- food: dishes, drinks, meals
- item: a product or object (souvenir, purchase, gadget)
- receipt: a purchase receipt, bill, or invoice
- document: tickets, boarding passes, menus, signs photographed for reference
- other: anything else (people, pets, screenshots, ...)

Always produce a short caption and a few lowercase labels.
If a venue or shop name is readable in the image, set place_hint.
If it is a receipt, extract merchant, currency (ISO 4217), totals, and line
items exactly as printed; use the receipt's own numbers, do not invent values."""


def parse_receipt_datetime(value: str | None) -> datetime | None:
    if not value:
        return None
    try:
        parsed = datetime.fromisoformat(value)
    except ValueError:
        return None
    return parsed if parsed.tzinfo else parsed.replace(tzinfo=UTC)


# The env var each provider reads when no explicit key is configured. Used only
# to decide whether analysis is worth attempting — LiteLLM does the real lookup.
PROVIDER_ENV_KEYS = {
    "openai": "OPENAI_API_KEY",
    "anthropic": "ANTHROPIC_API_KEY",
    "gemini": "GEMINI_API_KEY",
    "vertex_ai": "GOOGLE_APPLICATION_CREDENTIALS",
    "azure": "AZURE_API_KEY",
    "bedrock": "AWS_ACCESS_KEY_ID",
    "groq": "GROQ_API_KEY",
    "mistral": "MISTRAL_API_KEY",
    "openrouter": "OPENROUTER_API_KEY",
    "together_ai": "TOGETHER_API_KEY",
    "deepseek": "DEEPSEEK_API_KEY",
    "xai": "XAI_API_KEY",
}

# Providers that run on your own machine and need no credential
LOCAL_PROVIDERS = {"ollama", "ollama_chat", "lm_studio", "hosted_vllm", "openai_like"}


def model_provider() -> str:
    """The provider half of `provider/model`; bare names mean OpenAI."""
    return settings.llm_model.split("/", 1)[0] if "/" in settings.llm_model else "openai"


def vision_enabled() -> bool:
    """Whether a model is reachable — an explicit key, a base URL, a local
    provider, or the provider's own env var being present."""
    if settings.llm_api_key or settings.llm_api_base:
        return True
    provider = model_provider()
    if provider in LOCAL_PROVIDERS:
        return True
    env_key = PROVIDER_ENV_KEYS.get(provider)
    return bool(env_key and os.environ.get(env_key))


async def analyze_image_content(image_path: Path, mime: str) -> VisionResult | None:
    if not vision_enabled():
        return None
    # Imported lazily so the app runs without a provider (and tests never touch it)
    from agents import Agent, Runner, set_tracing_disabled
    from agents.extensions.models.litellm_model import LitellmModel

    # The SDK exports traces to OpenAI by default. On a self-hosted logger that
    # is a surprise, and with another provider behind LiteLLM it would ship your
    # photos' metadata to a vendor you are not even using.
    set_tracing_disabled(True)

    data_url = f"data:{mime};base64,{base64.b64encode(image_path.read_bytes()).decode()}"
    agent = Agent(
        name="image-analyst",
        instructions=INSTRUCTIONS,
        model=LitellmModel(
            model=settings.llm_model,
            api_key=settings.llm_api_key or None,
            base_url=settings.llm_api_base or None,
        ),
        output_type=VisionResult,
    )
    result = await Runner.run(
        agent,
        input=[
            {
                "role": "user",
                "content": [
                    {"type": "input_image", "image_url": data_url},
                    {"type": "input_text", "text": "Analyze this photo."},
                ],
            }
        ],
    )
    return result.final_output
