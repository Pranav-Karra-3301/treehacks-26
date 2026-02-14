from __future__ import annotations

from typing import List, Optional

from fastapi import APIRouter
from pydantic import BaseModel, Field

from app.services.research import ExaSearchService
from app.core.telemetry import timed_step


class ResearchRequest(BaseModel):
    query: str = Field(min_length=1)
    limit: Optional[int] = None


class BusinessResult(BaseModel):
    title: Optional[str] = None
    url: Optional[str] = None
    snippet: Optional[str] = None
    published: Optional[str] = None
    score: Optional[float] = None


class ResearchResponse(BaseModel):
    ok: bool
    enabled: bool
    query: str
    count: int = 0
    results: List[BusinessResult] = Field(default_factory=list)
    reason: Optional[str] = None


router = APIRouter(prefix="/api/research", tags=["research"])


def get_routes():
    @router.post("", response_model=ResearchResponse)
    async def search_businesses(request: ResearchRequest):
        with timed_step("api", "search_businesses", details={"query": request.query, "limit": request.limit}):
            service = ExaSearchService()
            result = await service.search(request.query, limit=request.limit)
            return ResearchResponse(
                ok=bool(result.get("results")),
                enabled=result.get("enabled", False),
                query=result.get("query", request.query),
                count=result.get("count", len(result.get("results", []))),
                results=result.get("results", []),
                reason=result.get("reason"),
            )

    return router
