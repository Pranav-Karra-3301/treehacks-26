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
    DATA_ROOT = Path(os.getenv("KIRU_DATA_ROOT", os.getenv("NEGOTIATEAI_DATA_ROOT", "data")))
    SQLITE_PATH = DATA_ROOT / "calls.db"

    APP_HOST = os.getenv("HOST", "0.0.0.0")
    APP_PORT = int(os.getenv("PORT", "3001"))

    ALLOWED_ORIGINS = [
        origin.strip()
        for origin in os.getenv("ALLOWED_ORIGINS", "*").split(",")
        if origin.strip()
    ]

    # LLM provider selection
    # values: ollama (preferred) | openai | anthropic
    # "local" is accepted as a backward-compatible alias and normalized to ollama.
    LLM_PROVIDER = (os.getenv("LLM_PROVIDER", "openai") or "openai").strip().lower()
    if LLM_PROVIDER == "local":
        LLM_PROVIDER = "ollama"

    # Ollama / local OpenAI-compatible endpoint
    # OLLAMA_* are preferred; VLLM_* kept as fallbacks for backward compatibility.
    OLLAMA_BASE_URL = os.getenv("OLLAMA_BASE_URL", "").strip()
    OLLAMA_MODEL = os.getenv("OLLAMA_MODEL", "").strip()
    OLLAMA_KEEP_ALIVE = os.getenv("OLLAMA_KEEP_ALIVE", "30m").strip()

    # Legacy vLLM vars (used when OLLAMA_* not set)
    _VLLM_BASE_URL = os.getenv("VLLM_BASE_URL", "http://localhost:11434")
    _VLLM_MODEL = os.getenv("VLLM_MODEL", "qwen3:30b-a3b")
    _VLLM_API_KEY = os.getenv("VLLM_API_KEY", "")

    # Resolved local provider settings (OLLAMA_* wins over VLLM_*)
    VLLM_BASE_URL = OLLAMA_BASE_URL or _VLLM_BASE_URL
    VLLM_MODEL = OLLAMA_MODEL or _VLLM_MODEL
    VLLM_API_KEY = _VLLM_API_KEY

    # Optional auth key for the local LLM reverse proxy endpoint.
    LLM_PROXY_API_KEY = os.getenv("LLM_PROXY_API_KEY", "").strip()

    # OpenAI API
    OPENAI_BASE_URL = os.getenv("OPENAI_BASE_URL", "https://api.openai.com")
    OPENAI_MODEL = os.getenv("OPENAI_MODEL", "gpt-4o-mini")
    OPENAI_API_KEY = os.getenv("OPENAI_API_KEY", "")

    # Anthropic Claude API
    ANTHROPIC_BASE_URL = os.getenv("ANTHROPIC_BASE_URL", "https://api.anthropic.com")
    ANTHROPIC_MODEL = os.getenv("ANTHROPIC_MODEL", "claude-3-5-sonnet-20241022")
    ANTHROPIC_API_KEY = os.getenv("ANTHROPIC_API_KEY", "")
    # Budget must account for reasoning tokens in thinking models (e.g. Qwen3).
    # ~150 reasoning + ~150 content = 300 total is a safe default.
    LLM_MAX_TOKENS_VOICE = int(os.getenv("LLM_MAX_TOKENS_VOICE", "300"))
    LLM_MAX_TOKENS_ANALYSIS = int(os.getenv("LLM_MAX_TOKENS_ANALYSIS", "1024"))
    LLM_VOICE_CONTEXT_TURNS = int(os.getenv("LLM_VOICE_CONTEXT_TURNS", "10"))
    try:
        LLM_STREAM_TIMEOUT_SECONDS = float(os.getenv("LLM_STREAM_TIMEOUT_SECONDS", "30"))
    except ValueError:
        LLM_STREAM_TIMEOUT_SECONDS = 30.0

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
    DEEPGRAM_VOICE_AGENT_SPEAK_MODEL = os.getenv("DEEPGRAM_VOICE_AGENT_SPEAK_MODEL", "aura-2-arcas-en")
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

    # Logging controls
    LOG_LEVEL = (os.getenv("LOG_LEVEL", "INFO") or "INFO").upper()
    if LOG_LEVEL not in {"CRITICAL", "ERROR", "WARNING", "INFO", "DEBUG"}:
        LOG_LEVEL = "INFO"
    try:
        LOG_NOISY_EVENTS_EVERY_N = int(os.getenv("LOG_NOISY_EVENTS_EVERY_N", "120"))
    except ValueError:
        LOG_NOISY_EVENTS_EVERY_N = 120
    if LOG_NOISY_EVENTS_EVERY_N < 0:
        LOG_NOISY_EVENTS_EVERY_N = 0
    LOG_PRETTY = (
        (os.getenv("LOG_PRETTY", "true") or "true").strip().lower() not in {"0", "false", "no", "off"}
    )
    _log_color = (os.getenv("LOG_COLOR", "auto") or "auto").strip().lower()
    if _log_color in {"1", "true", "yes", "on", "always"}:
        LOG_COLOR = True
    elif _log_color in {"0", "false", "no", "off", "never"}:
        LOG_COLOR = False
    else:
        LOG_COLOR = None

    LOG_NOISY_ACTIONS = tuple(
        action.strip()
        for action in os.getenv(
            "LOG_NOISY_ACTIONS",
            "media_event,save_audio_chunk,media_mark_received",
        ).split(",")
        if action.strip()
    )
    if not LOG_NOISY_ACTIONS:
        LOG_NOISY_ACTIONS = ("media_event", "save_audio_chunk", "media_mark_received")

    LOG_SKIP_REQUEST_PATHS = tuple(
        path.strip()
        for path in os.getenv("LOG_SKIP_REQUEST_PATHS", "/health").split(",")
        if path.strip()
    )

    # Bright Data
    BRIGHTDATA_API_TOKEN = os.getenv("BRIGHTDATA_API_TOKEN", "").strip()
    BRIGHTDATA_ENABLED = bool(BRIGHTDATA_API_TOKEN)

    # Exa / web lookup
    EXA_SEARCH_ENABLED = (
        os.getenv("EXA_SEARCH_ENABLED", "false").strip().lower() == "true"
    )
    EXA_API_KEY = os.getenv("EXA_API_KEY", "")
    EXA_SEARCH_URL = os.getenv("EXA_SEARCH_URL", "https://api.exa.ai/search")
    EXA_SEARCH_RESULTS_LIMIT = int(os.getenv("EXA_SEARCH_RESULTS_LIMIT", "5"))
    EXA_SEARCH_TYPE = os.getenv("EXA_SEARCH_TYPE", "auto")

    # Perplexity Sonar
    PERPLEXITY_API_KEY = os.getenv("PERPLEXITY_API_KEY", "")
    PERPLEXITY_BASE_URL = os.getenv("PERPLEXITY_BASE_URL", "https://api.perplexity.ai")
    PERPLEXITY_MODEL = os.getenv("PERPLEXITY_MODEL", "sonar")
    PERPLEXITY_SEARCH_ENABLED = (
        os.getenv("PERPLEXITY_SEARCH_ENABLED", "false").strip().lower() == "true"
    )

    # Redis / caching
    UPSTASH_REDIS_URL = os.getenv("UPSTASH_REDIS_URL", "").strip()
    REDIS_URL = os.getenv("REDIS_URL", "").strip() or UPSTASH_REDIS_URL
    CACHE_ENABLED = os.getenv("CACHE_ENABLED", "false").strip().lower() == "true"
    CACHE_DEFAULT_TTL_SECONDS = int(os.getenv("CACHE_DEFAULT_TTL_SECONDS", "300"))
    CACHE_RESEARCH_TTL_SECONDS = int(os.getenv("CACHE_RESEARCH_TTL_SECONDS", "300"))
    CACHE_TASK_TTL_SECONDS = int(os.getenv("CACHE_TASK_TTL_SECONDS", "120"))
    CACHE_ANALYSIS_TTL_SECONDS = int(os.getenv("CACHE_ANALYSIS_TTL_SECONDS", "300"))
    CACHE_KEY_PREFIX = os.getenv("CACHE_KEY_PREFIX", "kiru")


settings = Settings()
