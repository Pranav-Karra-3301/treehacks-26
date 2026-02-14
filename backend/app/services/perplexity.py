"""Perplexity Sonar search integration for real-time web research."""

from __future__ import annotations

from typing import Any, Dict, List, Optional

import httpx

from app.core.config import settings
from app.core.telemetry import log_event


class PerplexitySonarService:
    """Wrapper around the Perplexity Sonar API for real-time web search."""

    def __init__(
        self,
        api_key: str | None = None,
        enabled: bool | None = None,
    ) -> None:
        self._api_key = (api_key if api_key is not None else settings.PERPLEXITY_API_KEY).strip()
        if enabled is None:
            self._enabled = settings.PERPLEXITY_SEARCH_ENABLED
        else:
            self._enabled = enabled

    @property
    def enabled(self) -> bool:
        return self._enabled and bool(self._api_key)

    async def search(
        self,
        query: str,
        *,
        system_prompt: str = "Be precise and concise. Return factual information with sources.",
    ) -> Dict[str, Any]:
        """Query Perplexity Sonar for real-time web search results.

        Returns a dict with 'content' (the answer text), 'citations' (source URLs),
        and metadata.
        """
        if not self.enabled:
            return {
                "enabled": False,
                "query": query,
                "content": "",
                "citations": [],
                "reason": "perplexity_disabled_or_missing_api_key",
            }

        trimmed = (query or "").strip()
        if not trimmed:
            return {
                "enabled": True,
                "query": query,
                "content": "",
                "citations": [],
                "reason": "empty_query",
            }

        payload = {
            "model": settings.PERPLEXITY_MODEL,
            "messages": [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": trimmed},
            ],
            "max_tokens": 1024,
            "return_citations": True,
        }
        headers = {
            "Content-Type": "application/json",
            "Authorization": f"Bearer {self._api_key}",
        }

        try:
            async with httpx.AsyncClient(timeout=20.0, headers=headers) as client:
                resp = await client.post(
                    f"{settings.PERPLEXITY_BASE_URL}/chat/completions",
                    json=payload,
                )
                resp.raise_for_status()
                data = resp.json()
        except httpx.HTTPStatusError as exc:
            log_event(
                "research",
                "perplexity_search_http_error",
                status="error",
                details={
                    "status_code": exc.response.status_code,
                    "response": exc.response.text[:500],
                    "query": trimmed,
                },
            )
            return {
                "enabled": True,
                "query": trimmed,
                "content": "",
                "citations": [],
                "reason": f"http_{exc.response.status_code}",
            }
        except Exception as exc:
            log_event(
                "research",
                "perplexity_search_error",
                status="error",
                details={"error": f"{type(exc).__name__}: {exc}", "query": trimmed},
            )
            return {
                "enabled": True,
                "query": trimmed,
                "content": "",
                "citations": [],
                "reason": f"{type(exc).__name__}: {exc}",
            }

        return self._normalize(data, trimmed)

    def _normalize(self, data: Dict[str, Any], query: str) -> Dict[str, Any]:
        choices = data.get("choices", [])
        content = ""
        if choices:
            message = choices[0].get("message", {})
            content = message.get("content", "")

        citations: List[str] = data.get("citations", [])

        return {
            "enabled": True,
            "query": query,
            "content": content,
            "citations": citations,
            "model": data.get("model", settings.PERPLEXITY_MODEL),
            "usage": data.get("usage"),
        }
