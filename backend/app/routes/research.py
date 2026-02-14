from __future__ import annotations

from typing import List, Optional

from fastapi import APIRouter
from pydantic import BaseModel, Field

from app.core.config import settings
from app.services.research import ExaSearchService
from app.services.perplexity import PerplexitySonarService
from app.services.cache import CacheService
from app.core.telemetry import log_event, timed_step


class ResearchRequest(BaseModel):
    query: str = Field(min_length=1)
    limit: Optional[int] = None


class BusinessResult(BaseModel):
    title: Optional[str] = None
    url: Optional[str] = None
    snippet: Optional[str] = None
    published: Optional[str] = None
    score: Optional[float] = None
    phone_numbers: List[str] = Field(default_factory=list)
    highlights: List[str] = Field(default_factory=list)


class ResearchResponse(BaseModel):
    ok: bool
    enabled: bool
    query: str
    count: int = 0
    results: List[BusinessResult] = Field(default_factory=list)
    reason: Optional[str] = None


def get_routes(cache: Optional[CacheService] = None):
    router = APIRouter(prefix="/api/research", tags=["research"])
    local_cache = cache

    @router.post("", response_model=ResearchResponse)
    async def search_businesses(request: ResearchRequest):
        trimmed_query = request.query.strip()
        normalized_limit = request.limit if request.limit is not None else settings.EXA_SEARCH_RESULTS_LIMIT
        cache_key = None
        if local_cache is not None:
            cache_key = local_cache.key("research", "search", normalized_limit, trimmed_query.lower())
            cached = await local_cache.get_json(cache_key)
            if cached is not None:
                return ResearchResponse(
                    ok=bool(cached.get("results")),
                    enabled=cached.get("enabled", False),
                    query=cached.get("query", trimmed_query),
                    count=cached.get("count", len(cached.get("results", []))),
                    results=cached.get("results", []),
                    reason=cached.get("reason"),
                )

        with timed_step("api", "search_businesses", details={"query": trimmed_query, "limit": normalized_limit}):
            service = ExaSearchService()
            result = await service.search(trimmed_query, limit=normalized_limit)

            # Perplexity Sonar — available for future enrichment but not
            # called in the hot path yet.  Instantiate so the service is
            # importable and the config is validated at startup.
            _sonar = PerplexitySonarService()
            if _sonar.enabled:
                log_event(
                    "research",
                    "perplexity_sonar_available",
                    status="ok",
                    details={"query": trimmed_query, "note": "sonar ready but not invoked"},
                )

            if cache_key is not None:
                await local_cache.set_json(
                    cache_key,
                    result,
                    ttl_seconds=settings.CACHE_RESEARCH_TTL_SECONDS,
                )
            return ResearchResponse(
                ok=bool(result.get("results")),
                enabled=result.get("enabled", False),
                query=result.get("query", request.query),
                count=result.get("count", len(result.get("results", []))),
                results=result.get("results", []),
                reason=result.get("reason"),
            )

    return router
