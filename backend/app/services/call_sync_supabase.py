from __future__ import annotations

import json
from datetime import datetime
from typing import Any, Dict, List, Optional
from urllib.parse import quote_plus

import httpx

from app.core.telemetry import log_event


class SupabaseCallSync:
    def __init__(
        self,
        *,
        base_url: str,
        anon_key: str,
        table: str = "calls",
        timeout_seconds: float = 3.0,
    ) -> None:
        self._base_url = base_url.rstrip("/")
        self._anon_key = anon_key
        self._table = table
        self._timeout = timeout_seconds
        self._headers = {
            "apikey": anon_key,
            "Authorization": f"Bearer {anon_key}",
            "Content-Type": "application/json",
            "Accept": "application/json",
        }
        self._payload_columns = {
            "id",
            "task_type",
            "target_phone",
            "objective",
            "context",
            "run_id",
            "run_mode",
            "location",
            "target_name",
            "target_url",
            "target_source",
            "target_snippet",
            "target_outcome",
            "walkaway_point",
            "agent_persona",
            "opening_line",
            "style",
            "status",
            "outcome",
            "duration_seconds",
            "created_at",
            "ended_at",
            "updated_at",
        }

    @property
    def table_name(self) -> str:
        return self._table

    def upsert(self, row: Dict[str, Any]) -> bool:
        payload = [self._prepare_row_for_upload(row)]
        if not payload:
            return False
        url = f"{self._api_url()}?on_conflict=id"
        headers = self._headers | {
            "Prefer": "return=representation,resolution=merge-duplicates",
        }

        try:
            with httpx.Client(timeout=self._timeout, headers=self._headers) as client:
                response = client.post(url, json=payload, headers=headers)
            response.raise_for_status()
        except Exception as exc:
            log_event(
                "supabase",
                "call_upsert",
                status="warning",
                details={"action": "upsert", "error": str(exc), "task_id": row.get("id")},
            )
            return False

        return True

    def get(self, task_id: str) -> Optional[Dict[str, Any]]:
        url = self._api_url()
        params = {
            "select": "*",
            "id": f"eq.{quote_plus(task_id)}",
            "limit": "1",
        }
        try:
            with httpx.Client(timeout=self._timeout, headers=self._headers) as client:
                response = client.get(url, params=params)
            response.raise_for_status()
            rows = response.json()
        except Exception as exc:
            log_event(
                "supabase",
                "call_get",
                status="warning",
                details={"action": "get", "error": str(exc), "task_id": task_id},
            )
            return None

        if not isinstance(rows, list) or not rows:
            return None
        return self._decode_row(rows[0])

    def delete(self, task_id: str) -> bool:
        url = self._api_url()
        params = {"id": f"eq.{quote_plus(task_id)}"}
        headers = self._headers | {"Prefer": "return=minimal"}
        try:
            with httpx.Client(timeout=self._timeout, headers=self._headers) as client:
                response = client.delete(url, params=params, headers=headers)
            response.raise_for_status()
        except Exception as exc:
            log_event(
                "supabase",
                "call_delete",
                status="warning",
                details={"action": "delete", "error": str(exc), "task_id": task_id},
            )
            return False
        return True

    def list(self, limit: Optional[int] = None) -> List[Dict[str, Any]]:
        url = self._api_url()
        params = {
            "select": "*",
            "order": "created_at.desc",
        }
        if limit is not None:
            params["limit"] = str(limit)
        try:
            with httpx.Client(timeout=self._timeout, headers=self._headers) as client:
                response = client.get(url, params=params)
            response.raise_for_status()
            rows = response.json()
        except Exception as exc:
            log_event(
                "supabase",
                "call_list",
                status="warning",
                details={"action": "list", "error": str(exc)},
            )
            return []

        if not isinstance(rows, list):
            return []
        return [self._decode_row(row) for row in rows if isinstance(row, dict)]

    def _prepare_row_for_upload(self, row: Dict[str, Any]) -> Dict[str, Any]:
        now = datetime.utcnow().isoformat()
        created_at = row.get("created_at") or now
        ended_at = row.get("ended_at")
        payload: Dict[str, Any] = {
            column: row[column]
            for column in self._payload_columns
            if column in row and row[column] is not None
        }
        payload["created_at"] = created_at
        if ended_at:
            payload["ended_at"] = ended_at

        task_id = row.get("id")
        if not task_id:
            return {}
        payload["id"] = task_id

        payload["duration_seconds"] = int(payload.get("duration_seconds", 0))
        payload["status"] = payload.get("status") or "pending"
        payload["outcome"] = payload.get("outcome") or "unknown"
        payload["style"] = payload.get("style") or "collaborative"
        if not payload.get("task_type"):
            payload["task_type"] = "custom"
        if payload.get("target_phone") is None:
            payload["target_phone"] = ""

        if "task_id" in payload:
            payload.pop("task_id")
        return payload

    def _decode_row(self, row: Dict[str, Any]) -> Dict[str, Any]:
        data = dict(row)
        payload: Dict[str, Any] = {
            "id": row.get("id"),
            "task_type": row.get("task_type"),
            "target_phone": row.get("target_phone"),
            "objective": row.get("objective"),
            "context": row.get("context") or "",
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
            "style": row.get("style") or "collaborative",
            "status": row.get("status") or "pending",
            "outcome": row.get("outcome") or "unknown",
            "duration_seconds": int(row.get("duration_seconds") or 0),
            "created_at": row.get("created_at"),
            "ended_at": row.get("ended_at"),
            "updated_at": row.get("updated_at"),
        }
        return payload

    def _api_url(self) -> str:
        return f"{self._base_url}/rest/v1/{self._table}"
