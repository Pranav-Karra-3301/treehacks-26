from __future__ import annotations

from typing import Any, Dict, List, Optional

import httpx

from app.core.config import settings
from app.core.telemetry import log_event


class ExaSearchService:
    """Thin wrapper around Exa search API for contact/business lookup."""

    def __init__(self, api_key: str | None = None, enabled: bool | None = None) -> None:
        self._api_key = (api_key if api_key is not None else settings.EXA_API_KEY).strip()
        if enabled is None:
            self._enabled = settings.EXA_SEARCH_ENABLED
        else:
            self._enabled = enabled

    @property
    def enabled(self) -> bool:
        return self._enabled and bool(self._api_key)

    async def search(self, query: str, *, limit: Optional[int] = None) -> Dict[str, Any]:
        if not self.enabled:
            return {
                "enabled": False,
                "query": query,
                "results": [],
                "reason": "exasearch_disabled_or_missing_api_key",
            }

        trimmed_query = (query or "").strip()
        if not trimmed_query:
            return {
                "enabled": True,
                "query": query,
                "results": [],
                "reason": "empty_query",
            }

        limit = int(limit or settings.EXA_SEARCH_RESULTS_LIMIT)
        if limit <= 0:
            limit = 1

        payload = {
            "query": trimmed_query,
            "type": "keyword",
            "numResults": limit,
            "contents": {
                "text": True,
                "summary": True,
            },
            "includeDomains": [],
            "excludeDomains": [],
        }
        headers = {
            "Content-Type": "application/json",
            "Authorization": f"Bearer {self._api_key}",
        }

        try:
            async with httpx.AsyncClient(timeout=15.0, headers=headers) as client:
                resp = await client.post(settings.EXA_SEARCH_URL, json=payload)
                resp.raise_for_status()
                data = resp.json()
        except httpx.HTTPStatusError as exc:
            log_event(
                "research",
                "exa_search_http_error",
                status="error",
                details={
                    "status_code": exc.response.status_code,
                    "response": exc.response.text[:500],
                    "query": trimmed_query,
                },
            )
            return {
                "enabled": True,
                "query": trimmed_query,
                "results": [],
                "reason": f"http_{exc.response.status_code}",
            }
        except Exception as exc:
            log_event(
                "research",
                "exa_search_error",
                status="error",
                details={"error": f"{type(exc).__name__}: {exc}", "query": trimmed_query},
            )
            return {
                "enabled": True,
                "query": trimmed_query,
                "results": [],
                "reason": f"{type(exc).__name__}: {exc}",
            }

        results = self._normalize_results(data)
        return {
            "enabled": True,
            "query": trimmed_query,
            "count": len(results),
            "results": results,
        }

    def _normalize_results(self, data: Dict[str, Any]) -> List[Dict[str, Any]]:
        raw_results = data.get("results", []) if isinstance(data, dict) else []
        normalized: List[Dict[str, Any]] = []

        for item in raw_results:
            if not isinstance(item, dict):
                continue
            normalized.append(
                {
                    "title": item.get("title"),
                    "url": item.get("url"),
                    "snippet": item.get("text") or item.get("snippet") or item.get("summary"),
                    "published": item.get("published") or item.get("publishedDate"),
                    "score": item.get("score"),
                }
            )

        return normalized
