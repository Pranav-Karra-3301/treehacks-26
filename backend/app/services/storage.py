from __future__ import annotations

import base64
import json
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from app.core.config import settings
from app.core.telemetry import log_event
from app.core.telemetry import timed_step
from app.services.call_artifact_supabase import SupabaseCallArtifactSync
from app.services.call_sync_supabase import SupabaseCallSync
from app.services.chat_session_supabase import SupabaseChatSessionSync
from app.models.schemas import CallOutcome, CallStatus


class DataStore:
    """Supabase-backed task metadata and call artifact storage."""

    def __init__(self, **_kwargs: Any) -> None:
        self._call_sync: Optional[SupabaseCallSync] = None
        self._call_artifact_sync: Optional[SupabaseCallArtifactSync] = None
        self._chat_session_sync: Optional[SupabaseChatSessionSync] = None
        # Prefer service_role key (bypasses RLS) over anon key for server-side access
        _supabase_key = settings.SUPABASE_SERVICE_ROLE_KEY or settings.SUPABASE_ANON_KEY
        if (
            settings.SUPABASE_CALLS_ENABLED
            and settings.SUPABASE_URL
            and _supabase_key
        ):
            self._call_sync = SupabaseCallSync(
                base_url=settings.SUPABASE_URL,
                anon_key=_supabase_key,
                table=settings.SUPABASE_CALLS_TABLE,
            )
        if (
            settings.SUPABASE_CALL_ARTIFACTS_ENABLED
            and settings.SUPABASE_URL
            and _supabase_key
        ):
            self._call_artifact_sync = SupabaseCallArtifactSync(
                base_url=settings.SUPABASE_URL,
                anon_key=_supabase_key,
                table=settings.SUPABASE_CALL_ARTIFACTS_TABLE,
            )
        if (
            settings.SUPABASE_CHAT_SESSIONS_ENABLED
            and settings.SUPABASE_URL
            and _supabase_key
        ):
            self._chat_session_sync = SupabaseChatSessionSync(
                base_url=settings.SUPABASE_URL,
                anon_key=_supabase_key,
                table=settings.SUPABASE_CHAT_SESSIONS_TABLE,
            )

        if not self._call_sync and not self._chat_session_sync and not self._call_artifact_sync:
            log_event(
                "storage",
                "no_supabase_configured",
                status="warning",
                details={"message": "No Supabase sync configured. Data will not persist."},
            )

    # ── Tasks (calls) ───────────────────────────────────────────────────────

    def create_task(self, task_id: str, payload: Dict[str, str]) -> None:
        with timed_step("storage", "create_task", task_id=task_id, details={"target_phone": payload.get("target_phone")}):
            now = datetime.utcnow().isoformat()
            row = self._build_call_row(
                task_id=task_id,
                payload=payload,
                status="pending",
                outcome="unknown",
                created_at=now,
                updated_at=now,
            )
            if self._call_sync is not None:
                self._call_sync.upsert(row)

    def update_status(self, task_id: str, status: CallStatus, outcome: Optional[CallOutcome] = None) -> None:
        with timed_step("storage", "update_status", task_id=task_id, details={"status": status, "outcome": outcome}):
            updates: Dict[str, Any] = {
                "status": status,
                "updated_at": datetime.utcnow().isoformat(),
            }
            if outcome is not None:
                updates["outcome"] = outcome
            self._update_task_in_supabase(task_id, updates)

    def update_ended_at(self, task_id: str, ended_at: Optional[datetime] = None) -> None:
        with timed_step("storage", "update_ended_at", task_id=task_id):
            now = datetime.utcnow().isoformat()
            ended_value = (ended_at or datetime.utcnow()).isoformat()
            self._update_task_in_supabase(task_id, {"ended_at": ended_value, "updated_at": now})

    def update_duration(self, task_id: str, seconds: int) -> None:
        with timed_step("storage", "update_duration", task_id=task_id, details={"seconds": seconds}):
            now = datetime.utcnow().isoformat()
            self._update_task_in_supabase(task_id, {"duration_seconds": seconds, "updated_at": now})

    def list_tasks(self) -> List[Dict]:
        with timed_step("storage", "list_tasks"):
            if self._call_sync is None:
                return []
            rows = self._call_sync.list()
            return [self._normalize_call_row(r) for r in rows]

    def get_task(self, task_id: str) -> Optional[Dict]:
        with timed_step("storage", "get_task", task_id=task_id):
            if self._call_sync is None:
                return None
            row = self._call_sync.get(task_id)
            if row is None:
                return None
            return self._normalize_call_row(row)

    def delete_task(self, task_id: str) -> bool:
        """Delete a task and its artifacts from Supabase, and scrub from chat sessions."""
        with timed_step("storage", "delete_task", task_id=task_id):
            if self._call_sync is not None:
                self._call_sync.delete(task_id)
            if self._call_artifact_sync is not None:
                self._call_artifact_sync.delete(task_id)

            # Remove the task ID from any chat sessions that reference it
            self._remove_task_from_chat_sessions(task_id)

            log_event(
                "storage",
                "task_deleted",
                task_id=task_id,
            )
            return True

    def _remove_task_from_chat_sessions(self, task_id: str) -> None:
        """Scrub a deleted task ID from all chat sessions that reference it."""
        if self._chat_session_sync is None:
            return
        try:
            sessions = self._chat_session_sync.list_containing_task(task_id)
            for session in sessions:
                session_id = session.get("session_id")
                if not session_id:
                    continue
                old_ids = list(session.get("task_ids") or [])
                new_ids = [tid for tid in old_ids if tid != task_id]
                if len(new_ids) == len(old_ids):
                    continue  # wasn't actually in there
                # Also scrub from the snapshot inside data
                data = dict(session.get("data") or {})
                snapshot = data.get("snapshot")
                if isinstance(snapshot, dict):
                    snap_task_ids = snapshot.get("taskIds")
                    if isinstance(snap_task_ids, list) and task_id in snap_task_ids:
                        snapshot["taskIds"] = [tid for tid in snap_task_ids if tid != task_id]
                        data["snapshot"] = snapshot
                self.upsert_chat_session(
                    session_id,
                    mode=str(session.get("mode") or "single"),
                    revision=int(session.get("revision") or 0) + 1,
                    run_id=session.get("run_id"),
                    task_ids=new_ids,
                    data=data,
                )
                log_event(
                    "storage",
                    "task_scrubbed_from_session",
                    task_id=task_id,
                    details={"session_id": session_id, "remaining_tasks": len(new_ids)},
                )
        except Exception as exc:
            log_event(
                "storage",
                "task_scrub_sessions_error",
                task_id=task_id,
                status="warning",
                details={"error": f"{type(exc).__name__}: {exc}"},
            )

    def _update_task_in_supabase(self, task_id: str, updates: Dict[str, Any]) -> None:
        if self._call_sync is None:
            return
        existing = self._call_sync.get(task_id)
        if existing is None:
            return
        row = self._normalize_call_row(existing)
        row.update(updates)
        self._call_sync.upsert(row)

    # ── Call artifacts ──────────────────────────────────────────────────────

    def upsert_call_artifacts_direct(
        self,
        task_id: str,
        *,
        transcript: Optional[List[Dict[str, Any]]] = None,
        analysis: Optional[Dict[str, Any]] = None,
        recording: Optional[Dict[str, Any]] = None,
        audio_buffers: Optional[Dict[str, bytearray]] = None,
        mixed_audio: Optional[bytes] = None,
        call_control: Optional[Dict[str, Any]] = None,
        reason: str = "direct",
    ) -> Optional[Dict[str, Any]]:
        """Write call artifacts directly to Supabase from in-memory data."""
        with timed_step(
            "storage",
            "upsert_call_artifacts_direct",
            task_id=task_id,
            details={"reason": reason},
        ):
            now = datetime.utcnow().isoformat()
            existing: Optional[Dict[str, Any]] = None
            if self._call_artifact_sync is not None:
                existing = self._call_artifact_sync.get(task_id)

            merged_recording = dict(recording or {})
            if call_control:
                merged_recording["call_control"] = call_control

            audio_payload = self._build_audio_payload_from_memory(
                audio_buffers=audio_buffers,
                mixed_audio=mixed_audio,
            )

            row: Dict[str, Any] = {
                "task_id": task_id,
                "transcript": transcript or [],
                "analysis": analysis or {},
                "recording": merged_recording,
                "audio_payload": audio_payload,
                "created_at": existing.get("created_at") if existing else now,
                "updated_at": now,
            }
            if self._call_artifact_sync is not None:
                self._call_artifact_sync.upsert(row)

            return self._decode_call_artifact_row(row)

    def upsert_call_artifact_partial(
        self,
        task_id: str,
        *,
        transcript: Optional[List[Dict[str, Any]]] = None,
        analysis: Optional[Dict[str, Any]] = None,
        recording: Optional[Dict[str, Any]] = None,
        reason: str = "partial",
    ) -> Optional[Dict[str, Any]]:
        """Merge partial updates into an existing call artifact row in Supabase."""
        with timed_step(
            "storage",
            "upsert_call_artifact_partial",
            task_id=task_id,
            details={"reason": reason},
        ):
            if self._call_artifact_sync is None:
                return None
            now = datetime.utcnow().isoformat()
            existing = self._call_artifact_sync.get(task_id)
            if existing is None:
                existing = {}

            row: Dict[str, Any] = {
                "task_id": task_id,
                "transcript": transcript if transcript is not None else existing.get("transcript", []),
                "analysis": analysis if analysis is not None else existing.get("analysis", {}),
                "recording": recording if recording is not None else existing.get("recording", {}),
                "audio_payload": existing.get("audio_payload", {}),
                "created_at": existing.get("created_at") or now,
                "updated_at": now,
            }
            self._call_artifact_sync.upsert(row)
            return self._decode_call_artifact_row(row)

    def get_call_artifact(self, task_id: str) -> Optional[Dict[str, Any]]:
        with timed_step("storage", "get_call_artifact", task_id=task_id):
            if self._call_artifact_sync is None:
                return None
            row = self._call_artifact_sync.get(task_id)
            if row is None:
                return None
            return self._decode_call_artifact_row(row)

    def _build_audio_payload_from_memory(
        self,
        *,
        audio_buffers: Optional[Dict[str, bytearray]] = None,
        mixed_audio: Optional[bytes] = None,
    ) -> Dict[str, Any]:
        """Base64-encode in-memory audio bytearrays for Supabase storage."""
        payload: Dict[str, Any] = {}
        max_bytes = settings.SUPABASE_CALL_ARTIFACT_MAX_AUDIO_BYTES

        sources: Dict[str, bytes] = {}
        if audio_buffers:
            if "inbound" in audio_buffers:
                sources["inbound"] = bytes(audio_buffers["inbound"])
            if "outbound" in audio_buffers:
                sources["outbound"] = bytes(audio_buffers["outbound"])
        if mixed_audio:
            sources["mixed"] = mixed_audio

        for side, raw in sources.items():
            if not raw:
                continue
            entry: Dict[str, Any] = {
                "file_name": f"{side}.wav",
                "mime_type": "audio/wav",
                "byte_count": len(raw),
                "encoding": "base64",
                "truncated": False,
            }
            if len(raw) > max_bytes:
                entry["truncated"] = True
                entry["payload_b64"] = ""
                entry["truncated_reason"] = f"file_exceeds_limit:{max_bytes}"
            else:
                entry["payload_b64"] = base64.b64encode(raw).decode("ascii")
            payload[side] = entry
        return payload

    # ── Chat sessions ───────────────────────────────────────────────────────

    def upsert_chat_session(
        self,
        session_id: str,
        *,
        mode: str,
        revision: int,
        run_id: Optional[str],
        task_ids: List[str],
        data: Dict[str, Any],
    ) -> Dict[str, Any]:
        with timed_step(
            "storage",
            "upsert_chat_session",
            details={"session_id": session_id, "mode": mode, "revision": revision},
        ):
            now = datetime.utcnow().isoformat()
            row = {
                "session_id": session_id,
                "mode": mode,
                "revision": int(revision),
                "run_id": run_id,
                "task_ids": task_ids or [],
                "data": data or {},
                "created_at": now,
                "updated_at": now,
            }

            if self._chat_session_sync is not None:
                # Check existing to preserve created_at
                existing = self._chat_session_sync.get(session_id)
                if existing:
                    existing_revision = int(existing.get("revision") or 0)
                    if revision < existing_revision:
                        return existing
                    row["created_at"] = existing.get("created_at") or now
                self._chat_session_sync.upsert({
                    "session_id": session_id,
                    "mode": mode,
                    "revision": int(revision),
                    "run_id": run_id,
                    "task_ids": task_ids or [],
                    "payload": data or {},
                    "created_at": row["created_at"],
                    "updated_at": now,
                })

            return row

    def patch_chat_session(
        self,
        session_id: str,
        *,
        revision: Optional[int] = None,
        run_id: Optional[str] = None,
        task_ids: Optional[List[str]] = None,
        data: Optional[Dict[str, Any]] = None,
    ) -> Optional[Dict[str, Any]]:
        with timed_step("storage", "patch_chat_session", details={"session_id": session_id}):
            current = self.get_chat_session(session_id)
            if not current:
                return None
            next_revision = int(revision if revision is not None else current.get("revision", 0))
            next_run_id = run_id if run_id is not None else current.get("run_id")
            next_task_ids = task_ids if task_ids is not None else list(current.get("task_ids", []))
            next_data = data if data is not None else dict(current.get("data", {}))
            return self.upsert_chat_session(
                session_id,
                mode=str(current.get("mode") or "single"),
                revision=next_revision,
                run_id=next_run_id,
                task_ids=next_task_ids,
                data=next_data,
            )

    def get_chat_session(self, session_id: str) -> Optional[Dict[str, Any]]:
        with timed_step("storage", "get_chat_session", details={"session_id": session_id}):
            if self._chat_session_sync is None:
                return None
            row = self._chat_session_sync.get(session_id)
            return row

    def get_latest_chat_session(self, mode: Optional[str] = None) -> Optional[Dict[str, Any]]:
        with timed_step("storage", "get_latest_chat_session", details={"mode": mode}):
            if self._chat_session_sync is None:
                return None
            return self._chat_session_sync.get_latest(mode=mode)

    def touch_chat_session(self, session_id: str) -> Optional[Dict[str, Any]]:
        with timed_step("storage", "touch_chat_session", details={"session_id": session_id}):
            current = self.get_chat_session(session_id)
            if current is None:
                return None
            return self.upsert_chat_session(
                session_id,
                mode=str(current.get("mode") or "single"),
                revision=int(current.get("revision") or 0),
                run_id=current.get("run_id"),
                task_ids=list(current.get("task_ids") or []),
                data=dict(current.get("data") or {}),
            )

    def delete_chat_session(self, session_id: str) -> bool:
        with timed_step("storage", "delete_chat_session", details={"session_id": session_id}):
            if self._chat_session_sync is None:
                return False
            return self._chat_session_sync.delete(session_id)

    # ── Helpers ─────────────────────────────────────────────────────────────

    def _build_call_row(
        self,
        task_id: str,
        payload: Dict[str, str],
        *,
        status: str,
        outcome: str,
        created_at: Optional[str] = None,
        ended_at: Optional[str] = None,
        updated_at: Optional[str] = None,
        duration_seconds: int = 0,
    ) -> Dict[str, Any]:
        now = datetime.utcnow().isoformat()
        if created_at is None:
            created_at = now
        if updated_at is None:
            updated_at = created_at
        return {
            "id": task_id,
            "task_type": payload["task_type"],
            "target_phone": payload["target_phone"],
            "objective": payload["objective"],
            "context": payload.get("context", ""),
            "run_id": payload.get("run_id"),
            "run_mode": payload.get("run_mode"),
            "location": payload.get("location"),
            "target_name": payload.get("target_name"),
            "target_url": payload.get("target_url"),
            "target_source": payload.get("target_source"),
            "target_snippet": payload.get("target_snippet"),
            "target_outcome": payload.get("target_outcome"),
            "walkaway_point": payload.get("walkaway_point"),
            "agent_persona": payload.get("agent_persona"),
            "opening_line": payload.get("opening_line"),
            "style": payload.get("style", "collaborative"),
            "status": status,
            "outcome": outcome,
            "duration_seconds": int(duration_seconds),
            "created_at": created_at,
            "ended_at": ended_at,
            "updated_at": updated_at,
        }

    def _normalize_call_row(self, row: Dict[str, Any]) -> Dict[str, Any]:
        created_at = row.get("created_at")
        return {
            "id": row.get("id"),
            "task_type": row.get("task_type", "custom"),
            "target_phone": row.get("target_phone", ""),
            "objective": row.get("objective", ""),
            "context": row.get("context", ""),
            "run_id": row.get("run_id"),
            "run_mode": row.get("run_mode"),
            "location": row.get("location"),
            "target_name": row.get("target_name"),
            "target_url": row.get("target_url"),
            "target_source": row.get("target_source"),
            "target_snippet": row.get("target_snippet"),
            "target_outcome": row.get("target_outcome"),
            "walkaway_point": row.get("walkaway_point"),
            "agent_persona": row.get("agent_persona"),
            "opening_line": row.get("opening_line"),
            "style": row.get("style", "collaborative"),
            "status": row.get("status") or "pending",
            "outcome": row.get("outcome") or "unknown",
            "duration_seconds": int(row.get("duration_seconds") or 0),
            "created_at": created_at,
            "ended_at": row.get("ended_at"),
            "updated_at": row.get("updated_at") or created_at,
        }

    def _decode_call_artifact_row(self, row: Dict[str, Any]) -> Dict[str, Any]:
        task_id = row.get("task_id")
        transcript = self._coerce_json_array(row.get("transcript_json"))
        analysis = self._coerce_json_object(row.get("analysis_json"))
        recording = self._coerce_json_object(row.get("recording_json"))
        audio_payload = self._coerce_json_object(row.get("audio_payload_json"))

        # Accept already-decoded dictionaries from Supabase sync clients.
        if isinstance(row.get("transcript"), list):
            transcript = list(row.get("transcript", []))
        if isinstance(row.get("analysis"), dict):
            analysis = dict(row.get("analysis", {}))
        if isinstance(row.get("recording"), dict):
            recording = dict(row.get("recording", {}))
        if isinstance(row.get("audio_payload"), dict):
            audio_payload = dict(row.get("audio_payload", {}))

        return {
            "task_id": task_id,
            "transcript": transcript,
            "analysis": analysis,
            "recording": recording,
            "audio_payload": audio_payload,
            "created_at": row.get("created_at"),
            "updated_at": row.get("updated_at"),
        }

    @staticmethod
    def _coerce_json_array(value: Any) -> List[Any]:
        if isinstance(value, list):
            return value
        if isinstance(value, str):
            try:
                parsed = json.loads(value)
            except Exception:
                return []
            return parsed if isinstance(parsed, list) else []
        return []

    @staticmethod
    def _coerce_json_object(value: Any) -> Dict[str, Any]:
        if isinstance(value, dict):
            return value
        if isinstance(value, str):
            try:
                parsed = json.loads(value)
            except Exception:
                return {}
            if isinstance(parsed, dict):
                return parsed
            return {}
        return {}
