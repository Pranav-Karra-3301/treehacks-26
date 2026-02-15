from __future__ import annotations

import json
import sqlite3
from contextlib import contextmanager
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List, Optional

from app.core.config import settings
from app.core.telemetry import timed_step
from app.models.schemas import CallOutcome, CallStatus


class DataStore:
    """SQLite metadata + filesystem session artifacts."""

    def __init__(self, data_root: str | Path | None = None, sqlite_path: str | Path | None = None) -> None:
        self._data_root = Path(data_root) if data_root is not None else settings.DATA_ROOT
        self._path = Path(sqlite_path) if sqlite_path is not None else self._data_root / "calls.db"
        self._data_root.mkdir(parents=True, exist_ok=True)
        with self._connect() as conn:
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS calls (
                    id TEXT PRIMARY KEY,
                    task_type TEXT,
                    target_phone TEXT,
                    objective TEXT,
                    context TEXT,
                    run_id TEXT,
                    run_mode TEXT,
                    location TEXT,
                    target_name TEXT,
                    target_url TEXT,
                    target_source TEXT,
                    target_snippet TEXT,
                    target_outcome TEXT,
                    walkaway_point TEXT,
                    agent_persona TEXT,
                    opening_line TEXT,
                    style TEXT,
                    status TEXT,
                    outcome TEXT,
                    duration_seconds INTEGER DEFAULT 0,
                    created_at TEXT,
                    ended_at TEXT
                )
                """
            )
            self._ensure_column(conn, "calls", "run_id", "TEXT")
            self._ensure_column(conn, "calls", "run_mode", "TEXT")
            self._ensure_column(conn, "calls", "target_name", "TEXT")
            self._ensure_column(conn, "calls", "target_url", "TEXT")
            self._ensure_column(conn, "calls", "target_source", "TEXT")
            self._ensure_column(conn, "calls", "target_snippet", "TEXT")
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS chat_sessions (
                    id TEXT PRIMARY KEY,
                    mode TEXT NOT NULL,
                    revision INTEGER NOT NULL DEFAULT 0,
                    run_id TEXT,
                    task_ids_json TEXT NOT NULL DEFAULT '[]',
                    payload_json TEXT NOT NULL DEFAULT '{}',
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL
                )
                """
            )
            conn.execute(
                """
                CREATE INDEX IF NOT EXISTS idx_chat_sessions_mode_updated_at
                ON chat_sessions (mode, updated_at DESC)
                """
            )

    def _ensure_column(self, conn: sqlite3.Connection, table: str, column: str, ddl_type: str) -> None:
        existing = {
            row["name"]
            for row in conn.execute(f"PRAGMA table_info({table})").fetchall()
        }
        if column in existing:
            return
        conn.execute(f"ALTER TABLE {table} ADD COLUMN {column} {ddl_type}")

    @contextmanager
    def _connect(self):
        conn = sqlite3.connect(self._path)
        try:
            conn.row_factory = sqlite3.Row
            yield conn
            conn.commit()
        finally:
            conn.close()

    def create_task(self, task_id: str, payload: Dict[str, str]) -> None:
        with timed_step("storage", "create_task", task_id=task_id, details={"target_phone": payload.get("target_phone")}):
            now = datetime.utcnow().isoformat()
            with self._connect() as conn:
                conn.execute(
                    """
                    INSERT INTO calls (
                        id, task_type, target_phone, objective, context,
                        run_id, run_mode,
                        location, target_name, target_url, target_source, target_snippet,
                        target_outcome, walkaway_point, agent_persona,
                        opening_line, style, status, outcome, created_at
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """,
                    (
                        task_id,
                        payload["task_type"],
                        payload["target_phone"],
                        payload["objective"],
                        payload.get("context", ""),
                        payload.get("run_id"),
                        payload.get("run_mode"),
                        payload.get("location"),
                        payload.get("target_name"),
                        payload.get("target_url"),
                        payload.get("target_source"),
                        payload.get("target_snippet"),
                        payload.get("target_outcome"),
                        payload.get("walkaway_point"),
                        payload.get("agent_persona"),
                        payload.get("opening_line"),
                        payload.get("style", "collaborative"),
                        "pending",
                        "unknown",
                        now,
                    ),
                )

            call_dir = self._data_root / task_id
            call_dir.mkdir(parents=True, exist_ok=True)
            with open(call_dir / "task.json", "w", encoding="utf-8") as f:
                json.dump(payload, f, indent=2)

    def update_status(self, task_id: str, status: CallStatus, outcome: Optional[CallOutcome] = None) -> None:
        with timed_step("storage", "update_status", task_id=task_id, details={"status": status, "outcome": outcome}):
            with self._connect() as conn:
                conn.execute(
                    "UPDATE calls SET status = ?, outcome = COALESCE(?, outcome) WHERE id = ?",
                    (status, outcome, task_id),
                )

    def update_ended_at(self, task_id: str, ended_at: Optional[datetime] = None) -> None:
        with timed_step("storage", "update_ended_at", task_id=task_id):
            ended_value = (ended_at or datetime.utcnow()).isoformat()
            with self._connect() as conn:
                conn.execute("UPDATE calls SET ended_at = ? WHERE id = ?", (ended_value, task_id))

    def update_duration(self, task_id: str, seconds: int) -> None:
        with timed_step("storage", "update_duration", task_id=task_id, details={"seconds": seconds}):
            with self._connect() as conn:
                conn.execute("UPDATE calls SET duration_seconds = ? WHERE id = ?", (seconds, task_id))

    def mark_stale_calls_ended(self) -> int:
        """Mark any active/dialing calls as ended (server restart cleanup).

        Returns the number of rows updated.
        """
        with timed_step("storage", "mark_stale_calls_ended"):
            now = datetime.utcnow().isoformat()
            with self._connect() as conn:
                cursor = conn.execute(
                    """
                    UPDATE calls
                    SET status = 'ended', outcome = COALESCE(outcome, 'unknown'), ended_at = ?
                    WHERE status IN ('active', 'dialing')
                    """,
                    (now,),
                )
                return cursor.rowcount

    def list_tasks(self) -> List[Dict]:
        with timed_step("storage", "list_tasks"):
            with self._connect() as conn:
                rows = conn.execute("SELECT * FROM calls ORDER BY created_at DESC").fetchall()
            return [dict(row) for row in rows]

    def get_task(self, task_id: str) -> Optional[Dict]:
        with timed_step("storage", "get_task", task_id=task_id):
            with self._connect() as conn:
                row = conn.execute("SELECT * FROM calls WHERE id = ?", (task_id,)).fetchone()
            return dict(row) if row else None

    def get_task_dir(self, task_id: str) -> Path:
        return self._data_root / task_id

    def save_artifact(self, task_id: str, artifact_type: str, data: Any) -> None:
        """Save JSON artifact to filesystem."""
        filename_map = {
            "transcript": "transcript.json",
            "analysis": "analysis.json",
            "conversation": "conversation.json",
            "recording_stats": "recording_stats.json",
        }
        filename = filename_map.get(artifact_type)
        if not filename:
            return
        with timed_step("storage", f"save_artifact_{artifact_type}", task_id=task_id):
            call_dir = self.get_task_dir(task_id)
            call_dir.mkdir(parents=True, exist_ok=True)
            with open(call_dir / filename, "w", encoding="utf-8") as f:
                json.dump(data, f, indent=2)

    def get_artifact(self, task_id: str, artifact_type: str) -> Optional[Any]:
        """Read JSON artifact from filesystem."""
        filename_map = {
            "transcript": "transcript.json",
            "analysis": "analysis.json",
            "conversation": "conversation.json",
            "recording_stats": "recording_stats.json",
        }
        filename = filename_map.get(artifact_type)
        if not filename:
            return None
        with timed_step("storage", f"get_artifact_{artifact_type}", task_id=task_id):
            path = self.get_task_dir(task_id) / filename
            if not path.exists():
                return None
            with open(path, "r", encoding="utf-8") as f:
                return json.load(f)

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
            with self._connect() as conn:
                existing = conn.execute(
                    "SELECT * FROM chat_sessions WHERE id = ?",
                    (session_id,),
                ).fetchone()
                if existing is not None:
                    existing_row = dict(existing)
                    existing_revision = int(existing_row.get("revision") or 0)
                    if revision < existing_revision:
                        return self._decode_chat_session_row(existing_row)
                    conn.execute(
                        """
                        UPDATE chat_sessions
                        SET mode = ?, revision = ?, run_id = ?, task_ids_json = ?, payload_json = ?, updated_at = ?
                        WHERE id = ?
                        """,
                        (mode, revision, run_id, task_ids_json, payload_json, now, session_id),
                    )
                else:
                    conn.execute(
                        """
                        INSERT INTO chat_sessions (
                            id, mode, revision, run_id, task_ids_json, payload_json, created_at, updated_at
                        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                        """,
                        (session_id, mode, revision, run_id, task_ids_json, payload_json, now, now),
                    )
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
            with self._connect() as conn:
                row = conn.execute("SELECT * FROM chat_sessions WHERE id = ?", (session_id,)).fetchone()
            if row is None:
                return None
            return self._decode_chat_session_row(dict(row))

    def get_latest_chat_session(self, mode: Optional[str] = None) -> Optional[Dict[str, Any]]:
        with timed_step("storage", "get_latest_chat_session", details={"mode": mode}):
            with self._connect() as conn:
                if mode:
                    row = conn.execute(
                        "SELECT * FROM chat_sessions WHERE mode = ? ORDER BY updated_at DESC LIMIT 1",
                        (mode,),
                    ).fetchone()
                else:
                    row = conn.execute("SELECT * FROM chat_sessions ORDER BY updated_at DESC LIMIT 1").fetchone()
            if row is None:
                return None
            return self._decode_chat_session_row(dict(row))

    def touch_chat_session(self, session_id: str) -> Optional[Dict[str, Any]]:
        with timed_step("storage", "touch_chat_session", details={"session_id": session_id}):
            now = datetime.utcnow().isoformat()
            with self._connect() as conn:
                conn.execute(
                    "UPDATE chat_sessions SET updated_at = ? WHERE id = ?",
                    (now, session_id),
                )
            return self.get_chat_session(session_id)

    def _decode_chat_session_row(self, row: Dict[str, Any]) -> Dict[str, Any]:
        task_ids_raw = row.get("task_ids_json")
        payload_raw = row.get("payload_json")
        try:
            task_ids = json.loads(task_ids_raw) if isinstance(task_ids_raw, str) else []
            if not isinstance(task_ids, list):
                task_ids = []
        except Exception:
            task_ids = []
        try:
            payload = json.loads(payload_raw) if isinstance(payload_raw, str) else {}
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
