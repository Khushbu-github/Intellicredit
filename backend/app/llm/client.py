"""
Anthropic client wiring.

The whole LLM layer is optional. If ANTHROPIC_API_KEY is unset, every helper
in this package returns None and the caller falls back to the deterministic
path, so the application is fully functional with no model access at all.
That property is deliberate: an appraisal engine that silently stops working
when a third-party API is down is not one a bank could use.

Errors are swallowed and logged rather than raised. A failed extraction must
degrade to "the regex found nothing", never to a 500 on the upload endpoint.
"""

from __future__ import annotations

import json
import logging
from functools import lru_cache

from pydantic import BaseModel

from app.config import settings

logger = logging.getLogger(__name__)


@lru_cache
def get_client():
    """Construct the Anthropic client once per process, or None if disabled."""
    if not settings.llm_enabled:
        return None
    try:
        import anthropic
    except ImportError:  # pragma: no cover - the package is in requirements
        logger.warning("anthropic package not installed; LLM features disabled.")
        return None

    return anthropic.Anthropic(
        api_key=settings.ANTHROPIC_API_KEY,
        timeout=settings.LLM_TIMEOUT_SECONDS,
        max_retries=2,
    )


def is_enabled() -> bool:
    return get_client() is not None


def parse_structured[T: BaseModel](
    *,
    system: str,
    user_content: str,
    schema: type[T],
    effort: str | None = None,
    cache_system: bool = False,
) -> T | None:
    """
    Ask Claude for a response that validates against a Pydantic schema.

    Uses messages.parse(), which constrains generation to the schema, so the
    result cannot come back as prose that then fails json.loads(). Returns
    None on any failure - the caller always has a deterministic fallback.
    """
    client = get_client()
    if client is None:
        return None

    system_block = (
        [{"type": "text", "text": system, "cache_control": {"type": "ephemeral"}}]
        if cache_system
        else system
    )

    try:
        response = client.messages.parse(
            model=settings.LLM_MODEL,
            max_tokens=settings.LLM_MAX_TOKENS,
            output_config={"effort": effort or settings.LLM_EFFORT_MECHANICAL},
            system=system_block,
            messages=[{"role": "user", "content": user_content}],
            output_format=schema,
        )
    except Exception as exc:  # noqa: BLE001 - never fail the request on the model
        logger.warning("LLM structured call failed (%s): %s", schema.__name__, exc)
        return None

    if getattr(response, "stop_reason", None) == "refusal":
        logger.warning("LLM declined the request for %s.", schema.__name__)
        return None

    return response.parsed_output


def complete_text(
    *,
    system: str,
    user_content: str,
    effort: str | None = None,
    max_tokens: int | None = None,
) -> str | None:
    """Free-text completion, for the analyst chat. None on any failure."""
    client = get_client()
    if client is None:
        return None

    try:
        response = client.messages.create(
            model=settings.LLM_MODEL,
            max_tokens=max_tokens or settings.LLM_MAX_TOKENS,
            output_config={"effort": effort or settings.LLM_EFFORT_ANALYTICAL},
            system=system,
            messages=[{"role": "user", "content": user_content}],
        )
    except Exception as exc:  # noqa: BLE001
        logger.warning("LLM text call failed: %s", exc)
        return None

    if getattr(response, "stop_reason", None) == "refusal":
        return None

    return "".join(block.text for block in response.content if block.type == "text").strip()


def compact_json(payload: dict, limit: int = 20000) -> str:
    """
    Serialise a case payload for a prompt, deterministically and bounded.

    sort_keys is not cosmetic: an unsorted dump reorders between runs, which
    would invalidate the prompt cache on every request.
    """
    text = json.dumps(payload, sort_keys=True, default=str, indent=None)
    if len(text) > limit:
        text = text[:limit] + '... [truncated]"'
    return text
