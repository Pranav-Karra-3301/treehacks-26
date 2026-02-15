from __future__ import annotations

import json

import pytest

from app.core.config import settings

pytestmark = pytest.mark.unit
from app.main import app


def test_voice_readiness_endpoint(monkeypatch, client) -> None:
    monkeypatch.setattr(settings, "TWILIO_ACCOUNT_SID", "AC123")
    monkeypatch.setattr(settings, "TWILIO_AUTH_TOKEN", "token")
    monkeypatch.setattr(settings, "TWILIO_PHONE_NUMBER", "+15550000001")
    monkeypatch.setattr(settings, "TWILIO_WEBHOOK_HOST", "https://webhooks.example")
    monkeypatch.setattr(settings, "DEEPGRAM_API_KEY", "deepgram")
    monkeypatch.setattr(settings, "LLM_PROVIDER", "openai")
    monkeypatch.setattr(settings, "OPENAI_API_KEY", "sk-test")
    monkeypatch.setattr(settings, "DEEPGRAM_VOICE_AGENT_ENABLED", True)
    monkeypatch.setattr(settings, "EXA_SEARCH_ENABLED", True)
    monkeypatch.setattr(settings, "EXA_API_KEY", "exa-test")

    response = client.get("/api/system/voice-readiness")

    assert response.status_code == 200
    body = response.json()
    assert body["twilio_configured"] is True
    assert body["deepgram_configured"] is True
    assert body["llm_ready"] is True
    assert body["can_dial_live"] is True
    assert body["exa_search_enabled"] is True


def test_research_route_disabled(monkeypatch, client) -> None:
    monkeypatch.setattr(settings, "EXA_SEARCH_ENABLED", False)
    monkeypatch.setattr(settings, "EXA_API_KEY", "")

    response = client.post("/api/research", json={"query": "airport lounge"})

    assert response.status_code == 200
    body = response.json()
    assert body["enabled"] is False
    assert body["ok"] is False
    assert body["reason"] == "exasearch_disabled_or_missing_api_key"


def test_research_route_uses_service_result(monkeypatch, client) -> None:
    async def _mock_search(self, _query, limit=None):  # noqa: ARG001
        return {
            "enabled": True,
            "query": "restaurant nyc",
            "count": 1,
            "results": [
                {
                    "title": "Hotel Research",
                    "url": "https://example.test/hotel",
                    "snippet": "front desk open 24/7",
                    "published": "2024-01-02T00:00:00Z",
                    "score": 0.88,
                }
            ],
        }

    monkeypatch.setattr(settings, "EXA_SEARCH_ENABLED", True)
    monkeypatch.setattr(settings, "EXA_API_KEY", "exa-test")
    monkeypatch.setattr("app.routes.research.ExaSearchService.search", _mock_search)

    response = client.post("/api/research", json={"query": "restaurant nyc", "limit": 3})

    assert response.status_code == 200
    body = response.json()
    assert body["enabled"] is True
    assert body["count"] == 1
    assert body["results"][0]["title"] == "Hotel Research"
    assert body["reason"] is None
