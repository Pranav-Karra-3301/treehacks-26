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
from app.services.research import ExaSearchService
from app.services.session_manager import SessionManager
from app.services.storage import DataStore
from app.services.twilio_client import TwilioClient
from app.services.ws_manager import ConnectionManager
from app.core.telemetry import log_event, timed_step
from app.models.schemas import TranscriptTurn


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
        self._stream_sid_to_task: dict[str, str] = {}
        self._call_sid_to_task: dict[str, str] = {}
        self._deepgram_sessions: dict[str, DeepgramVoiceAgentSession] = {}
        self._pending_agent_audio: dict[str, list[bytes]] = {}
        self._max_pending_audio_chunks = 100
        self._max_pending_audio_bytes = 960 * 100  # ~12 seconds at mulaw 8kHz

        self._audio_stats: Dict[str, Dict[str, Any]] = {}
        self._voice_session_lock = asyncio.Lock()

    def _session_recording_path(self, task_id: str) -> Path:
        return self._store.get_task_dir(task_id) / "recording_stats.json"

    def _voice_mode_enabled(self) -> bool:
        return settings.DEEPGRAM_VOICE_AGENT_ENABLED and bool(settings.DEEPGRAM_API_KEY)

    def _link_stream_sid(self, task_id: str, stream_sid: Optional[str]) -> None:
        if not task_id or task_id == "unknown" or not stream_sid:
            return
        self._task_to_stream_sid[task_id] = stream_sid
        self._stream_sid_to_task[stream_sid] = task_id

    def _link_call_sid(self, task_id: str, call_sid: Optional[str]) -> None:
        if not task_id or task_id == "unknown" or not call_sid:
            return
        self._task_to_call_sid[task_id] = call_sid
        self._call_sid_to_task[call_sid] = task_id

    def _clear_media_context(self, task_id: str) -> None:
        stream_sid = self._task_to_stream_sid.pop(task_id, None)
        if stream_sid and self._stream_sid_to_task.get(stream_id := stream_sid) == task_id:
            self._stream_sid_to_task.pop(stream_id, None)

    def _clear_task_call_sid(self, task_id: str) -> None:
        call_sid = self._task_to_call_sid.pop(task_id, None)
        if call_sid:
            self._call_sid_to_task.pop(call_sid, None)

    def _buffer_agent_audio(self, task_id: str, payload: bytes) -> None:
        if not payload:
            return

        queue = self._pending_agent_audio.setdefault(task_id, [])
        queue.append(payload)

        evicted = 0
        while len(queue) > self._max_pending_audio_chunks:
            queue.pop(0)
            evicted += 1

        total_bytes = sum(len(chunk) for chunk in queue)
        while total_bytes > self._max_pending_audio_bytes and queue:
            removed = queue.pop(0)
            total_bytes -= len(removed)
            evicted += 1

        if evicted:
            log_event(
                "orchestrator",
                "audio_buffer_eviction",
                task_id=task_id,
                status="warning",
                details={
                    "evicted_chunks": evicted,
                    "queue_depth": len(queue),
                    "queue_bytes": total_bytes,
                },
            )

    async def _flush_pending_agent_audio(self, task_id: str) -> None:
        queue = self._pending_agent_audio.pop(task_id, None)
        if not queue:
            return

        total_bytes = sum(len(chunk) for chunk in queue)
        log_event(
            "orchestrator",
            "audio_buffer_flush",
            task_id=task_id,
            details={
                "chunks": len(queue),
                "total_bytes": total_bytes,
            },
        )
        for chunk in queue:
            await self._send_agent_audio_to_twilio(task_id, chunk)

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
                    self._link_call_sid(task_id, call_sid)

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
                log_event("orchestrator", "voice_session_deferred", task_id=task_id,
                          session_id=session.session_id,
                          details={"reason": "waiting_for_media_stream"})

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

    async def stop_task_call(self, task_id: str, *, from_status_callback: bool = False, stop_reason: str = "unknown") -> None:
        with timed_step("orchestrator", "stop_task_call", task_id=task_id):
            call_sid = self._task_to_call_sid.get(task_id)
            session_id = self._task_to_session.get(task_id)
            if session_id:
                await self.stop_session(session_id, stop_reason=stop_reason)
            else:
                self._store.update_status(task_id, "ended")
                self._store.update_ended_at(task_id)
            self._task_to_media_ws.pop(task_id, None)
            self._clear_media_context(task_id)

            if not from_status_callback:
                if call_sid:
                    try:
                        await self._twilio.end_call(call_sid)
                    except Exception as exc:
                        log_event(
                            "orchestrator",
                            "end_call_warning",
                            task_id=task_id,
                            status="warning",
                            details={"call_sid": call_sid, "error": f"{type(exc).__name__}: {exc}"},
                        )
            self._pending_agent_audio.pop(task_id, None)
            if not from_status_callback:
                self._clear_task_call_sid(task_id)

    async def get_task_id_for_call_sid(self, call_sid: str) -> Optional[str]:
        return self._call_sid_to_task.get(call_sid)

    def get_task_id_for_stream_sid(self, stream_sid: Optional[str]) -> Optional[str]:
        if not stream_sid:
            return None
        return self._stream_sid_to_task.get(stream_sid)

    def get_task_id_for_session(self, session_id: str) -> Optional[str]:
        for task_id, mapped_session_id in self._task_to_session.items():
            if mapped_session_id == session_id:
                return task_id
        return None

    def resolve_task_for_media_event(
        self,
        task_id: str,
        *,
        stream_sid: Optional[str] = None,
        call_sid: Optional[str] = None,
    ) -> tuple[str, str]:
        if task_id and task_id != "unknown" and self._task_to_session.get(task_id):
            return task_id, "direct"
        if call_sid:
            mapped_task = self._call_sid_to_task.get(call_sid)
            if mapped_task:
                return mapped_task, "call_sid"
        if stream_sid:
            mapped_task = self._stream_sid_to_task.get(stream_sid)
            if mapped_task:
                return mapped_task, "stream_sid"
        return task_id or "unknown", "unresolved"

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
            await self.stop_task_call(task_id, from_status_callback=True, stop_reason=f"twilio_{status}")

    def get_session_id_for_task(self, task_id: str) -> Optional[str]:
        return self._task_to_session.get(task_id)

    async def register_media_stream(
        self,
        task_id: str,
        websocket: Any,
        *,
        stream_sid: Optional[str] = None,
        call_sid: Optional[str] = None,
    ) -> None:
        if not task_id or task_id == "unknown":
            return
        self._task_to_media_ws[task_id] = websocket
        self._link_stream_sid(task_id, stream_sid)
        self._link_call_sid(task_id, call_sid)

    async def unregister_media_stream(self, task_id: str) -> None:
        self._task_to_media_ws.pop(task_id, None)
        self._clear_media_context(task_id)

    async def set_media_stream_sid(self, task_id: str, stream_sid: str) -> None:
        self._link_stream_sid(task_id, stream_sid)
        await self._flush_pending_agent_audio(task_id)
        # Start Deepgram now that Twilio media stream is fully ready
        if self._voice_mode_enabled():
            session_id = self._task_to_session.get(task_id)
            if session_id and session_id not in self._deepgram_sessions:
                task = self._store.get_task(task_id) or {}
                try:
                    await self._start_voice_session(task_id, session_id, task)
                except Exception as exc:
                    log_event("orchestrator", "start_voice_session_failed",
                              task_id=task_id, status="warning",
                              details={"error": f"{type(exc).__name__}: {exc}"})

    async def set_media_call_sid(self, task_id: str, call_sid: str) -> None:
        self._link_call_sid(task_id, call_sid)

    async def on_media_chunk(self, task_id: str, chunk: bytes) -> None:
        if task_id == "unknown":
            log_event(
                "orchestrator",
                "media_chunk_unmapped",
                status="warning",
                task_id=task_id,
                details={"reason": "media_stream_task_unknown"},
            )
            return
        session_id = self._task_to_session.get(task_id)
        if not session_id or not chunk:
            if not session_id:
                log_event(
                    "orchestrator",
                    "media_chunk_no_session",
                    status="warning",
                    task_id=task_id,
                )
            return

        await self.save_audio_chunk(session_id, "caller", chunk)
        deepgram_session = self._deepgram_sessions.get(session_id)
        if deepgram_session is not None:
            try:
                await deepgram_session.send_audio(chunk)
            except Exception as exc:
                log_event("orchestrator", "deepgram_send_audio_error",
                          task_id=task_id, session_id=session_id, status="error",
                          details={"error": f"{type(exc).__name__}: {exc}"})
                self._deepgram_sessions.pop(session_id, None)

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
            if task_id != "unknown" and not websocket:
                self._buffer_agent_audio(task_id, payload)
                log_event(
                    "orchestrator",
                    "agent_audio_queued",
                    status="warning",
                    task_id=task_id,
                    details={"reason": "media_stream_missing", "bytes": len(payload), "queued_chunks": len(self._pending_agent_audio.get(task_id, []))},
                )
            elif task_id == "unknown":
                log_event(
                    "orchestrator",
                    "agent_audio_send_skipped",
                    status="warning",
                    task_id=task_id,
                    details={"reason": "invalid_task_id", "bytes": len(payload)},
                )
            return

        stream_sid = self._task_to_stream_sid.get(task_id)
        if not stream_sid:
            self._buffer_agent_audio(task_id, payload)
            return
        message = {
            "event": "media",
            "streamSid": stream_sid,
            "media": {"payload": base64.b64encode(payload).decode("ascii")},
        }

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

            async def on_research(query: str) -> Dict[str, Any]:
                exa = ExaSearchService()
                return await exa.search(query, limit=3)

            session = DeepgramVoiceAgentSession(
                task_id=task_id,
                task=task,
                on_conversation=on_conversation,
                on_agent_audio=on_agent_audio,
                on_thinking=on_thinking,
                on_event=on_event,
                on_research=on_research,
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

        # Write to individual track file only (mixed is created at call end)
        with open(call_dir / filename, "ab") as f:
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
        stats["last_chunk_at"] = datetime.utcnow().isoformat()

    def _create_mixed_audio(self, task_id: str) -> None:
        """Mix inbound and outbound mulaw streams into a single mixed.wav file.

        Decodes both streams from mulaw to 16-bit linear PCM, sums them
        sample-by-sample (with clipping), then re-encodes to mulaw.
        This produces a proper two-party mix instead of concatenating chunks.
        """
        call_dir = self._store.get_task_dir(task_id)
        inbound_path = call_dir / "inbound.wav"
        outbound_path = call_dir / "outbound.wav"
        mixed_path = call_dir / "mixed.wav"

        inbound_raw = inbound_path.read_bytes() if inbound_path.exists() else b""
        outbound_raw = outbound_path.read_bytes() if outbound_path.exists() else b""

        log_event(
            "orchestrator",
            "create_mixed_audio",
            task_id=task_id,
            details={
                "inbound_bytes": len(inbound_raw),
                "outbound_bytes": len(outbound_raw),
                "inbound_exists": inbound_path.exists(),
                "outbound_exists": outbound_path.exists(),
            },
        )

        # Strip any existing RIFF header (shouldn't be there, but be safe)
        if inbound_raw[:4] == b"RIFF":
            inbound_raw = inbound_raw[44:]  # skip standard WAV header
        if outbound_raw[:4] == b"RIFF":
            outbound_raw = outbound_raw[44:]

        if not inbound_raw and not outbound_raw:
            return

        # Mulaw decode table (ITU G.711)
        def _build_mulaw_decode_table():
            table = []
            for byte_val in range(256):
                complement = ~byte_val & 0xFF
                sign = (complement & 0x80) >> 7
                exponent = (complement & 0x70) >> 4
                mantissa = complement & 0x0F
                magnitude = ((mantissa << 1) + 33) << (exponent + 2)
                magnitude -= 132
                sample = -magnitude if sign else magnitude
                table.append(max(-32768, min(32767, sample)))
            return table

        decode_table = _build_mulaw_decode_table()

        # Mulaw encode: linear 16-bit → mulaw byte
        _MULAW_BIAS = 132
        _MULAW_CLIP = 32635

        def _encode_mulaw_sample(sample: int) -> int:
            sign = 0
            if sample < 0:
                sign = 0x80
                sample = -sample
            sample = min(sample, _MULAW_CLIP)
            sample += _MULAW_BIAS
            exponent = 7
            exp_mask = 0x4000
            while exponent > 0 and not (sample & exp_mask):
                exponent -= 1
                exp_mask >>= 1
            mantissa = (sample >> (exponent + 3)) & 0x0F
            return ~(sign | (exponent << 4) | mantissa) & 0xFF

        # Pad shorter stream with mulaw silence (0xFF)
        max_len = max(len(inbound_raw), len(outbound_raw))
        if len(inbound_raw) < max_len:
            inbound_raw += b"\xff" * (max_len - len(inbound_raw))
        if len(outbound_raw) < max_len:
            outbound_raw += b"\xff" * (max_len - len(outbound_raw))

        # Mix: decode → sum → clip → encode
        mixed = bytearray(max_len)
        for i in range(max_len):
            pcm_in = decode_table[inbound_raw[i]]
            pcm_out = decode_table[outbound_raw[i]]
            combined = max(-32768, min(32767, pcm_in + pcm_out))
            mixed[i] = _encode_mulaw_sample(combined)

        mixed_path.write_bytes(bytes(mixed))

        # Update mixed byte count in stats
        for sid, stats in self._audio_stats.items():
            if stats.get("task_id") == task_id:
                stats["bytes_by_side"]["mixed"] = max_len
                break

    async def stop_session(self, session_id: str, *, stop_reason: str = "unknown") -> None:
        session = await self._sessions.get(session_id)
        if not session:
            return

        task_id = session.task_id
        with timed_step("orchestrator", "stop_session", session_id=session_id, task_id=task_id):
            await self._stop_voice_session(session_id)
            # Allow any in-flight audio writes to flush before mixing
            await asyncio.sleep(0.5)
            await self._sessions.set_status(session_id, "ended")
            duration = await self._sessions.get_duration_seconds(session_id)
            self._store.update_duration(task_id, duration)
            self._store.update_status(task_id, "ended")
            self._store.update_ended_at(task_id)
            stats = self._audio_stats.get(session_id)
            if stats is not None:
                stats["stop_reason"] = stop_reason
            await self._persist_recording_stats(session_id)
            self._create_mixed_audio(task_id)
            await self._ws.broadcast(
                task_id,
                {"type": "call_status", "data": {"status": "ended", "session_id": session_id}},
            )

        self._clear_media_context(task_id)
        self._task_to_media_ws.pop(task_id, None)
        self._task_to_session.pop(task_id, None)
        self._clear_task_call_sid(task_id)
        self._audio_stats.pop(session_id, None)

        # Auto-generate analysis in background so outcome is always set
        asyncio.create_task(self._auto_analyze(task_id))

    async def _auto_analyze(self, task_id: str) -> None:
        """Generate analysis and persist outcome immediately after call ends."""
        try:
            with timed_step("orchestrator", "auto_analyze", task_id=task_id):
                call_dir = self._store.get_task_dir(task_id)
                transcript_file = call_dir / "transcript.json"
                transcript = []
                if transcript_file.exists():
                    with open(transcript_file, "r", encoding="utf-8") as f:
                        transcript = [TranscriptTurn(**entry) for entry in json.load(f)]

                task = self._store.get_task(task_id)
                analysis = await self._engine.summarize_turn(transcript, task)

                analysis_path = call_dir / "analysis.json"
                with open(analysis_path, "w", encoding="utf-8") as f:
                    json.dump(analysis, f, indent=2)

                outcome = analysis.get("outcome", "unknown")
                valid = {"unknown", "success", "partial", "failed", "walkaway"}
                outcome = outcome if outcome in valid else "unknown"
                self._store.update_status(task_id, "ended", outcome=outcome)
                log_event("orchestrator", "auto_analyze_done", task_id=task_id, details={"outcome": outcome})
        except Exception as exc:
            log_event("orchestrator", "auto_analyze_error", task_id=task_id, details={"error": str(exc)})

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

        # Transcript completeness
        stats["transcript_turns"] = len(session.transcript)
        if session.transcript:
            last_at = session.transcript[-1].get("created_at")
            stats["last_turn_at"] = (
                datetime.utcfromtimestamp(float(last_at)).isoformat()
                if isinstance(last_at, (int, float)) else str(last_at) if last_at else None
            )
        else:
            stats["last_turn_at"] = None

        # Twilio correlation IDs (persist runs BEFORE _clear_*)
        task_id = session.task_id
        stats["call_sid"] = self._task_to_call_sid.get(task_id)
        stats["stream_sid"] = self._task_to_stream_sid.get(task_id)
        stats["stop_reason"] = stats.get("stop_reason", "unknown")

        # Deepgram session counters
        dg = self._deepgram_sessions.get(session_id)
        if dg is not None:
            stats["deepgram"] = {
                "audio_chunks_sent": getattr(dg, "_audio_chunks_sent", 0),
                "audio_bytes_sent": getattr(dg, "_audio_bytes_sent", 0),
                "audio_chunks_received": getattr(dg, "_audio_chunks_received", 0),
                "audio_bytes_received": getattr(dg, "_audio_bytes_received", 0),
                "messages_received": getattr(dg, "_messages_received", 0),
            }

        with open(self._session_recording_path(session.task_id), "w", encoding="utf-8") as f:
            json.dump(stats, f, indent=2)
