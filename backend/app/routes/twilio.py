from __future__ import annotations

import base64
import json
from typing import Dict

from fastapi import APIRouter, Request, Response, WebSocket

from app.services.orchestrator import CallOrchestrator
from app.services.ws_manager import ConnectionManager

router = APIRouter(prefix="/twilio", tags=["twilio"])


def get_routes(orchestrator: CallOrchestrator, ws_manager: ConnectionManager):
    @router.post("/voice")
    async def voice_webhook(request: Request):
        params = dict((await request.form()).items())
        task_id = params.get("task_id", "unknown")

        # In MVP, Twilio hits this endpoint and receives a Media Stream instruction.
        twiml = f"""<?xml version=\"1.0\" encoding=\"UTF-8\"?>
<Response>
    <Start><Stream url=\"ws://{params.get('Host', 'localhost')}/twilio/media-stream?task_id={task_id}\" /></Start>
    <Say voice=\"alice\">Connecting to NegotiateAI.</Say>
    <Pause length=\"60\" />
</Response>"""
        return Response(content=twiml, media_type="application/xml")

    @router.websocket("/media-stream")
    async def media_stream(websocket: WebSocket):
        await websocket.accept()
        task_id = websocket.query_params.get("task_id", "unknown")
        await ws_manager.broadcast(task_id, {"type": "call_status", "data": {"status": "connected", "source": "twilio"}})

        try:
            while True:
                raw = await websocket.receive_text()
                message: Dict = json.loads(raw)
                event = message.get("event")
                if event == "media":
                    media = message.get("media", {})
                    payload = media.get("payload", "")
                    if payload:
                        chunk = base64.b64decode(payload)
                        # No session_id from Twilio payload yet in MVP. Keep raw write target by task-id.
                        call_dir = orchestrator._store.get_task_dir(task_id)
                        call_dir.mkdir(parents=True, exist_ok=True)
                        with open(call_dir / "inbound.wav", "ab") as f:
                            f.write(chunk)
                        await ws_manager.broadcast(
                            task_id,
                            {
                                "type": "transcript_update",
                                "data": {"speaker": "caller", "content": "[raw audio chunk]"},
                            },
                        )
                elif event == "stop":
                    await ws_manager.broadcast(task_id, {"type": "call_status", "data": {"status": "ended"}})
        except Exception:
            pass

    @router.post("/status")
    async def status_callback(request: Request):
        data = await request.form()
        status = data.get("CallStatus")
        task_id = data.get("task_id", data.get("CallSid", "unknown"))
        if status in {"completed", "failed", "busy", "no-answer", "canceled"}:
            await ws_manager.broadcast(task_id, {"type": "call_status", "data": {"status": "ended", "twilio_status": status}})
        return {"ok": True}

    return router
