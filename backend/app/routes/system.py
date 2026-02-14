from __future__ import annotations

from fastapi import APIRouter

from app.core.config import settings
from app.core.telemetry import timed_step


def get_routes():
    router = APIRouter(prefix="/api/system", tags=["system"])

    @router.get("/voice-readiness")
    async def voice_readiness():
        with timed_step("system", "voice_readiness"):
            has_twilio = bool(
                settings.TWILIO_ACCOUNT_SID
                and settings.TWILIO_AUTH_TOKEN
                and settings.TWILIO_PHONE_NUMBER
                and settings.TWILIO_WEBHOOK_HOST
            )
            has_deepgram = bool(settings.DEEPGRAM_API_KEY)
            if settings.LLM_PROVIDER == "openai":
                llm_ready = bool(settings.OPENAI_API_KEY)
            elif settings.LLM_PROVIDER == "anthropic":
                llm_ready = bool(settings.ANTHROPIC_API_KEY)
            elif settings.LLM_PROVIDER == "local":
                llm_ready = bool(settings.VLLM_BASE_URL and settings.VLLM_MODEL)
            else:
                llm_ready = False

            return {
                "twilio_configured": has_twilio,
                "deepgram_configured": has_deepgram,
                "llm_ready": llm_ready,
                "llm_provider": settings.LLM_PROVIDER,
                "deepgram_voice_agent_enabled": settings.DEEPGRAM_VOICE_AGENT_ENABLED,
                "exa_search_enabled": bool(settings.EXA_SEARCH_ENABLED and settings.EXA_API_KEY),
                "can_dial_live": bool(
                    has_twilio and has_deepgram and llm_ready and settings.DEEPGRAM_VOICE_AGENT_ENABLED
                ),
            }

    return router
