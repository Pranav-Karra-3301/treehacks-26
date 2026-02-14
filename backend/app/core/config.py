from __future__ import annotations

import os
from pathlib import Path

from dotenv import load_dotenv


_ENV_PATH = Path(__file__).resolve().parents[2] / ".env"
if _ENV_PATH.exists():
    load_dotenv(dotenv_path=_ENV_PATH)
else:  # fallback when launched from inside backend/
    load_dotenv()


class Settings:
    DATA_ROOT = Path(os.getenv("NEGOTIATEAI_DATA_ROOT", "data"))
    SQLITE_PATH = DATA_ROOT / "calls.db"

    APP_HOST = os.getenv("HOST", "0.0.0.0")
    APP_PORT = int(os.getenv("PORT", "3001"))

    ALLOWED_ORIGINS = [
        origin.strip()
        for origin in os.getenv("ALLOWED_ORIGINS", "*").split(",")
        if origin.strip()
    ]

    # LLM provider selection
    # values: local | openai | anthropic
    LLM_PROVIDER = os.getenv("LLM_PROVIDER", "openai")

    # vLLM (local DGX stack)
    VLLM_BASE_URL = os.getenv("VLLM_BASE_URL", "http://localhost:8000")
    VLLM_MODEL = os.getenv("VLLM_MODEL", "Qwen/Qwen3-30B-A3B-Instruct-2507")
    VLLM_API_KEY = os.getenv("VLLM_API_KEY", "")

    # OpenAI API
    OPENAI_BASE_URL = os.getenv("OPENAI_BASE_URL", "https://api.openai.com")
    OPENAI_MODEL = os.getenv("OPENAI_MODEL", "gpt-4o-mini")
    OPENAI_API_KEY = os.getenv("OPENAI_API_KEY", "")

    # Anthropic Claude API
    ANTHROPIC_BASE_URL = os.getenv("ANTHROPIC_BASE_URL", "https://api.anthropic.com")
    ANTHROPIC_MODEL = os.getenv("ANTHROPIC_MODEL", "claude-3-5-sonnet-20241022")
    ANTHROPIC_API_KEY = os.getenv("ANTHROPIC_API_KEY", "")

    # Deepgram / STT / TTS
    DEEPGRAM_API_KEY = os.getenv("DEEPGRAM_API_KEY", "")
    DEEPGRAM_VOICE_AGENT_ENABLED = (
        os.getenv("DEEPGRAM_VOICE_AGENT_ENABLED", "false").strip().lower() == "true"
    )
    DEEPGRAM_VOICE_AGENT_WS_URL = os.getenv(
        "DEEPGRAM_VOICE_AGENT_WS_URL",
        "wss://agent.deepgram.com/v1/agent/converse",
    )
    DEEPGRAM_VOICE_AGENT_LISTEN_MODEL = os.getenv("DEEPGRAM_VOICE_AGENT_LISTEN_MODEL", "nova-3")
    DEEPGRAM_VOICE_AGENT_SPEAK_MODEL = os.getenv("DEEPGRAM_VOICE_AGENT_SPEAK_MODEL", "aura-2-thalia-en")
    DEEPGRAM_VOICE_AGENT_THINK_PROVIDER = os.getenv("DEEPGRAM_VOICE_AGENT_THINK_PROVIDER", "").strip()
    DEEPGRAM_VOICE_AGENT_THINK_MODEL = os.getenv("DEEPGRAM_VOICE_AGENT_THINK_MODEL", "").strip()
    DEEPGRAM_VOICE_AGENT_THINK_TEMPERATURE = float(
        os.getenv("DEEPGRAM_VOICE_AGENT_THINK_TEMPERATURE", "0.7")
    )
    DEEPGRAM_VOICE_AGENT_THINK_ENDPOINT_URL = os.getenv(
        "DEEPGRAM_VOICE_AGENT_THINK_ENDPOINT_URL", ""
    ).strip()
    DEEPGRAM_VOICE_AGENT_THINK_ENDPOINT_HEADERS = os.getenv(
        "DEEPGRAM_VOICE_AGENT_THINK_ENDPOINT_HEADERS", "{}"
    ).strip()

    # Twilio integration
    TWILIO_ACCOUNT_SID = os.getenv("TWILIO_ACCOUNT_SID", "")
    TWILIO_AUTH_TOKEN = os.getenv("TWILIO_AUTH_TOKEN", "")
    TWILIO_PHONE_NUMBER = os.getenv("TWILIO_PHONE_NUMBER", "")
    TWILIO_WEBHOOK_HOST = os.getenv("TWILIO_WEBHOOK_HOST", "")

    # Exa / web lookup
    EXA_SEARCH_ENABLED = (
        os.getenv("EXA_SEARCH_ENABLED", "false").strip().lower() == "true"
    )
    EXA_API_KEY = os.getenv("EXA_API_KEY", "")
    EXA_SEARCH_URL = os.getenv("EXA_SEARCH_URL", "https://api.exa.ai/search")
    EXA_SEARCH_RESULTS_LIMIT = int(os.getenv("EXA_SEARCH_RESULTS_LIMIT", "5"))


settings = Settings()
