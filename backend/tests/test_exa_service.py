from __future__ import annotations

import asyncio

import httpx
import pytest

pytestmark = pytest.mark.unit

from app.core.config import settings
from app.services.research import ExaSearchService


class _FakeResponse:
    def __init__(self, payload: dict, status_code: int = 200) -> None:
        self._payload = payload
        self.status_code = status_code
        self.text = str(payload)

    def raise_for_status(self) -> None:
        if self.status_code >= 400:
            request = httpx.Request("POST", "https://api.exa.ai/search")
            raise httpx.HTTPStatusError("error", request=request, response=self)

    def json(self) -> dict:
        return self._payload


class _FakeAsyncClient:
    def __init__(self, payload: dict) -> None:
        self._payload = payload

    async def __aenter__(self):
        return self

    async def __aexit__(self, exc_type, exc, tb) -> None:
        return None

    async def post(self, *_args, **_kwargs) -> _FakeResponse:
        return _FakeResponse(self._payload)


def test_exa_search_disabled(monkeypatch) -> None:
    monkeypatch.setattr(settings, "EXA_SEARCH_ENABLED", False)
    monkeypatch.setattr(settings, "EXA_API_KEY", "")

    result = asyncio.run(ExaSearchService().search("coffee shops near me"))

    assert result["enabled"] is False
    assert result["reason"] == "exasearch_disabled_or_missing_api_key"
    assert result["results"] == []


def test_exa_search_success(monkeypatch) -> None:
    monkeypatch.setattr(settings, "EXA_SEARCH_ENABLED", True)
    monkeypatch.setattr(settings, "EXA_API_KEY", "test-key")

    payload = {
        "results": [
            {
                "title": "Hotel Example",
                "url": "https://example.com",
                "text": "Great rooms and flexible check-in",
                "published": "2024-01-01T00:00:00Z",
                "score": 0.97,
            }
        ]
    }
    monkeypatch.setattr(
        "app.services.research.httpx.AsyncClient",
        lambda *_, **__: _FakeAsyncClient(payload),
    )

    result = asyncio.run(ExaSearchService().search("hotel example", limit=2))

    assert result["enabled"] is True
    assert result["query"] == "hotel example"
    assert result["count"] == 1
    assert result["results"][0]["title"] == "Hotel Example"
