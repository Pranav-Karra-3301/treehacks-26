from __future__ import annotations

from typing import Any, Dict, List, Optional

from app.core.config import settings
from app.core.telemetry import log_event, timed_step


async def search_google(query: str, num_results: int = 10) -> List[Dict[str, Any]]:
    if not settings.BRIGHTDATA_ENABLED:
        return []

    from brightdata import BrightDataClient

    async with BrightDataClient(token=settings.BRIGHTDATA_API_TOKEN) as client:
        with timed_step("brightdata", "search_google", details={"query": query}):
            result = await client.search.google(query=query, num_results=num_results)
            if result.success:
                return result.data if isinstance(result.data, list) else [result.data]
            log_event("brightdata", "search_google_failed", status="error")
            return []


async def scrape_url(url: str) -> Optional[Dict[str, Any]]:
    if not settings.BRIGHTDATA_ENABLED:
        return None

    from brightdata import BrightDataClient

    async with BrightDataClient(token=settings.BRIGHTDATA_API_TOKEN) as client:
        with timed_step("brightdata", "scrape_url", details={"url": url}):
            result = await client.scrape.generic.url(url)
            if result.success:
                return result.data
            log_event("brightdata", "scrape_url_failed", status="error")
            return None


async def scrape_urls(urls: List[str]) -> List[Dict[str, Any]]:
    if not settings.BRIGHTDATA_ENABLED:
        return []

    from brightdata import BrightDataClient

    async with BrightDataClient(token=settings.BRIGHTDATA_API_TOKEN) as client:
        with timed_step("brightdata", "scrape_urls", details={"count": len(urls)}):
            results = await client.scrape.generic.url(urls)
            return [r.data for r in results if r.success]


async def search_business_info(business_name: str, location: str = "") -> List[Dict[str, Any]]:
    query = f"{business_name} {location}".strip()
    return await search_google(query, num_results=5)
