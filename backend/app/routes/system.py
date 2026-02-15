from __future__ import annotations

from urllib.parse import urlparse

from fastapi import APIRouter

from app.core.config import settings
from app.services.cache import CacheService
from app.core.telemetry import timed_step


def get_routes(cache: CacheService | None = None):
    router = APIRouter(prefix="/api/system", tags=["system"])
    local_cache = cache

    @router.get("/voice-readiness")
    async def voice_readiness():
        with timed_step("system", "voice_readiness"):
            configured_think_provider = (
                settings.DEEPGRAM_VOICE_AGENT_THINK_PROVIDER.lower()
                if settings.DEEPGRAM_VOICE_AGENT_THINK_PROVIDER
                else settings.LLM_PROVIDER
            )
            effective_think_provider = "openai"
            effective_think_model = settings.DEEPGRAM_VOICE_AGENT_THINK_MODEL or settings.OPENAI_MODEL
            webhook_raw = (settings.TWILIO_WEBHOOK_HOST or "").strip()
            webhook_normalized = webhook_raw if "://" in webhook_raw else (f"https://{webhook_raw}" if webhook_raw else "")
            parsed_webhook = urlparse(webhook_normalized) if webhook_normalized else None
            webhook_scheme = (parsed_webhook.scheme if parsed_webhook else "").lower()
            webhook_host = (parsed_webhook.hostname if parsed_webhook else "").lower()

            twilio_webhook_public = bool(
                webhook_normalized
                and webhook_scheme == "https"
                and webhook_host
                and webhook_host not in {"localhost", "127.0.0.1", "0.0.0.0"}
                and not webhook_host.endswith(".local")
            )
            twilio_webhook_reason = None
            if not webhook_normalized:
                twilio_webhook_reason = "TWILIO_WEBHOOK_HOST is missing."
            elif webhook_scheme != "https":
                twilio_webhook_reason = (
                    "TWILIO_WEBHOOK_HOST must use https for Twilio callbacks."
                )
            elif webhook_host in {"localhost", "127.0.0.1", "0.0.0.0"} or webhook_host.endswith(".local"):
                twilio_webhook_reason = (
                    "TWILIO_WEBHOOK_HOST must be publicly reachable (not localhost). "
                    "Use ./scripts/dev-up.sh --ngrok."
                )

            has_twilio = bool(
                settings.TWILIO_ACCOUNT_SID
                and settings.TWILIO_AUTH_TOKEN
                and settings.TWILIO_PHONE_NUMBER
                and settings.TWILIO_WEBHOOK_HOST
            )
            has_deepgram = bool(settings.DEEPGRAM_API_KEY)
            if settings.LLM_PROVIDER == "openai":
                llm_ready = bool(settings.OPENAI_API_KEY)
            elif settings.LLM_PROVIDER == "groq":
                llm_ready = bool(settings.GROQ_API_KEY)
            elif settings.LLM_PROVIDER == "anthropic":
                llm_ready = bool(settings.ANTHROPIC_API_KEY)
            elif settings.LLM_PROVIDER in ("local", "ollama"):
                llm_ready = bool(settings.VLLM_BASE_URL and settings.VLLM_MODEL)
            else:
                llm_ready = False
            cache_enabled = bool(local_cache and local_cache.enabled)
            cache_ready = False
            if cache_enabled:
                cache_ready = await local_cache.ping()  # type: ignore[union-attr]

            return {
                "twilio_configured": has_twilio,
                "twilio_webhook_public": twilio_webhook_public,
                "twilio_webhook_reason": twilio_webhook_reason,
                "deepgram_configured": has_deepgram,
                "llm_ready": llm_ready,
                "llm_provider": settings.LLM_PROVIDER,
                "voice_think_provider_configured": configured_think_provider,
                "voice_think_provider_effective": effective_think_provider,
                "voice_think_model_effective": effective_think_model,
                "deepgram_voice_agent_enabled": settings.DEEPGRAM_VOICE_AGENT_ENABLED,
                "exa_search_enabled": bool(settings.EXA_SEARCH_ENABLED and settings.EXA_API_KEY),
                "cache_enabled": cache_enabled,
                "cache_ready": cache_ready,
                "can_dial_live": bool(
                    has_twilio
                    and twilio_webhook_public
                    and has_deepgram
                    and llm_ready
                    and settings.DEEPGRAM_VOICE_AGENT_ENABLED
                ),
            }

    return router
