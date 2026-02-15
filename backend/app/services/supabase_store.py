from __future__ import annotations

import json
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List, Optional

from app.core.config import settings
from app.core.telemetry import timed_step
from app.models.schemas import CallOutcome, CallStatus


class SupabaseStore:
    """Supabase-backed metadata store replacing SQLite + filesystem artifacts."""

    def __init__(self) -> None:
        from supabase import create_client

        # Use service_role key (bypasses RLS) if available, else anon key
        key = settings.SUPABASE_SERVICE_ROLE_KEY or settings.SUPABASE_ANON_KEY
        self._client = create_client(settings.SUPABASE_URL, key)
        # Local temp dir for audio chunks during live calls
        self._data_root = settings.DATA_ROOT
        self._data_root.mkdir(parents=True, exist_ok=True)

    # ------------------------------------------------------------------ #
    #  Supabase Storage — audio recordings                                 #
    # ------------------------------------------------------------------ #

    _AUDIO_BUCKET = "call-recordings"

    def ensure_audio_bucket(self) -> None:
        """Create the audio bucket if it doesn't already exist."""
        try:
            self._client.storage.get_bucket(self._AUDIO_BUCKET)
        except Exception:
            self._client.storage.create_bucket(
                self._AUDIO_BUCKET,
                options={"public": False},
            )

    def upload_audio(self, task_id: str, filename: str, data: bytes) -> None:
        """Upload audio bytes to call-recordings/{task_id}/{filename}."""
        path = f"{task_id}/{filename}"
        self._client.storage.from_(self._AUDIO_BUCKET).upload(
            path,
            data,
            file_options={"content-type": "audio/wav", "upsert": "true"},
        )

    def download_audio(self, task_id: str, filename: str) -> bytes | None:
        """Download audio from storage. Returns None if not found."""
        path = f"{task_id}/{filename}"
        try:
            return self._client.storage.from_(self._AUDIO_BUCKET).download(path)
        except Exception:
            return None

    def audio_exists(self, task_id: str, filename: str) -> bool:
        """Check if an audio file exists in storage."""
        try:
            files = self._client.storage.from_(self._AUDIO_BUCKET).list(task_id)
            return any(f.get("name") == filename for f in (files or []))
        except Exception:
            return False

    # ------------------------------------------------------------------ #
    #  calls table                                                         #
    # ------------------------------------------------------------------ #

    def create_task(self, task_id: str, payload: Dict[str, str]) -> None:
        with timed_step("storage", "create_task", task_id=task_id, details={"target_phone": payload.get("target_phone")}):
            now = datetime.utcnow().isoformat()
            row = {
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
                "status": "pending",
                "outcome": "unknown",
                "created_at": now,
                "updated_at": now,
            }
            self._client.table("calls").insert(row).execute()

    def update_status(self, task_id: str, status: CallStatus, outcome: Optional[CallOutcome] = None) -> None:
        with timed_step("storage", "update_status", task_id=task_id, details={"status": status, "outcome": outcome}):
            update: Dict[str, Any] = {"status": status, "updated_at": datetime.utcnow().isoformat()}
            if outcome is not None:
                update["outcome"] = outcome
            self._client.table("calls").update(update).eq("id", task_id).execute()

    def update_ended_at(self, task_id: str, ended_at: Optional[datetime] = None) -> None:
        with timed_step("storage", "update_ended_at", task_id=task_id):
            ended_value = (ended_at or datetime.utcnow()).isoformat()
            self._client.table("calls").update({
                "ended_at": ended_value,
                "updated_at": datetime.utcnow().isoformat(),
            }).eq("id", task_id).execute()

    def update_duration(self, task_id: str, seconds: int) -> None:
        with timed_step("storage", "update_duration", task_id=task_id, details={"seconds": seconds}):
            self._client.table("calls").update({
                "duration_seconds": seconds,
                "updated_at": datetime.utcnow().isoformat(),
            }).eq("id", task_id).execute()

    def mark_stale_calls_ended(self) -> int:
        """Mark any active/dialing calls as ended (server restart cleanup).

        Returns the number of rows updated.
        """
        with timed_step("storage", "mark_stale_calls_ended"):
            now = datetime.utcnow().isoformat()
            # Supabase doesn't support `in` filter directly with update,
            # so we do two queries.
            count = 0
            for stale_status in ("active", "dialing", "connected", "media_connected", "pending"):
                result = (
                    self._client.table("calls")
                    .update({
                        "status": "ended",
                        "outcome": "unknown",
                        "ended_at": now,
                        "updated_at": now,
                    })
                    .eq("status", stale_status)
                    .execute()
                )
                count += len(result.data or [])
            return count

    def list_tasks(self) -> List[Dict]:
        with timed_step("storage", "list_tasks"):
            result = self._client.table("calls").select("*").order("created_at", desc=True).execute()
            return result.data or []

    def get_task(self, task_id: str) -> Optional[Dict]:
        with timed_step("storage", "get_task", task_id=task_id):
            result = self._client.table("calls").select("*").eq("id", task_id).execute()
            rows = result.data or []
            return rows[0] if rows else None

    def get_task_dir(self, task_id: str) -> Path:
        """Return local temp dir for audio chunk storage during live calls."""
        d = self._data_root / task_id
        d.mkdir(parents=True, exist_ok=True)
        return d

    # ------------------------------------------------------------------ #
    #  call_artifacts table                                                #
    # ------------------------------------------------------------------ #

    _ARTIFACT_COLUMN_MAP = {
        "transcript": "transcript_json",
        "analysis": "analysis_json",
        "conversation": "audio_payload_json",
        "recording_stats": "recording_json",
    }

    def save_artifact(self, task_id: str, artifact_type: str, data: Any) -> None:
        column = self._ARTIFACT_COLUMN_MAP.get(artifact_type)
        if not column:
            return
        with timed_step("storage", f"save_artifact_{artifact_type}", task_id=task_id):
            now = datetime.utcnow().isoformat()
            self._client.table("call_artifacts").upsert(
                {
                    "task_id": task_id,
                    column: data,
                    "updated_at": now,
                },
                on_conflict="task_id",
            ).execute()

    def get_artifact(self, task_id: str, artifact_type: str) -> Optional[Any]:
        column = self._ARTIFACT_COLUMN_MAP.get(artifact_type)
        if not column:
            return None
        with timed_step("storage", f"get_artifact_{artifact_type}", task_id=task_id):
            result = (
                self._client.table("call_artifacts")
                .select(column)
                .eq("task_id", task_id)
                .execute()
            )
            rows = result.data or []
            if not rows:
                return None
            return rows[0].get(column)

    # ------------------------------------------------------------------ #
    #  chat_sessions table                                                 #
    # ------------------------------------------------------------------ #

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
            task_ids_json = json.dumps(task_ids or [])
            payload_json = json.dumps(data or {})

            existing = self.get_chat_session(session_id)
            if existing is not None:
                existing_revision = int(existing.get("revision") or 0)
                if revision < existing_revision:
                    return existing
                self._client.table("chat_sessions").update({
                    "mode": mode,
                    "revision": revision,
                    "run_id": run_id,
                    "task_ids_json": task_ids_json,
                    "payload_json": payload_json,
                    "updated_at": now,
                }).eq("id", session_id).execute()
            else:
                self._client.table("chat_sessions").insert({
                    "id": session_id,
                    "mode": mode,
                    "revision": revision,
                    "run_id": run_id,
                    "task_ids_json": task_ids_json,
                    "payload_json": payload_json,
                    "created_at": now,
                    "updated_at": now,
                }).execute()

            row = self.get_chat_session(session_id)
            return row or {
                "session_id": session_id,
                "mode": mode,
                "revision": revision,
                "run_id": run_id,
                "task_ids": task_ids or [],
                "data": data or {},
                "created_at": now,
                "updated_at": now,
            }

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
            result = self._client.table("chat_sessions").select("*").eq("id", session_id).execute()
            rows = result.data or []
            if not rows:
                return None
            return self._decode_chat_session_row(rows[0])

    def get_latest_chat_session(self, mode: Optional[str] = None) -> Optional[Dict[str, Any]]:
        with timed_step("storage", "get_latest_chat_session", details={"mode": mode}):
            query = self._client.table("chat_sessions").select("*").order("updated_at", desc=True).limit(1)
            if mode:
                query = query.eq("mode", mode)
            result = query.execute()
            rows = result.data or []
            if not rows:
                return None
            return self._decode_chat_session_row(rows[0])

    def touch_chat_session(self, session_id: str) -> Optional[Dict[str, Any]]:
        with timed_step("storage", "touch_chat_session", details={"session_id": session_id}):
            now = datetime.utcnow().isoformat()
            self._client.table("chat_sessions").update({
                "updated_at": now,
            }).eq("id", session_id).execute()
            return self.get_chat_session(session_id)

    def _decode_chat_session_row(self, row: Dict[str, Any]) -> Dict[str, Any]:
        task_ids_raw = row.get("task_ids_json")
        payload_raw = row.get("payload_json")
        try:
            if isinstance(task_ids_raw, list):
                task_ids = task_ids_raw
            elif isinstance(task_ids_raw, str):
                task_ids = json.loads(task_ids_raw)
            else:
                task_ids = []
            if not isinstance(task_ids, list):
                task_ids = []
        except Exception:
            task_ids = []
        try:
            if isinstance(payload_raw, dict):
                payload = payload_raw
            elif isinstance(payload_raw, str):
                payload = json.loads(payload_raw)
            else:
                payload = {}
            if not isinstance(payload, dict):
                payload = {}
        except Exception:
            payload = {}
        return {
            "session_id": row.get("id"),
            "mode": row.get("mode"),
            "revision": int(row.get("revision") or 0),
            "run_id": row.get("run_id"),
            "task_ids": task_ids,
            "data": payload,
            "created_at": row.get("created_at"),
            "updated_at": row.get("updated_at"),
        }
