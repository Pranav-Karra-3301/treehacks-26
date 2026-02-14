from __future__ import annotations

from fastapi import APIRouter

from app.core.telemetry import get_metric_events, summarize_events, timed_step


router = APIRouter(prefix="/api/telemetry", tags=["telemetry"])


def get_routes():
    @router.get("/recent")
    async def recent_events(
        limit: int = 200,
        component: str | None = None,
        action: str | None = None,
        task_id: str | None = None,
        session_id: str | None = None,
    ):
        with timed_step(
            "telemetry",
            "recent_events",
            details={
                "limit": limit,
                "component": component,
                "action": action,
                "task_id": task_id,
                "session_id": session_id,
            },
        ):
            events = get_metric_events(
                limit=limit,
                component=component,
                action=action,
                task_id=task_id,
                session_id=session_id,
            )
            return {
                "count": len(events),
                "events": events,
            }

    @router.get("/summary")
    async def summary(
        limit: int = 1000,
        component: str | None = None,
        action: str | None = None,
        task_id: str | None = None,
        session_id: str | None = None,
    ):
        with timed_step(
            "telemetry",
            "summary",
            details={
                "limit": limit,
                "component": component,
                "action": action,
                "task_id": task_id,
                "session_id": session_id,
            },
        ):
            return summarize_events(
                limit=limit,
                component=component,
                action=action,
                task_id=task_id,
                session_id=session_id,
            )

    return router
