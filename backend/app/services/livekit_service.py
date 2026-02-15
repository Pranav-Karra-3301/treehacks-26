from __future__ import annotations

import json
from typing import Any, Dict, Optional

import httpx

from app.core.config import settings
from app.core.telemetry import log_event, timed_step


class LiveKitService:
    """Thin client for LiveKit control-plane operations.

    The service prefers dry-run behavior when credentials are missing so the
    application remains testable without a running LiveKit cluster.
    """

    def __init__(
        self,
        *,
        livekit_url: Optional[str] = None,
        api_key: Optional[str] = None,
        api_secret: Optional[str] = None,
        room_prefix: Optional[str] = None,
        agent_name: Optional[str] = None,
        sip_trunk_id: Optional[str] = None,
    ) -> None:
        self._url = (livekit_url or settings.LIVEKIT_URL).rstrip("/")
        self._api_key = api_key or settings.LIVEKIT_API_KEY
        self._api_secret = api_secret or settings.LIVEKIT_API_SECRET
        self._room_prefix = (
            room_prefix.strip()
            if room_prefix is not None
            else settings.LIVEKIT_ROOM_PREFIX
        )
        self._agent_name = (
            agent_name.strip()
            if agent_name is not None
            else settings.LIVEKIT_AGENT_NAME
        )
        self._sip_trunk_id = (
            sip_trunk_id.strip()
            if sip_trunk_id is not None
            else settings.LIVEKIT_SIP_TRUNK_ID
        )

    @property
    def ready(self) -> bool:
        return bool(self._url and self._api_key and self._api_secret)

    @property
    def room_prefix(self) -> str:
        return self._room_prefix or "kiru-call"

    def build_room_name(self, task_id: str) -> str:
        suffix = (task_id or "task").strip().replace(" ", "_")
        return f"{self.room_prefix}-{suffix}"

    def _dry_run(self, status: str, **kwargs: Any) -> Dict[str, Any]:
        payload = {"status": status, "mode": "dry_run", **kwargs}
        log_event(
            "livekit",
            "dry_run",
            details=payload,
        )
        return payload

    async def _post(
        self,
        endpoint: str,
        payload: Dict[str, Any],
        *,
        fallback_status: str = "failed",
    ) -> Dict[str, Any]:
        if not self.ready:
            return self._dry_run(fallback_status, endpoint=endpoint, room_name=payload.get("room_name"))

        url = f"{self._url.rstrip('/')}/{endpoint.lstrip('/')}"
        headers = {
            "Content-Type": "application/json",
            "User-Agent": "kiru-backend-livekit-service",
        }
        # Use basic auth as a compatibility fallback for environments that
        # expose a reverse proxy in front of LiveKit.
        auth = (self._api_key, self._api_secret)

        with timed_step("livekit", "api_request", details={"endpoint": endpoint, "room": payload.get("room_name")}):
            try:
                async with httpx.AsyncClient(timeout=30.0, auth=auth) as client:
                    response = await client.post(url, json=payload)
                    if response.status_code >= 400:
                        return {
                            "status": "failed",
                            "mode": "http_error",
                            "endpoint": endpoint,
                            "status_code": response.status_code,
                            "error": response.text[:800],
                        }

                    if response.content:
                        try:
                            response_data = response.json()
                        except Exception:
                            response_data = {"raw": response.text[:800]}
                    else:
                        response_data = {}

                    response_data.setdefault("status", "ok")
                    response_data.setdefault("mode", "live")
                    response_data.setdefault("room_name", payload.get("room_name"))
                    return response_data
            except Exception as exc:
                log_event(
                    "livekit",
                    "api_request_error",
                    status="error",
                    details={
                        "endpoint": endpoint,
                        "room": payload.get("room_name"),
                        "error": f"{type(exc).__name__}: {exc}",
                    },
                )
                return {
                    "status": "failed",
                    "mode": "exception",
                    "endpoint": endpoint,
                    "error": f"{type(exc).__name__}: {exc}",
                }

    async def start_call(self, task_id: str, task: Dict[str, Any]) -> Dict[str, Any]:
        room_name = self.build_room_name(task_id)
        target_phone = (task.get("target_phone") or "").strip()
        payload: Dict[str, Any] = {
            "room_name": room_name,
            "task_id": task_id,
            "agent_name": self._agent_name,
            "target_phone": target_phone,
            "metadata": json.dumps(
                {
                    "task_id": task_id,
                    "target_phone": target_phone,
                    "task_type": task.get("task_type"),
                    "objective": task.get("objective"),
                    "style": task.get("style"),
                    "run_mode": task.get("run_mode"),
                },
                separators=(",", ":"),
            ),
        }
        if self._sip_trunk_id:
            payload["sip_trunk_id"] = self._sip_trunk_id
        result = await self._post("/twirp/livekit.agents.DispatchService/Dispatch", payload, fallback_status="queued")
        if result.get("mode") == "dry_run":
            result["room_name"] = room_name
            result.setdefault("status", "queued")
        if result.get("status") in {"ok", "queued", "queued_for_dispatch"}:
            result["room_name"] = room_name
        return result

    async def stop_call(self, task_id: str, room_name: Optional[str] = None) -> Dict[str, Any]:
        payload = {
            "task_id": task_id,
            "room_name": room_name or self.build_room_name(task_id),
        }
        if self.ready and room_name:
            return await self._post("/twirp/livekit.RoomService/DeleteRoom", payload, fallback_status="ended")
        return self._dry_run("ended", room_name=payload["room_name"], task_id=task_id)

    async def transfer_call(self, task_id: str, to_phone: str, room_name: Optional[str] = None) -> Dict[str, Any]:
        payload = {
            "task_id": task_id,
            "room_name": room_name or self.build_room_name(task_id),
            "target_phone": to_phone,
        }
        if self.ready:
            return await self._post("/twirp/livekit.agents.TransferService/TransferCall", payload, fallback_status="transferred")
        return self._dry_run(
            "transferred",
            task_id=task_id,
            room_name=payload["room_name"],
            target_phone=to_phone,
        )

    async def send_dtmf(self, task_id: str, digits: str, room_name: Optional[str] = None) -> Dict[str, Any]:
        payload = {
            "task_id": task_id,
            "room_name": room_name or self.build_room_name(task_id),
            "digits": digits,
        }
        if self.ready:
            return await self._post("/twirp/livekit.agents.DtmfService/SendDtmf", payload, fallback_status="sent")
        return self._dry_run(
            "sent",
            task_id=task_id,
            room_name=payload["room_name"],
            digits=digits,
        )
