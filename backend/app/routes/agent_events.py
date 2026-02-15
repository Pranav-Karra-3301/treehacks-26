from __future__ import annotations

import json
from typing import Any, Dict, Optional, Tuple

from fastapi import APIRouter, Body, HTTPException, Request

from app.core.config import settings
from app.core.telemetry import timed_step
from app.services.orchestrator import CallOrchestrator


def _extract_metadata(payload: Dict[str, Any]) -> Dict[str, Any]:
    metadata = payload.get("metadata", {})
    if isinstance(metadata, str):
        try:
            metadata = json.loads(metadata)
        except Exception:
            metadata = {}
    if isinstance(metadata, dict):
        return metadata
    return {}


def _extract_task_id(payload: Dict[str, Any], orchestrator: CallOrchestrator) -> Optional[str]:
    for key in ("task_id", "taskId", "task"):
        value = payload.get(key)
        if isinstance(value, str) and value.strip():
            return value.strip()

    metadata = _extract_metadata(payload)
    for key in ("task_id", "taskId", "task"):
        value = metadata.get(key)
        if isinstance(value, str) and value.strip():
            return value.strip()

    room_name = payload.get("room_name") or payload.get("room") or payload.get("room_name_safe")
    if not room_name:
        room = payload.get("room")
        if isinstance(room, dict):
            room_name = room.get("name") or room.get("room_name")
    if not room_name:
        room_name = metadata.get("room_name") if isinstance(metadata, dict) else None

    if isinstance(room_name, str):
        room_name = room_name.strip()
        if room_name:
            if task_from_room := orchestrator.get_task_id_for_room(room_name):
                return task_from_room
            room_prefix = settings.LIVEKIT_ROOM_PREFIX or "kiru-call"
            if room_name.startswith(room_prefix + "-"):
                candidate = room_name[len(room_prefix) + 1 :].strip()
                if candidate:
                    return candidate
            if room_name.startswith("call-"):
                candidate = room_name[5:].strip()
                if candidate:
                    return candidate

    return None


def _extract_data(payload: Dict[str, Any]) -> Dict[str, Any]:
    data = payload.get("data")
    if isinstance(data, dict):
        return dict(data)
    data_dict = {k: v for k, v in payload.items() if k not in {"event", "type"} and k not in {"room", "room_name", "task_id", "taskId", "task"}}
    return data_dict


def _extract_event(payload: Dict[str, Any], data: Dict[str, Any]) -> str:
    event = payload.get("event") or payload.get("type")
    if isinstance(event, str):
        event = event.strip()
        if event:
            return event

    for key in ("agent_event", "name", "event_name"):
        candidate = payload.get(key)
        if isinstance(candidate, str) and candidate.strip():
            return candidate.strip()

    for key in ("status",):
        if key in payload:
            return "call_status"
    for key in ("speaker", "content"):
        if key in payload and data.get(key) is not None:
            return "transcript_update"
    if "delta" in payload:
        return "agent_thinking"
    if "reason" in payload and "room_name" in payload:
        return "analysis_ready"
    return ""


def _event_payload_tuple(payload: Dict[str, Any]) -> Tuple[str, Dict[str, Any]]:
    data = _extract_data(payload)
    event_type = _extract_event(payload, data)

    if event_type == "call_status":
        if "status" in payload and "status" not in data:
            data = dict(data)
            data["status"] = payload.get("status")

    if "task_id" not in data:
        possible_task = payload.get("task_id") or payload.get("taskId")
        if possible_task is not None:
            data["task_id"] = possible_task

    return event_type, data


def _has_valid_token(request: Request) -> bool:
    expected = (settings.LIVEKIT_INTERNAL_EVENT_TOKEN or "").strip()
    if not expected:
        return True

    auth = request.headers.get("authorization", "").strip()
    if auth.startswith("Bearer "):
        auth = auth[len("Bearer ") :]
    if auth:
        return auth == expected

    alt_token = request.headers.get("x-livekit-event-token", "").strip()
    return alt_token == expected


def get_routes(orchestrator: CallOrchestrator):
    router = APIRouter(prefix="/api/agent-events", tags=["agent-events"])

    @router.post("")
    async def receive_agent_event(
        request: Request,
        payload: Dict[str, Any] = Body(...),
    ):
        if not _has_valid_token(request):
            raise HTTPException(status_code=403, detail="invalid_livekit_event_token")

        task_id, event_type, data = (
            _extract_task_id(payload, orchestrator),
            "",
            {},
        )
        event_type, data = _event_payload_tuple(payload)

        if not task_id and data:
            task_id = _extract_task_id(data, orchestrator)

        if not task_id:
            timed_step(
                "agent-events",
                "event_dropped",
                details={"event": event_type, "payload_keys": sorted(payload.keys())},
            )
            return {"ok": False, "reason": "missing_task_id"}

        if not event_type and isinstance(data, dict):
            event_type = "custom"

        with timed_step("agent-events", "event", task_id=task_id, details={"event": event_type}):
            await orchestrator.handle_agent_event(task_id, event_type, data)
        return {"ok": True, "task_id": task_id, "event": event_type}

    return router
