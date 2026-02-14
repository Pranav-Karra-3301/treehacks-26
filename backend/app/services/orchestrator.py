from __future__ import annotations

import asyncio
import base64
import json
from datetime import datetime
import time
from pathlib import Path
from typing import Any, Dict, Optional

from app.core.config import settings
from app.services.deepgram_voice_agent import DeepgramVoiceAgentSession
from app.services.llm_client import LLMClient
from app.services.negotiation_engine import NegotiationEngine
from app.services.session_manager import SessionManager
from app.services.storage import DataStore
from app.services.twilio_client import TwilioClient
from app.services.ws_manager import ConnectionManager
from app.core.telemetry import log_event, timed_step


class CallOrchestrator:
    """Coordinate call lifecycle, voice-LLM sessions, and transcript persistence."""

    _END_STATUSES = {"completed", "failed", "busy", "no-answer", "canceled"}

    def __init__(
        self,
        store: DataStore,
        sessions: SessionManager,
        ws_manager: ConnectionManager,
        *,
        llm_client: Optional[LLMClient] = None,
        twilio_client: Optional[TwilioClient] = None,
    ) -> None:
        self._store = store
        self._sessions = sessions
        self._ws = ws_manager
        self._llm = llm_client or LLMClient()
        self._engine = NegotiationEngine(self._llm)
        self._twilio = twilio_client or TwilioClient()

        self._task_to_session: dict[str, str] = {}
        self._task_to_media_ws: dict[str, Any] = {}
        self._task_to_stream_sid: dict[str, str] = {}
        self._task_to_call_sid: dict[str, str] = {}
        self._call_sid_to_task: dict[str, str] = {}
        self._deepgram_sessions: dict[str, DeepgramVoiceAgentSession] = {}

        self._audio_stats: Dict[str, Dict[str, Any]] = {}
        self._voice_session_lock = asyncio.Lock()

    def _session_recording_path(self, task_id: str) -> Path:
        return self._store.get_task_dir(task_id) / "recording_stats.json"

    def _voice_mode_enabled(self) -> bool:
        return settings.DEEPGRAM_VOICE_AGENT_ENABLED and bool(settings.DEEPGRAM_API_KEY)

    def _clear_task_call_sid(self, task_id: str) -> None:
        call_sid = self._task_to_call_sid.pop(task_id, None)
        if call_sid:
            self._call_sid_to_task.pop(call_sid, None)

    async def start_task_call(self, task_id: str, task: Dict[str, Any]) -> Dict[str, Any]:
        with timed_step("orchestrator", "start_task_call", task_id=task_id):
            session = await self._sessions.create_session(task_id)
            self._task_to_session[task_id] = session.session_id
            self._audio_stats[session.session_id] = {
                "task_id": task_id,
                "created_at": datetime.utcnow().isoformat(),
                "started_at": datetime.utcnow().isoformat(),
                "bytes_by_side": {"caller": 0, "agent": 0, "mixed": 0},
                "chunks_by_side": {"caller": 0, "agent": 0},
                "last_chunk_at": None,
            }

            with timed_step("session", "set_status_dialing", session_id=session.session_id, task_id=task_id):
                await self._sessions.set_status(session.session_id, "dialing")
                self._store.update_status(task_id, "dialing")

            with timed_step("twilio", "place_call", task_id=task_id):
                call = await self._twilio.place_call(task["target_phone"], task_id)
                call_sid = call.get("sid")
                if call_sid:
                    self._task_to_call_sid[task_id] = call_sid
                    self._call_sid_to_task[call_sid] = task_id

            call_status = str(call.get("status") or "")
            if call_status == "failed":
                failure_reason = str(call.get("error") or "call_failed")
                with timed_step(
                    "orchestrator",
                    "start_task_call_failed",
                    task_id=task_id,
                    session_id=session.session_id,
                    details={"reason": failure_reason},
                ):
                    await self._sessions.set_status(session.session_id, "ended")
                    self._store.update_status(task_id, "failed")
                    self._store.update_ended_at(task_id)
                    await self._ws.broadcast(
                        task_id,
                        {
                            "type": "call_status",
                            "data": {
                                "status": "failed",
                                "session_id": session.session_id,
                                "error": failure_reason,
                            },
                        },
                    )
                return {"session_id": session.session_id, "task_id": task_id, "twilio": call}

            await self._ws.broadcast(
                task_id,
                {"type": "call_status", "data": {"status": "dialing", "session_id": session.session_id}},
            )

            if self._voice_mode_enabled():
                try:
                    await self._start_voice_session(task_id, session.session_id, task)
                except Exception as exc:
                    log_event(
                        "orchestrator",
                        "start_voice_session_failed",
                        task_id=task_id,
                        status="warning",
                        details={"error": f"{type(exc).__name__}: {exc}"},
                    )

            with timed_step("session", "set_status_active", session_id=session.session_id, task_id=task_id):
                await self._sessions.set_status(session.session_id, "active")
                self._store.update_status(task_id, "active")

            await self._ws.broadcast(
                task_id,
                {"type": "call_status", "data": {"status": "active", "session_id": session.session_id}},
            )

            log_event(
                "orchestrator",
                "start_task_call_complete",
                task_id=task_id,
                session_id=session.session_id,
                details={"call_sid": call.get("sid", "n/a"), "call_status": call.get("status")},
            )

            return {"session_id": session.session_id, "task_id": task_id, "twilio": call}

    async def stop_task_call(self, task_id: str, *, from_status_callback: bool = False) -> None:
        with timed_step("orchestrator", "stop_task_call", task_id=task_id):
            call_sid = self._task_to_call_sid.get(task_id)
            session_id = self._task_to_session.get(task_id)
            if session_id:
                await self.stop_session(session_id)
            else:
                self._store.update_status(task_id, "ended")
                self._store.update_ended_at(task_id)

            if not from_status_callback:
                if call_sid:
                    await self._twilio.end_call(call_sid)
            self._clear_task_call_sid(task_id)

    async def get_task_id_for_call_sid(self, call_sid: str) -> Optional[str]:
        return self._call_sid_to_task.get(call_sid)

    def get_task_id_for_session(self, session_id: str) -> Optional[str]:
        for task_id, mapped_session_id in self._task_to_session.items():
            if mapped_session_id == session_id:
                return task_id
        return None

    async def handle_twilio_status(self, task_id: Optional[str], call_sid: Optional[str], status: Optional[str]) -> None:
        if not task_id and call_sid:
            task_id = self._call_sid_to_task.get(call_sid)
            if not task_id:
                # fallback in case callback payload only provides CallSid
                for mapped_task_id, mapped_call_sid in self._task_to_call_sid.items():
                    if mapped_call_sid == call_sid:
                        task_id = mapped_task_id
                        break
        if not task_id:
            log_event(
                "orchestrator",
                "twilio_status_unmatched",
                task_id=task_id,
                details={"call_sid": call_sid, "status": status},
                status="error",
            )
            return

        if not task_id or not status:
            return

        log_event(
            "orchestrator",
            "twilio_status",
            task_id=task_id,
            details={"call_sid": call_sid, "status": status},
        )
        if status in self._END_STATUSES:
            await self.stop_task_call(task_id, from_status_callback=True)

    def get_session_id_for_task(self, task_id: str) -> Optional[str]:
        return self._task_to_session.get(task_id)

    async def register_media_stream(self, task_id: str, websocket: Any, stream_sid: Optional[str] = None) -> None:
        self._task_to_media_ws[task_id] = websocket
        if stream_sid:
            self._task_to_stream_sid[task_id] = stream_sid

    async def unregister_media_stream(self, task_id: str) -> None:
        self._task_to_media_ws.pop(task_id, None)
        self._task_to_stream_sid.pop(task_id, None)

    async def set_media_stream_sid(self, task_id: str, stream_sid: str) -> None:
        self._task_to_stream_sid[task_id] = stream_sid

    async def on_media_chunk(self, task_id: str, chunk: bytes) -> None:
        session_id = self._task_to_session.get(task_id)
        if not session_id or not chunk:
            return

        await self.save_audio_chunk(session_id, "caller", chunk)
        deepgram_session = self._deepgram_sessions.get(session_id)
        if deepgram_session is not None:
            await deepgram_session.send_audio(chunk)

    async def handle_user_utterance(self, session_id: str, utterance: str) -> Optional[str]:
        session = await self._sessions.get(session_id)
        if not session:
            return None
        task = self._store.get_task(session.task_id)
        if not task:
            return None

        with timed_step(
            "orchestrator",
            "handle_user_utterance",
            session_id=session_id,
            task_id=session.task_id,
            details={"utterance_chars": len(utterance)},
        ):
            await self._sessions.append_transcript(
                session_id,
                {"speaker": "caller", "content": utterance, "created_at": time.time()},
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
                {"speaker": "agent", "content": response, "created_at": time.time()},
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

    async def append_turn(
        self,
        task_id: str,
        speaker: str,
        content: str,
        persist: bool = True,
    ) -> None:
        with timed_step(
            "orchestrator",
            "append_turn",
            task_id=task_id,
            details={"speaker": speaker, "content_chars": len(content)},
        ):
            if not content:
                return

            session_id = self._task_to_session.get(task_id)
            if not session_id:
                return

            role = "user" if speaker == "caller" else "assistant"
            now = time.time()
            await self._sessions.append_transcript(
                session_id,
                {"speaker": speaker, "content": content, "created_at": now},
            )
            await self._sessions.append_conversation(
                session_id,
                {"role": role, "content": content, "created_at": now},
            )
            if persist:
                await self._persist_messages(session_id)

            await self._ws.broadcast(
                task_id,
                {"type": "transcript_update", "data": {"speaker": speaker, "content": content}},
            )

    def get_task(self, task_id: str) -> Optional[Dict[str, Any]]:
        return self._store.get_task(task_id)

    async def stream_agent_thinking(self, task_id: str, text: str) -> None:
        with timed_step("orchestrator", "stream_agent_thinking", task_id=task_id, details={"chars": len(text)}):
            await self._ws.broadcast(task_id, {"type": "agent_thinking", "data": {"delta": text}})

    async def _send_agent_audio_to_twilio(self, task_id: str, payload: bytes) -> None:
        websocket = self._task_to_media_ws.get(task_id)
        if not websocket or not payload:
            return

        stream_sid = self._task_to_stream_sid.get(task_id)
        message = {
            "event": "media",
            "media": {"payload": base64.b64encode(payload).decode("ascii")},
        }
        if stream_sid:
            message["streamSid"] = stream_sid

        with timed_step("twilio", "send_media", task_id=task_id, details={"bytes": len(payload)}):
            await websocket.send_text(json.dumps(message))

    async def _start_voice_session(self, task_id: str, session_id: str, task: Dict[str, Any]) -> None:
        if not self._voice_mode_enabled():
            return
        if not task:
            task = self._store.get_task(task_id) or {}
        if not task:
            return

        async with self._voice_session_lock:
            if session_id in self._deepgram_sessions:
                return

            async def on_conversation(speaker: str, content: str) -> None:
                await self.append_turn(task_id, speaker, content)

            async def on_agent_audio(audio: bytes) -> None:
                if not audio:
                    return
                await self.save_audio_chunk(session_id, "agent", audio)
                await self._send_agent_audio_to_twilio(task_id, audio)

            async def on_thinking(text: str) -> None:
                if text:
                    await self.stream_agent_thinking(task_id, text)

            async def on_event(event: Dict[str, Any]) -> None:
                event_type = event.get("type")
                log_event("deepgram", "event", task_id=task_id, details={"type": event_type, "event": event})

            session = DeepgramVoiceAgentSession(
                task_id=task_id,
                task=task,
                on_conversation=on_conversation,
                on_agent_audio=on_agent_audio,
                on_thinking=on_thinking,
                on_event=on_event,
            )
            self._deepgram_sessions[session_id] = session

        await session.start()
        log_event("orchestrator", "deepgram_session_started", task_id=task_id, session_id=session_id)

    async def _stop_voice_session(self, session_id: str) -> None:
        dg_session = self._deepgram_sessions.pop(session_id, None)
        if dg_session is not None:
            await dg_session.stop()

    async def _persist_messages(self, session_id: str) -> None:
        session = await self._sessions.get(session_id)
        if not session:
            return

        call_dir = self._store.get_task_dir(session.task_id)
        with timed_step("storage", "persist_messages", session_id=session_id, task_id=session.task_id):
            with open(call_dir / "conversation.json", "w", encoding="utf-8") as f:
                json.dump(session.conversation, f, indent=2)
            with open(call_dir / "transcript.json", "w", encoding="utf-8") as f:
                json.dump(session.transcript, f, indent=2)

    async def save_audio_chunk(self, session_id: str, side: str, chunk: bytes) -> None:
        if not chunk:
            return
        session = await self._sessions.get(session_id)
        if not session:
            return

        side_key = "agent" if side in {"agent", "outbound"} else side
        filename = "inbound.wav" if side_key == "caller" else "outbound.wav"
        call_dir = self._store.get_task_dir(session.task_id)
        call_dir.mkdir(parents=True, exist_ok=True)
        if side_key not in {"caller", "agent"}:
            side_key = "agent"

        with timed_step(
            "audio",
            "save_audio_chunk",
            session_id=session_id,
            task_id=session.task_id,
            details={"side": side, "bytes": len(chunk)},
        ):
            with open(call_dir / filename, "ab") as f:
                f.write(chunk)
            with open(call_dir / "mixed.wav", "ab") as f:
                f.write(chunk)

            stats = self._audio_stats.setdefault(
                session_id,
                {
                    "task_id": session.task_id,
                    "created_at": datetime.utcnow().isoformat(),
                    "started_at": datetime.utcnow().isoformat(),
                    "bytes_by_side": {"caller": 0, "agent": 0, "mixed": 0},
                    "chunks_by_side": {"caller": 0, "agent": 0},
                    "last_chunk_at": None,
                },
            )
            if side_key in {"caller", "agent"}:
                stats["chunks_by_side"][side_key] = stats["chunks_by_side"].get(side_key, 0) + 1
                stats["bytes_by_side"][side_key] = stats["bytes_by_side"].get(side_key, 0) + len(chunk)
            stats["bytes_by_side"]["mixed"] = stats["bytes_by_side"].get("mixed", 0) + len(chunk)
            stats["last_chunk_at"] = datetime.utcnow().isoformat()

    async def stop_session(self, session_id: str) -> None:
        session = await self._sessions.get(session_id)
        if not session:
            return

        task_id = session.task_id
        with timed_step("orchestrator", "stop_session", session_id=session_id, task_id=task_id):
            await self._stop_voice_session(session_id)
            await self._sessions.set_status(session_id, "ended")
            duration = await self._sessions.get_duration_seconds(session_id)
            self._store.update_duration(task_id, duration)
            self._store.update_status(task_id, "ended")
            self._store.update_ended_at(task_id)
            await self._persist_recording_stats(session_id)
            await self._ws.broadcast(
                task_id,
                {"type": "call_status", "data": {"status": "ended", "session_id": session_id}},
            )

        self._task_to_session.pop(task_id, None)
        self._task_to_media_ws.pop(task_id, None)
        self._task_to_stream_sid.pop(task_id, None)
        self._audio_stats.pop(session_id, None)

    async def _persist_recording_stats(self, session_id: str) -> None:
        session = await self._sessions.get(session_id)
        if not session:
            return
        call_dir = self._store.get_task_dir(session.task_id)
        call_dir.mkdir(parents=True, exist_ok=True)
        stats = self._audio_stats.get(session_id)
        if not stats:
            return

        stats["task_id"] = session.task_id
        if session.started_at:
            stats["started_at"] = session.started_at.isoformat()
        stats["ended_at"] = (session.ended_at or datetime.utcnow()).isoformat()
        stats["duration_seconds"] = int(
            ((session.ended_at or datetime.utcnow()) - (session.started_at or datetime.utcnow())).total_seconds()
        )
        with open(self._session_recording_path(session.task_id), "w", encoding="utf-8") as f:
            json.dump(stats, f, indent=2)
