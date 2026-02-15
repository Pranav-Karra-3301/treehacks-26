from __future__ import annotations

import base64
import json
from datetime import datetime
from typing import Any, Dict, Optional
from urllib.parse import urlparse

from fastapi import APIRouter, Request, Response, WebSocket, WebSocketDisconnect

from app.core.config import settings
from app.services.orchestrator import CallOrchestrator
from app.services.ws_manager import ConnectionManager
from app.core.telemetry import log_event, timed_step


def _format_stream_url(request: Request, task_id: str) -> str:
    host = (settings.TWILIO_WEBHOOK_HOST or "").strip() or str(request.base_url)
    parsed = urlparse(host)

    if parsed.scheme in {"ws", "wss"}:
        ws_base = f"{parsed.scheme}://{parsed.netloc}"
    elif parsed.scheme in {"http", "https"}:
        ws_scheme = "wss" if parsed.scheme == "https" else "ws"
        ws_base = f"{ws_scheme}://{parsed.netloc}"
    else:
        # No scheme provided in config/env, normalize to a bare host.
        # Preserve host + optional port, strip any path and trailing slash.
        host_only = parsed.path.split("?", 1)[0].split("/", 1)[0].strip("/")
        ws_base = f"wss://{host_only}"

    return f"{ws_base.rstrip('/')}/twilio/media-stream?task_id={task_id}"


def _extract_task_id_from_start_payload(start_payload: Dict[str, Any]) -> Optional[str]:
    if not isinstance(start_payload, dict):
        return None

    custom_parameters = start_payload.get("customParameters") or start_payload.get("custom_parameters")
    if isinstance(custom_parameters, dict):
        for key in ("task_id", "taskId", "TaskId", "task", "Task"):
            task_id = custom_parameters.get(key)
            if isinstance(task_id, str) and task_id.strip():
                return task_id.strip()

    for key in ("task_id", "taskId", "TaskId", "task", "Task"):
        task_id = start_payload.get(key)
        if isinstance(task_id, str) and task_id.strip():
            return task_id.strip()
    return None


def _coerce_id(value: Any) -> Optional[str]:
    if not isinstance(value, str):
        return None
    value = value.strip()
    return value or None


def _extract_media_context(message: Dict[str, Any]) -> tuple[Optional[str], Optional[str], Optional[str]]:
    start = message.get("start")
    start_payload = start if isinstance(start, dict) else {}

    stream_sid = _coerce_id(
        message.get("streamSid")
        or message.get("stream_sid")
        or message.get("streamId")
        or message.get("stream_id")
        or start_payload.get("streamSid")
        or start_payload.get("stream_sid")
        or start_payload.get("stream_id")
    )
    call_sid = _coerce_id(
        message.get("callSid")
        or message.get("call_sid")
        or message.get("CallSid")
        or start_payload.get("callSid")
        or start_payload.get("call_sid")
        or start_payload.get("CallSid")
    )
    task_id = _extract_task_id_from_start_payload(start_payload)
    if not task_id:
        task_id = _coerce_id(
            message.get("task_id")
            or message.get("taskId")
            or message.get("TaskId")
            or message.get("task")
            or message.get("Task")
        )
    return task_id, call_sid, stream_sid


