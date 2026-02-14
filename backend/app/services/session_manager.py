from __future__ import annotations

import asyncio
from dataclasses import dataclass, field
from datetime import datetime
from typing import Any, Dict, List, Optional
from uuid import uuid4

from app.models.schemas import CallStatus


@dataclass
class CallSession:
    session_id: str
    task_id: str
    status: str = "pending"
    created_at: datetime = field(default_factory=datetime.utcnow)
    started_at: Optional[datetime] = None
    ended_at: Optional[datetime] = None
    conversation: List[Dict[str, Any]] = field(default_factory=list)
    transcript: List[Dict[str, Any]] = field(default_factory=list)
    metadata: Dict[str, Any] = field(default_factory=dict)


class SessionManager:
    def __init__(self) -> None:
        self._sessions: Dict[str, CallSession] = {}
        self._lock = asyncio.Lock()

    async def create_session(self, task_id: str) -> CallSession:
        session_id = str(uuid4())
        session = CallSession(session_id=session_id, task_id=task_id, status="pending")
        async with self._lock:
            self._sessions[session_id] = session
        return session

    async def get(self, session_id: str) -> Optional[CallSession]:
        return self._sessions.get(session_id)

    async def set_status(self, session_id: str, status: CallStatus) -> Optional[CallSession]:
        async with self._lock:
            session = self._sessions.get(session_id)
            if not session:
                return None
            session.status = status
            if status == "active" and not session.started_at:
                session.started_at = datetime.utcnow()
            if status == "ended":
                session.ended_at = datetime.utcnow()
            return session

    async def append_transcript(self, session_id: str, turn: Dict[str, Any]) -> None:
        async with self._lock:
            session = self._sessions.get(session_id)
            if not session:
                return
            session.transcript.append(turn)
            session.metadata["last_transcript_at"] = datetime.utcnow().isoformat()

    async def append_conversation(self, session_id: str, message: Dict[str, Any]) -> None:
        async with self._lock:
            session = self._sessions.get(session_id)
            if not session:
                return
            session.conversation.append(message)

    async def dump_conversation(self, session_id: str) -> List[Dict[str, Any]]:
        session = self._sessions.get(session_id)
        return list(session.conversation) if session else []

    async def dump_transcript(self, session_id: str) -> List[Dict[str, Any]]:
        session = self._sessions.get(session_id)
        return list(session.transcript) if session else []

    async def get_duration_seconds(self, session_id: str) -> int:
        session = self._sessions.get(session_id)
        if not session or not session.started_at:
            return 0
        end = session.ended_at or datetime.utcnow()
        return int((end - session.started_at).total_seconds())
