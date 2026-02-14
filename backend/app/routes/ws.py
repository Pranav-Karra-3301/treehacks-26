from __future__ import annotations

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from app.services.ws_manager import ConnectionManager

router = APIRouter(tags=["websocket"])


def get_routes(connection_manager: ConnectionManager):
    @router.websocket("/ws/call/{session_id}")
    async def call_feed(websocket: WebSocket, session_id: str):
        await connection_manager.connect(session_id, websocket)
        await connection_manager.broadcast(
            session_id,
            {"type": "call_status", "data": {"status": "connected", "session_id": session_id}},
        )
        try:
            while True:
                await websocket.receive_text()
        except WebSocketDisconnect:
            connection_manager.disconnect(session_id, websocket)

    return router