def get_routes(orchestrator: CallOrchestrator, ws_manager: ConnectionManager):
    router = APIRouter(prefix="/twilio", tags=["twilio"])

    @router.post("/voice")
    async def voice_webhook(request: Request):
        params = dict((await request.form()).items())
        query_params = dict(request.query_params.items())
        task_id = params.get("task_id") or query_params.get("task_id", "unknown")
        if not task_id:
            task_id = "unknown"

        with timed_step(
            "twilio",
            "voice_webhook",
            task_id=task_id,
            details={
                "has_digits": bool(params.get("Digits")),
                "has_call_status": bool(params.get("CallStatus")),
            },
        ):
            stream_url = _format_stream_url(request, task_id)

            twiml = f"""<?xml version="1.0" encoding="UTF-8"?>
<Response>
    <Connect>
        <Stream url="{stream_url}">
            <Parameter name="task_id" value="{task_id}" />
        </Stream>
    </Connect>
</Response>"""
            return Response(content=twiml, media_type="application/xml")

    @router.websocket("/media-stream")
    async def media_stream(websocket: WebSocket):
        await websocket.accept()
        query_task_id = (
            websocket.query_params.get("task_id")
            or websocket.query_params.get("TaskId")
            or websocket.query_params.get("TaskID")
            or websocket.query_params.get("task")
            or "unknown"
        )
        initial_query_task_id = query_task_id
        task_id = query_task_id
        stream_sid = None
        call_sid = None
        events_received = 0
        marks_received = 0
        media_chunks_received = 0

        with timed_step("twilio", "media_stream", task_id=query_task_id, details={"initial_task_id": query_task_id}):
            with timed_step("twilio", "media_stream_open", task_id=query_task_id):
                await orchestrator.register_media_stream(query_task_id, websocket)
                await ws_manager.broadcast(
                    query_task_id,
                    {"type": "call_status", "data": {"status": "connected"}},
                )

            try:
                while True:
                    raw = await websocket.receive_text()
                    events_received += 1
                    message = json.loads(raw)
                    event = message.get("event")
                    context_task_id, context_call_sid, context_stream_sid = _extract_media_context(message)

                    if context_call_sid:
                        call_sid = context_call_sid
                    if context_stream_sid:
                        stream_sid = context_stream_sid
                    if context_task_id:
                        if task_id == "unknown":
                            task_id = context_task_id

                    if event == "start":
                        with timed_step("twilio", "media_event", task_id=task_id, details={"event": event, "task_id": task_id}):
                            candidate_task_id = context_task_id or task_id
                            task_id, resolution_method = orchestrator.resolve_task_for_media_event(
                                candidate_task_id,
                                stream_sid=stream_sid,
                                call_sid=call_sid,
                            )

                            log_event(
                                "twilio",
                                "media_stream_start_context",
                                task_id=task_id if task_id != "unknown" else query_task_id,
                                details={
                                    "raw_task_id": context_task_id,
                                    "candidate_task_id": candidate_task_id,
                                    "stream_sid": stream_sid,
                                    "call_sid": call_sid,
                                    "resolution_method": resolution_method,
                                },
                            )

                            if task_id != query_task_id:
                                if query_task_id != "unknown":
                                    await orchestrator.unregister_media_stream(query_task_id)
                                query_task_id = task_id

                            if task_id == "unknown":
                                log_event(
                                    "twilio",
                                    "media_stream_task_unknown",
                                    task_id=task_id,
                                    status="warning",
                                    details={
                                        "stream_sid": stream_sid,
                                        "call_sid": call_sid,
                                        "start_task_id": context_task_id,
                                        "events_received": events_received,
                                    },
                                )
                            else:
                                await orchestrator.register_media_stream(
                                    task_id,
                                    websocket,
                                    stream_sid=stream_sid,
                                    call_sid=call_sid,
                                )
                                if stream_sid:
                                    await orchestrator.set_media_stream_sid(task_id, stream_sid)
                                if call_sid:
                                    await orchestrator.set_media_call_sid(task_id, call_sid)

                            if task_id != "unknown" and task_id != initial_query_task_id:
                                await ws_manager.broadcast(
                                    task_id,
                                    {"type": "call_status", "data": {"status": "connected"}},
                                )

                            await ws_manager.broadcast(
                                task_id,
                                {"type": "call_status", "data": {"status": "media_connected", "stream_sid": stream_sid}},
                            )
                        continue

                    if task_id == "unknown" and (context_task_id or call_sid or stream_sid):
                        resolved_task_id, _ = orchestrator.resolve_task_for_media_event(
                            context_task_id or task_id,
                            stream_sid=stream_sid,
                            call_sid=call_sid,
                        )
                        log_event(
                            "twilio",
                            "media_stream_resolution",
                            task_id=resolved_task_id if resolved_task_id != "unknown" else query_task_id,
                            status="ok" if resolved_task_id != "unknown" else "warning",
                            details={
                                "raw_task_id": context_task_id,
                                "stream_sid": stream_sid,
                                "call_sid": call_sid,
                            },
                        )
                        if resolved_task_id != task_id:
                            task_id = resolved_task_id
                            if task_id != query_task_id:
                                await orchestrator.unregister_media_stream(query_task_id)
                                query_task_id = task_id
                            if task_id != "unknown":
                                await orchestrator.register_media_stream(
                                    task_id,
                                    websocket,
                                    stream_sid=stream_sid,
                                    call_sid=call_sid,
                                )
                                if stream_sid:
                                    await orchestrator.set_media_stream_sid(task_id, stream_sid)
                                if call_sid:
                                    await orchestrator.set_media_call_sid(task_id, call_sid)

                    with timed_step("twilio", "media_event", task_id=task_id, details={"event": event}):
                        if event == "media":
                            media_chunks_received += 1
                            if task_id == "unknown":
                                media_payload = message.get("media", {})
                                media_data = media_payload.get("payload", "") if isinstance(media_payload, dict) else ""
                                log_event(
                                    "twilio",
                                    "media_stream_media_dropped_no_task",
                                    task_id=task_id,
                                    status="warning",
                                    details={
                                        "events_received": events_received,
                                        "stream_sid": stream_sid,
                                        "call_sid": call_sid,
                                        "raw_task_id": context_task_id,
                                        "payload_len": len(media_data) if isinstance(media_data, str) else 0,
                                    },
                                )
                                continue

                            media = message.get("media", {})
                            payload = media.get("payload", "")
                            if not payload:
                                continue

                            chunk = base64.b64decode(payload)
                            await orchestrator.on_media_chunk(task_id, chunk)

                        if event == "mark":
                            marks_received += 1
                            mark_payload = message.get("mark", {})
                            await ws_manager.broadcast(
                                task_id,
                                {
                                    "type": "call_status",
                                    "data": {
                                        "status": "mark",
                                        "mark_name": mark_payload.get("name"),
                                        "mark_time_ms": mark_payload.get("markTime"),
                                        "sequence_number": mark_payload.get("sequenceNumber"),
                                        "count": marks_received,
                                    },
                                },
                            )
                            log_event(
                                "twilio",
                                "media_mark_received",
                                task_id=task_id,
                                details={
                                    "mark_name": mark_payload.get("name"),
                                    "mark_time_ms": mark_payload.get("markTime"),
                                    "sequence_number": mark_payload.get("sequenceNumber"),
                                    "events_received": events_received,
                                    "received_at": datetime.utcnow().isoformat(),
                                },
                            )

                        if event == "stop":
                            if task_id == "unknown" and call_sid:
                                task_id, _ = orchestrator.resolve_task_for_media_event(
                                    task_id,
                                    stream_sid=stream_sid,
                                    call_sid=call_sid,
                                )
                            await orchestrator.stop_task_call(task_id, from_status_callback=True, stop_reason="stream_stop")
            except WebSocketDisconnect:
                await ws_manager.broadcast(task_id, {"type": "call_status", "data": {"status": "disconnected"}})
                log_event(
                    "twilio",
                    "media_stream_disconnect",
                    task_id=task_id,
                    details={"events_received": events_received, "marks_received": marks_received, "media_chunks_received": media_chunks_received},
                )
                if task_id and task_id != "unknown":
                    await orchestrator.stop_task_call(task_id, from_status_callback=True, stop_reason="ws_disconnect")
            except Exception as exc:
                log_event(
                    "twilio",
                    "media_stream_error",
                    task_id=task_id,
                    status="error",
                    details={
                        "events_received": events_received,
                        "marks_received": marks_received,
                        "media_chunks_received": media_chunks_received,
                        "error": f"{type(exc).__name__}: {exc}",
                    },
                )
            finally:
                await orchestrator.unregister_media_stream(task_id)

    @router.post("/status")
    async def status_callback(request: Request):
        data = await request.form()
        task_id = data.get("task_id")
        call_sid = data.get("CallSid")
        status = data.get("CallStatus")

        with timed_step("twilio", "status_callback", task_id=task_id or "unknown", details={"call_sid": call_sid, "status": status}):
            await orchestrator.handle_twilio_status(task_id, call_sid, status)

        return {"ok": True}

    return router
