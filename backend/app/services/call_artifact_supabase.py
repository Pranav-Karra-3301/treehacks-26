from __future__ import annotations

import json
from datetime import datetime
from typing import Any, Dict, List, Optional
from urllib.parse import quote_plus

import httpx

from app.core.telemetry import log_event


class SupabaseCallArtifactSync:
    def __init__(
        self,
        *,
        base_url: str,
        anon_key: str,
        table: str = "call_artifacts",
        timeout_seconds: float = 8.0,
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
        if not payload or not payload[0]:
            return False

        url = f"{self._api_url()}?on_conflict=task_id"
        headers = self._headers | {"Prefer": "return=representation,resolution=merge-duplicates"}
        try:
            with httpx.Client(timeout=self._timeout, headers=self._headers) as client:
                response = client.post(url, json=payload, headers=headers)
            response.raise_for_status()
            return True
        except Exception as exc:
            log_event(
                "supabase",
                "call_artifact_upsert",
                status="warning",
                details={"error": str(exc), "task_id": row.get("task_id")},
            )
            return False

    def get(self, task_id: str) -> Optional[Dict[str, Any]]:
        url = self._api_url()
        params = {
            "select": "*",
            "task_id": f"eq.{quote_plus(task_id)}",
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
                "call_artifact_get",
                status="warning",
                details={"error": str(exc), "task_id": task_id},
            )
            return None

        if not isinstance(rows, list) or not rows:
            return None
        row = rows[0]
        if not isinstance(row, dict):
            return None
        return self._decode_row(row)

    def delete(self, task_id: str) -> bool:
        url = self._api_url()
        params = {"task_id": f"eq.{quote_plus(task_id)}"}
        headers = self._headers | {"Prefer": "return=minimal"}
        try:
            with httpx.Client(timeout=self._timeout, headers=self._headers) as client:
                response = client.delete(url, params=params, headers=headers)
            response.raise_for_status()
        except Exception as exc:
            log_event(
                "supabase",
                "call_artifact_delete",
                status="warning",
                details={"action": "delete", "error": str(exc), "task_id": task_id},
            )
            return False
        return True

    def list(self, limit: Optional[int] = None) -> List[Dict[str, Any]]:
        url = self._api_url()
        params: Dict[str, str] = {
            "select": "*",
            "order": "updated_at.desc",
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
                "call_artifact_list",
                status="warning",
                details={"error": str(exc)},
            )
            return []

        if not isinstance(rows, list):
            return []
        return [self._decode_row(row) for row in rows if isinstance(row, dict)]

    def _prepare_row_for_upload(self, row: Dict[str, Any]) -> Dict[str, Any]:
        task_id = row.get("task_id")
        if not task_id:
            return {}

        now = datetime.utcnow().isoformat()
        payload = {
            "task_id": task_id,
            "transcript_json": self._json_dump(row.get("transcript"), fallback=[]),
            "analysis_json": self._json_dump(row.get("analysis"), fallback={}),
            "recording_json": self._json_dump(row.get("recording"), fallback={}),
            "audio_payload_json": self._json_dump(row.get("audio_payload"), fallback={}),
            "created_at": row.get("created_at") or now,
            "updated_at": row.get("updated_at") or now,
        }
        return payload

    def _decode_row(self, row: Dict[str, Any]) -> Dict[str, Any]:
        transcript = self._json_load(row.get("transcript_json"), default=[])
        analysis = self._json_load(row.get("analysis_json"), default={})
        recording = self._json_load(row.get("recording_json"), default={})
        audio_payload = self._json_load(row.get("audio_payload_json"), default={})
        if not isinstance(transcript, list):
            transcript = []
        if not isinstance(analysis, dict):
            analysis = {}
        if not isinstance(recording, dict):
            recording = {}
        if not isinstance(audio_payload, dict):
            audio_payload = {}
        return {
            "task_id": row.get("task_id"),
            "transcript": transcript,
            "analysis": analysis,
            "recording": recording,
            "audio_payload": audio_payload,
            "created_at": row.get("created_at"),
            "updated_at": row.get("updated_at"),
        }

    @staticmethod
    def _json_dump(value: Any, *, fallback: Any) -> str:
        try:
            return json.dumps(value if value is not None else fallback)
        except Exception:
            return json.dumps(fallback)

    @staticmethod
    def _json_load(value: Any, *, default: Any) -> Any:
        if isinstance(value, (dict, list)):
            return value
        if not isinstance(value, str):
            return default
        try:
            return json.loads(value)
        except Exception:
            return default

    def _api_url(self) -> str:
        return f"{self._base_url}/rest/v1/{self._table}"
