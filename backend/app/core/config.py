from __future__ import annotations

import os
from pathlib import Path


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

    # LLM / vLLM
    VLLM_BASE_URL = os.getenv("VLLM_BASE_URL", "http://localhost:8000")
    VLLM_MODEL = os.getenv("VLLM_MODEL", "Qwen/Qwen3-30B-A3B-Instruct-2507")

    # Deepgram / STT / TTS
    DEEPGRAM_API_KEY = os.getenv("DEEPGRAM_API_KEY", "")

    # Twilio integration
    TWILIO_ACCOUNT_SID = os.getenv("TWILIO_ACCOUNT_SID", "")
    TWILIO_AUTH_TOKEN = os.getenv("TWILIO_AUTH_TOKEN", "")
    TWILIO_PHONE_NUMBER = os.getenv("TWILIO_PHONE_NUMBER", "")
    TWILIO_WEBHOOK_HOST = os.getenv("TWILIO_WEBHOOK_HOST", "")


settings = Settings()
