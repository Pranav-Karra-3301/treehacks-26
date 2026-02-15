from __future__ import annotations

from app.core.config import settings
from app.services.deepgram_voice_agent import _build_think_payload
from app.services.llm_client import LLMClient


def test_llm_client_groq_uses_openai_compatible_provider(monkeypatch) -> None:
    captured: dict[str, object] = {}

    class _SpyOpenAICompatibleProvider:
        def __init__(
            self,
            base_url: str,
            api_key: str,
            model: str,
            **kwargs: object,
        ) -> None:
            captured["base_url"] = base_url
            captured["api_key"] = api_key
            captured["model"] = model
            captured["provider_tag"] = kwargs.get("provider_tag")

        async def stream_completion(self, messages, max_tokens=200):  # noqa: ARG002, ARG001
            if False:
                yield ""  # pragma: no cover - interface requirement only

        async def aclose(self) -> None:
            return None

    monkeypatch.setattr(settings, "LLM_PROVIDER", "groq")
    monkeypatch.setattr(settings, "GROQ_BASE_URL", "https://api.groq.test/openai/v1")
    monkeypatch.setattr(settings, "GROQ_MODEL", "gpt-oss-120b")
    monkeypatch.setattr(settings, "GROQ_API_KEY", "groq-test-key")
    monkeypatch.setattr("app.services.llm_client.OpenAICompatibleProvider", _SpyOpenAICompatibleProvider)

    client = LLMClient()

    assert captured["base_url"] == "https://api.groq.test/openai/v1"
    assert captured["api_key"] == "groq-test-key"
    assert captured["model"] == "gpt-oss-120b"
    assert captured["provider_tag"] == "groq"


def test_deepgram_think_payload_supports_groq_provider(monkeypatch) -> None:
    monkeypatch.setattr(settings, "DEEPGRAM_VOICE_AGENT_THINK_PROVIDER", "groq")
    monkeypatch.setattr(settings, "LLM_PROVIDER", "groq")
    monkeypatch.setattr(settings, "DEEPGRAM_VOICE_AGENT_THINK_MODEL", "gpt-oss-120b")
    monkeypatch.setattr(settings, "GROQ_BASE_URL", "https://api.groq.test/openai/v1")
    monkeypatch.setattr(settings, "GROQ_API_KEY", "groq-test-key")

    payload = _build_think_payload({"objective": "reduce bill"}, endpoint_url="")

    assert payload["provider"]["type"] == "open_ai"
    assert payload["provider"]["model"] == "gpt-oss-120b"
    assert payload["endpoint"]["url"] == "https://api.groq.test/openai/v1/chat/completions"
    assert payload["endpoint"]["headers"]["Authorization"] == "Bearer groq-test-key"
