from __future__ import annotations

import re
from typing import Any, Dict, List, Optional

import httpx

from app.core.config import settings
from app.core.telemetry import log_event, timed_step

_US_PHONE_RE = re.compile(
    r"""
    (?<!\d)                         # no digit before
    (?:\+?1[\s.-]?)?                # optional +1 or 1 prefix
    \(?([2-9]\d{2})\)?              # area code
    [\s.\-]?                        # separator
    ([2-9]\d{2})                    # exchange
    [\s.\-]?                        # separator
    (\d{4})                         # subscriber
    (?!\d)                          # no digit after
    """,
    re.VERBOSE,
)


def extract_phone_numbers(text: str) -> List[str]:
    """Extract US phone numbers from text and normalize to +1XXXXXXXXXX."""
    if not text:
        return []
    seen: set[str] = set()
    result: List[str] = []
    for m in _US_PHONE_RE.finditer(text):
        normalized = f"+1{m.group(1)}{m.group(2)}{m.group(3)}"
        if normalized not in seen:
            seen.add(normalized)
            result.append(normalized)
    return result


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

        # Enhance query to find business contact pages with phone numbers
        enhanced_query = f"{trimmed_query} phone number contact"
        payload = {
            "query": enhanced_query,
            "type": settings.EXA_SEARCH_TYPE,
            "numResults": limit,
            "contents": {
                "text": {"maxCharacters": 3000},
                "highlights": {"numSentences": 5},
            },
            "includeDomains": [],
            "excludeDomains": [],
        }
        headers = {
            "Content-Type": "application/json",
            "Authorization": f"Bearer {self._api_key}",
        }

        with timed_step(
            "research",
            "exa_search",
            details={"query": trimmed_query, "limit": limit},
        ):
            try:
                async with httpx.AsyncClient(timeout=httpx.Timeout(8.0, connect=3.0), headers=headers) as client:
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
            text_content = item.get("text") or item.get("snippet") or item.get("summary") or ""
            highlights = item.get("highlights") or []
            title = item.get("title") or ""
            url = item.get("url") or ""
            # Extract phone numbers from all available text
            all_text = f"{title}\n{url}\n{text_content}"
            phone_numbers = extract_phone_numbers(all_text)
            for h in highlights:
                for p in extract_phone_numbers(h):
                    if p not in phone_numbers:
                        phone_numbers.append(p)
            normalized.append(
                {
                    "title": item.get("title"),
                    "url": item.get("url"),
                    "snippet": text_content[:500] if text_content else None,
                    "published": item.get("published") or item.get("publishedDate"),
                    "score": item.get("score"),
                    "phone_numbers": phone_numbers,
                    "highlights": highlights[:5] if highlights else [],
                }
            )

        return normalized
