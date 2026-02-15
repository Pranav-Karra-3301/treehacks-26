from __future__ import annotations

import json
from datetime import datetime
from typing import Any, Dict, List, Optional
from urllib.parse import quote_plus

import httpx

from app.core.telemetry import log_event


class SupabaseChatSessionSync:
    def __init__(
        self,
        *,
        base_url: str,
        anon_key: str,
        table: str = "chat_sessions",
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

    @property
    def table_name(self) -> str:
        return self._table

    def upsert(self, row: Dict[str, Any]) -> bool:
        payload = [self._prepare_row_for_upload(row)]
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
                "chat_session_upsert",
                status="warning",
                details={"action": "upsert", "error": str(exc), "session_id": row.get("session_id")},
            )
            return False
        return True

    def get(self, session_id: str) -> Optional[Dict[str, Any]]:
        url = self._api_url()
        params = {
            "select": "*",
            "id": f"eq.{quote_plus(session_id)}",
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
                "chat_session_get",
                status="warning",
                details={"action": "get", "error": str(exc), "session_id": session_id},
            )
            return None

        if not isinstance(rows, list) or not rows:
            return None
        first = rows[0]
        if self._row_is_deleted(first):
            return None
        return self._decode_row(first)

    def get_latest(
        self,
        mode: Optional[str] = None,
        exclude_ids: Optional[List[str]] = None,
    ) -> Optional[Dict[str, Any]]:
        url = self._api_url()
        params: Dict[str, str] = {
            "select": "*",
            "order": "updated_at.desc",
            "limit": "25",
        }
        if mode:
            params["mode"] = f"eq.{quote_plus(mode)}"
        try:
            with httpx.Client(timeout=self._timeout, headers=self._headers) as client:
                response = client.get(url, params=params)
            response.raise_for_status()
            rows = response.json()
        except Exception as exc:
            log_event(
                "supabase",
                "chat_session_get_latest",
                status="warning",
                details={"action": "get_latest", "error": str(exc), "mode": mode},
            )
            return None

        if not isinstance(rows, list) or not rows:
            return None
        blocked = {str(item) for item in (exclude_ids or []) if item}
        for row in rows:
            if not isinstance(row, dict):
                continue
            row_id = str(row.get("id") or row.get("session_id") or "")
            if row_id and row_id in blocked:
                continue
            if self._row_is_deleted(row):
                continue
            return self._decode_row(row)
        return None

    def list_containing_task(self, task_id: str) -> List[Dict[str, Any]]:
        """Find all chat sessions whose task_ids_json contains the given task_id."""
        url = self._api_url()
        # Use PostgREST 'like' on the JSON text column — UUID is unique enough
        params = {
            "select": "*",
            "task_ids_json": f"like.%{task_id}%",
            "limit": "50",
        }
        try:
            with httpx.Client(timeout=self._timeout, headers=self._headers) as client:
                response = client.get(url, params=params)
            response.raise_for_status()
            rows = response.json()
        except Exception as exc:
            log_event(
                "supabase",
                "chat_session_list_containing_task",
                status="warning",
                details={"action": "list_containing_task", "error": str(exc), "task_id": task_id},
            )
            return []

        if not isinstance(rows, list):
            return []
        return [self._decode_row(r) for r in rows if isinstance(r, dict) and not self._row_is_deleted(r)]

    def delete(self, session_id: str) -> bool:
        url = self._api_url()
        params = {"id": f"eq.{quote_plus(session_id)}"}
        headers = self._headers | {"Prefer": "return=minimal"}
        try:
            with httpx.Client(timeout=self._timeout, headers=self._headers) as client:
                response = client.delete(url, params=params, headers=headers)
            response.raise_for_status()
        except Exception as exc:
            log_event(
                "supabase",
                "chat_session_delete",
                status="warning",
                details={"action": "delete", "error": str(exc), "session_id": session_id},
            )
            return False
        return True

    def _prepare_row_for_upload(self, row: Dict[str, Any]) -> Dict[str, Any]:
        task_ids = row.get("task_ids", [])
        payload = row.get("payload", row.get("data", {}))

        task_ids_json = self._serialize_field(task_ids)
        payload_json = self._serialize_field(payload)

        created_at = row.get("created_at")
        updated_at = row.get("updated_at")

        if not created_at:
            created_at = datetime.utcnow().isoformat()
        if not updated_at:
            updated_at = datetime.utcnow().isoformat()

        return {
            "id": row.get("session_id"),
            "mode": row.get("mode"),
            "revision": int(row.get("revision") or 0),
            "run_id": row.get("run_id"),
            "task_ids_json": task_ids_json,
            "payload_json": payload_json,
            "created_at": created_at,
            "updated_at": updated_at,
        }

    def _decode_row(self, row: Dict[str, Any]) -> Dict[str, Any]:
        raw = self._load_json_field(row, ["task_ids_json", "task_ids"])
        payload = self._load_json_field(row, ["payload_json", "payload", "data"])

        if not isinstance(raw, list):
            raw = []
        if not isinstance(payload, dict):
            payload = {}

        created_at = row.get("created_at")
        updated_at = row.get("updated_at")

        return {
            "session_id": row.get("id") or row.get("session_id"),
            "mode": row.get("mode"),
            "revision": int(row.get("revision") or 0),
            "run_id": row.get("run_id"),
            "task_ids": raw,
            "data": payload,
            "created_at": created_at,
            "updated_at": updated_at,
        }

    def _load_json_field(self, row: Dict[str, Any], fields: List[str]) -> Any:
        for field in fields:
            if field not in row:
                continue
            value = row.get(field)
            if isinstance(value, (dict, list)):
                return value
            if isinstance(value, str):
                try:
                    return json.loads(value)
                except Exception:
                    continue
            if value is None:
                continue
            if field.startswith("task_ids"):
                return []
            return value
        return []

    def _row_is_deleted(self, row: Dict[str, Any]) -> bool:
        payload = self._load_json_field(row, ["payload_json", "payload", "data"])
        if not isinstance(payload, dict):
            return False
        marker = payload.get("__deleted")
        if isinstance(marker, str):
            return marker.strip().lower() in {"1", "true", "yes", "on"}
        return bool(marker)

    def _serialize_field(self, value: Any) -> str:
        try:
            return json.dumps(value if value is not None else [])
        except Exception:
            return json.dumps([])

    def _api_url(self) -> str:
        return f"{self._base_url}/rest/v1/{self._table}"
