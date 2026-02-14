from __future__ import annotations

import base64
import json
from datetime import datetime
from urllib.parse import urlparse

from fastapi import APIRouter, Request, Response, WebSocket, WebSocketDisconnect

from app.core.config import settings
from app.services.orchestrator import CallOrchestrator
from app.services.ws_manager import ConnectionManager
from app.core.telemetry import log_event, timed_step


router = APIRouter(prefix="/twilio", tags=["twilio"])


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


def get_routes(orchestrator: CallOrchestrator, ws_manager: ConnectionManager):
    @router.post("/voice")
    async def voice_webhook(request: Request):
        params = dict((await request.form()).items())
        task_id = params.get("task_id", "unknown")
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
    <Start>
        <Stream url="{stream_url}" />
    </Start>
    <Say voice="alice">Connecting to negotiation agent.</Say>
    <Pause length="60" />
</Response>"""
            return Response(content=twiml, media_type="application/xml")

    @router.websocket("/media-stream")
    async def media_stream(websocket: WebSocket):
        await websocket.accept()
        task_id = websocket.query_params.get("task_id", "unknown")
        stream_sid = None
        events_received = 0
        marks_received = 0

        with timed_step("twilio", "media_stream", task_id=task_id, details={"initial_task_id": task_id}):
            with timed_step("twilio", "media_stream_open", task_id=task_id):
                await orchestrator.register_media_stream(task_id, websocket)
                await ws_manager.broadcast(task_id, {"type": "call_status", "data": {"status": "connected"}})

            try:
                while True:
                    raw = await websocket.receive_text()
                    events_received += 1
                    message = json.loads(raw)
                    event = message.get("event")

                    with timed_step("twilio", "media_event", task_id=task_id, details={"event": event}):
                        if event == "start":
                            stream_sid = message.get("start", {}).get("streamSid")
                            if stream_sid:
                                await orchestrator.set_media_stream_sid(task_id, stream_sid)
                            await ws_manager.broadcast(
                                task_id,
                                {"type": "call_status", "data": {"status": "media_connected", "stream_sid": stream_sid}},
                            )

                        if event == "media":
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
                            await ws_manager.broadcast(
                                task_id,
                                {"type": "call_status", "data": {"status": "ended", "reason": "stream_closed"}},
                            )
                            await orchestrator.stop_task_call(task_id, from_status_callback=True)
            except WebSocketDisconnect:
                await ws_manager.broadcast(task_id, {"type": "call_status", "data": {"status": "disconnected"}})
                log_event(
                    "twilio",
                    "media_stream_disconnect",
                    task_id=task_id,
                    details={"events_received": events_received, "marks_received": marks_received},
                )
            except Exception as exc:
                log_event(
                    "twilio",
                    "media_stream_error",
                    task_id=task_id,
                    status="error",
                    details={
                        "events_received": events_received,
                        "marks_received": marks_received,
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
