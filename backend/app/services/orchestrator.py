from __future__ import annotations

import json
import time
from pathlib import Path
from typing import Any, Dict, Optional

from app.services.audio_pipeline import SentenceBuffer
from app.services.llm_client import LLMClient
from app.services.negotiation_engine import NegotiationEngine
from app.services.session_manager import SessionManager
from app.services.storage import DataStore
from app.services.twilio_client import TwilioClient
from app.services.ws_manager import ConnectionManager


class CallOrchestrator:
    """Coordinate call lifecycle, LLM turns, and transcript persistence."""

    def __init__(
        self,
        store: DataStore,
        sessions: SessionManager,
        ws_manager: ConnectionManager,
    ) -> None:
        self._store = store
        self._sessions = sessions
        self._ws = ws_manager
        self._llm = LLMClient()
        self._engine = NegotiationEngine(self._llm)
        self._twilio = TwilioClient()
        self._sentence_buffer = SentenceBuffer()
        self._task_to_session: dict[str, str] = {}

    async def start_task_call(self, task_id: str, task: Dict[str, Any]) -> Dict[str, Any]:
        session = await self._sessions.create_session(task_id)
        self._task_to_session[task_id] = session.session_id
        await self._sessions.set_status(session.session_id, "dialing")
        await self._store.update_status(task_id, "dialing")
        call = await self._twilio.place_call(task["target_phone"], task_id)

        await self._ws.broadcast(
            task_id,
            {
                "type": "call_status",
                "data": {"status": "dialing", "session_id": session.session_id, "call": call},
            },
        )

        await self._sessions.set_status(session.session_id, "active")
        await self._store.update_status(task_id, "active")
        return {"session_id": session.session_id, "task_id": task_id, "twilio": call}

    async def stop_task_call(self, task_id: str) -> None:
        session_id = self._task_to_session.get(task_id)
        if session_id:
            session = await self._sessions.get(session_id)
            duration = await self._sessions.get_duration_seconds(session_id) if session else 0
            await self._sessions.set_status(session_id, "ended")
            await self._store.update_duration(task_id, duration)
            await self._store.update_ended_at(task_id)
            await self._ws.broadcast(
                task_id,
                {"type": "call_status", "data": {"status": "ended", "session_id": session_id}},
            )

        await self._store.update_status(task_id, "ended")
        self._task_to_session.pop(task_id, None)

    async def handle_user_utterance(self, session_id: str, utterance: str) -> Optional[str]:
        session = await self._sessions.get(session_id)
        if not session:
            return None

        task = self._store.get_task(session.task_id)
        if not task:
            return None

        await self._sessions.append_transcript(
            session_id,
            {
                "speaker": "caller",
                "content": utterance,
                "created_at": time.time(),
            },
        )

        response, system_prompt = await self._engine.respond(
            {"conversation": await self._sessions.dump_conversation(session_id)},
            task,
            utterance,
        )

        await self._sessions.append_conversation(
            session_id,
            {"role": "user", "content": utterance, "created_at": time.time()},
        )
        await self._sessions.append_conversation(
            session_id,
            {"role": "assistant", "content": response, "created_at": time.time()},
        )
        await self._sessions.append_transcript(
            session_id,
            {
                "speaker": "agent",
                "content": response,
                "created_at": time.time(),
            },
        )

        await self._persist_messages(session_id)

        await self._ws.broadcast(
            session.task_id,
            {
                "type": "transcript_update",
                "data": {
                    "speaker": "agent",
                    "content": response,
                    "system_prompt": system_prompt,
                },
            },
        )

        return response

    async def stream_agent_thinking(self, task_id: str, text: str) -> None:
        await self._ws.broadcast(task_id, {"type": "agent_thinking", "data": {"delta": text}})

    async def _persist_messages(self, session_id: str) -> None:
        session = await self._sessions.get(session_id)
        if not session:
            return

        call_dir: Path = self._store.get_task_dir(session.task_id)
        with open(call_dir / "conversation.json", "w", encoding="utf-8") as f:
            json.dump(session.conversation, f, indent=2)
        with open(call_dir / "transcript.json", "w", encoding="utf-8") as f:
            json.dump(session.transcript, f, indent=2)

    async def save_audio_chunk(self, session_id: str, side: str, chunk: bytes) -> None:
        session = await self._sessions.get(session_id)
        if not session:
            return
        filename = "inbound.wav" if side == "caller" else "outbound.wav"
        call_dir = self._store.get_task_dir(session.task_id)
        with open(call_dir / filename, "ab") as f:
            f.write(chunk)

    async def stop_session(self, session_id: str) -> None:
        session = await self._sessions.get(session_id)
        if not session:
            return
        await self._sessions.set_status(session_id, "ended")
        await self._store.update_status(session.task_id, "ended")
        await self._store.update_duration(session.task_id, await self._sessions.get_duration_seconds(session_id))
        await self._store.update_ended_at(session.task_id)
        await self._ws.broadcast(
            session.task_id,
            {"type": "call_status", "data": {"status": "ended", "session_id": session_id}},
        )
