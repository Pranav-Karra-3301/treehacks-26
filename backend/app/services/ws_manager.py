from __future__ import annotations

import json
from typing import Dict, List

from fastapi import WebSocket
from app.core.telemetry import log_event, timed_step


class ConnectionManager:
    def __init__(self) -> None:
        self._active_connections: Dict[str, List[WebSocket]] = {}

    async def connect(self, session_id: str, websocket: WebSocket) -> None:
        await websocket.accept()
        self._active_connections.setdefault(session_id, []).append(websocket)
        log_event(
            "websocket",
            "client_connected",
            session_id=session_id,
            details={"peer_count": len(self._active_connections.get(session_id, []))},
        )

    def disconnect(self, session_id: str, websocket: WebSocket) -> None:
        if session_id not in self._active_connections:
            return
        connections = self._active_connections[session_id]
        if websocket in connections:
            connections.remove(websocket)
        remaining = len(connections)
        if not connections:
            self._active_connections.pop(session_id, None)
        log_event(
            "websocket",
            "client_disconnected",
            session_id=session_id,
            details={"remaining_peers": remaining},
        )

    async def broadcast(self, session_id: str, event: Dict) -> None:
        payload = json.dumps(event, default=str)
        connections = self._active_connections.get(session_id, [])
        event_type = event.get("type", "unknown")
        failed = 0
        with timed_step(
            "websocket",
            "broadcast",
            session_id=session_id,
            details={"peer_count": len(connections), "event_type": event_type, "payload_bytes": len(payload)},
        ):
            for connection in list(connections):
                try:
                    await connection.send_text(payload)
                except Exception:
                    failed += 1
                    self.disconnect(session_id, connection)
        if failed:
            log_event(
                "websocket",
                "broadcast_failures",
                session_id=session_id,
                status="warning",
                details={"failed": failed, "event_type": event_type},
            )
