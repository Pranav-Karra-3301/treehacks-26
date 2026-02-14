from __future__ import annotations

import json
import sqlite3
from contextlib import contextmanager
from datetime import datetime
from pathlib import Path
from typing import Dict, List, Optional

from app.core.config import settings
from app.core.telemetry import timed_step
from app.models.schemas import CallOutcome, CallStatus


class DataStore:
    """SQLite metadata + filesystem session artifacts."""

    def __init__(self) -> None:
        settings.DATA_ROOT.mkdir(parents=True, exist_ok=True)
        self._path = settings.SQLITE_PATH
        with self._connect() as conn:
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS calls (
                    id TEXT PRIMARY KEY,
                    task_type TEXT,
                    target_phone TEXT,
                    objective TEXT,
                    context TEXT,
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
                        target_outcome, walkaway_point, agent_persona,
                        opening_line, style, status, outcome, created_at
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """,
                    (
                        task_id,
                        payload["task_type"],
                        payload["target_phone"],
                        payload["objective"],
                        payload.get("context", ""),
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

            call_dir = settings.DATA_ROOT / task_id
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
        return settings.DATA_ROOT / task_id
