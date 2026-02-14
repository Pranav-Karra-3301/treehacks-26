from __future__ import annotations

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from app.services.ws_manager import ConnectionManager
from app.core.telemetry import log_event, timed_step
from app.services.orchestrator import CallOrchestrator

router = APIRouter(tags=["websocket"])


def get_routes(connection_manager: ConnectionManager, orchestrator: CallOrchestrator):
    async def _resolve_topic(identifier: str) -> str:
        task_id = orchestrator.get_session_id_for_task(identifier)
        if task_id:
            return identifier

        task_for_session = orchestrator.get_task_id_for_session(identifier)
        if task_for_session:
            return task_for_session

        return identifier

    @router.websocket("/ws/call/{identifier}")
    async def call_feed(websocket: WebSocket, identifier: str):
        topic = await _resolve_topic(identifier)
        with timed_step("ws", "connect", session_id=topic, details={"identifier": identifier}):
            await connection_manager.connect(topic, websocket)
            await connection_manager.broadcast(
                topic,
                {"type": "call_status", "data": {"status": "connected", "session_id": topic}},
            )
            with timed_step("ws", "consume", session_id=topic):
                messages_received = 0
                try:
                    while True:
                        await websocket.receive_text()
                        messages_received += 1
                except WebSocketDisconnect:
                    log_event(
                        "ws",
                        "consume_end",
                        session_id=topic,
                        details={"messages_received": messages_received},
                    )
                    connection_manager.disconnect(topic, websocket)
                except Exception as exc:
                    log_event(
                        "ws",
                        "consume_error",
                        session_id=topic,
                        status="error",
                        details={"error": f"{type(exc).__name__}: {exc}", "messages_received": messages_received},
                    )
                    connection_manager.disconnect(topic, websocket)
                    raise

    return router
