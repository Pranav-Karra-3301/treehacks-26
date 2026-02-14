from __future__ import annotations

import json
from typing import Dict, List

from fastapi import WebSocket


class ConnectionManager:
    def __init__(self) -> None:
        self._active_connections: Dict[str, List[WebSocket]] = {}

    async def connect(self, session_id: str, websocket: WebSocket) -> None:
        await websocket.accept()
        self._active_connections.setdefault(session_id, []).append(websocket)

    def disconnect(self, session_id: str, websocket: WebSocket) -> None:
        if session_id not in self._active_connections:
            return
        connections = self._active_connections[session_id]
        if websocket in connections:
            connections.remove(websocket)
        if not connections:
            self._active_connections.pop(session_id, None)

    async def broadcast(self, session_id: str, event: Dict) -> None:
        payload = json.dumps(event, default=str)
        connections = self._active_connections.get(session_id, [])
        for connection in list(connections):
            try:
                await connection.send_text(payload)
            except Exception:
                self.disconnect(session_id, connection)
