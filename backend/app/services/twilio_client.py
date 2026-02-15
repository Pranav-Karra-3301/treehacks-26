from __future__ import annotations

import re
from typing import Any, Dict
from urllib.parse import urlparse

import httpx

from app.core.config import settings
from app.core.telemetry import log_event
from app.core.telemetry import timed_step


class TwilioClient:
    _E164_RE = re.compile(r"^\+[1-9]\d{7,14}$")
    _DTMF_RE = re.compile(r"^[0-9A-Da-d#*wW,]+$")

    @staticmethod
    def normalize_dtmf_digits(digits: str) -> str:
        """Normalize keypad input while allowing only supported DTMF symbols."""
        if not isinstance(digits, str):
            raise ValueError("digits must be a string")

        # Remove whitespace and common separators users may paste from copied prompts.
        normalized = "".join(ch for ch in digits if not ch.isspace())
        normalized = normalized.replace("-", "")
        normalized = normalized.replace(";", "")
        normalized = normalized.upper()

        if not normalized:
            raise ValueError("digits are required")
        if not TwilioClient._DTMF_RE.match(normalized):
            raise ValueError("digits may only contain 0-9, *, #, A-D, w/W, comma")

        return normalized

    def _resolve_public_webhook_host(self) -> tuple[str | None, str | None]:
        raw = (settings.TWILIO_WEBHOOK_HOST or "").strip()
        if not raw:
            return None, "TWILIO_WEBHOOK_HOST is missing."

        normalized = raw if "://" in raw else f"https://{raw}"
        parsed = urlparse(normalized)
        host = (parsed.hostname or "").strip().lower()
        scheme = (parsed.scheme or "").strip().lower()

        if scheme != "https":
            return None, (
                "TWILIO_WEBHOOK_HOST must use https for Twilio callbacks "
                f"(current: {normalized})."
            )

        if host in {"localhost", "127.0.0.1", "0.0.0.0"} or host.endswith(".local"):
            return None, (
                "TWILIO_WEBHOOK_HOST must be publicly reachable (not localhost). "
                "Run ./scripts/dev-up.sh --ngrok."
            )

        if not parsed.netloc:
            return None, f"TWILIO_WEBHOOK_HOST is not a valid URL: {normalized}"

        return normalized.rstrip("/"), None

    def _build_media_stream_url(self, webhook_host: str, task_id: str) -> str:
        parsed = urlparse(webhook_host)
        ws_scheme = "wss" if parsed.scheme == "https" else "ws"
        return f"{ws_scheme}://{parsed.netloc}/twilio/media-stream?task_id={task_id}"

    async def _update_call_twiml(self, call_sid: str, twiml: str) -> Dict[str, Any]:
        if not settings.TWILIO_ACCOUNT_SID or not settings.TWILIO_AUTH_TOKEN:
            return {"sid": call_sid, "status": "mock", "mode": "dry_run"}

        url = (
            f"https://api.twilio.com/2010-04-01/Accounts/{settings.TWILIO_ACCOUNT_SID}/Calls/{call_sid}.json"
        )
        async with httpx.AsyncClient(auth=(
            settings.TWILIO_ACCOUNT_SID,
            settings.TWILIO_AUTH_TOKEN,
        )) as client:
            resp = await client.post(url, data={"Twiml": twiml})
            resp.raise_for_status()
            return resp.json()

    async def place_call(self, to_phone: str, task_id: str) -> Dict[str, Any]:
        """Kickoff outbound call via Twilio REST API.

        Returns Twilio API payload in debug mode when credentials are missing.
        """
        if not settings.TWILIO_ACCOUNT_SID or not settings.TWILIO_AUTH_TOKEN:
            return {
                "sid": "mock_call_sid",
                "status": "queued",
                "mode": "dry_run",
                "to": to_phone,
                "task_id": task_id,
            }

        with timed_step(
            "twilio",
            "place_call",
            task_id=task_id,
            details={"to": to_phone},
        ):
            try:
                webhook_host, webhook_error = self._resolve_public_webhook_host()
                if webhook_error:
                    log_event(
                        "twilio",
                        "place_call_precheck_failed",
                        status="error",
                        task_id=task_id,
                        details={"error": webhook_error},
                    )
                    return {
                        "sid": "mock_call_sid",
                        "status": "failed",
                        "mode": "fallback",
                        "to": to_phone,
                        "task_id": task_id,
                        "error": webhook_error,
                    }

                url = (
                    f"https://api.twilio.com/2010-04-01/Accounts/{settings.TWILIO_ACCOUNT_SID}/Calls.json"
                )
                callback = f"{webhook_host}/twilio/status?task_id={task_id}"
                twiml_url = f"{webhook_host}/twilio/voice?task_id={task_id}"

                payload = {
                    "To": to_phone,
                    "From": settings.TWILIO_PHONE_NUMBER,
                    "Url": twiml_url,
                    "StatusCallback": callback,
                    "StatusCallbackEvent": "completed",
                    "StatusCallbackMethod": "POST",
                }

                async with httpx.AsyncClient(auth=(
                    settings.TWILIO_ACCOUNT_SID,
                    settings.TWILIO_AUTH_TOKEN,
                )) as client:
                    resp = await client.post(url, data=payload)
                    resp.raise_for_status()
                    return resp.json()
            except httpx.HTTPStatusError as exc:
                log_event(
                    "twilio",
                    "place_call_http_error",
                    status="error",
                    task_id=task_id,
                    details={"status_code": exc.response.status_code, "response": exc.response.text[:500]},
                )
                return {
                    "sid": "mock_call_sid",
                    "status": "failed",
                    "mode": "fallback",
                    "to": to_phone,
                    "task_id": task_id,
                    "error": exc.response.text[:500],
                }
            except Exception as exc:
                log_event(
                    "twilio",
                    "place_call_error",
                    status="error",
                    task_id=task_id,
                    details={"error": f"{type(exc).__name__}: {exc}"},
                )
                return {
                    "sid": "mock_call_sid",
                    "status": "failed",
                    "mode": "fallback",
                    "to": to_phone,
                    "task_id": task_id,
                    "error": f"{type(exc).__name__}: {exc}",
                }

    async def end_call(self, call_sid: str) -> Dict[str, Any]:
        if not settings.TWILIO_ACCOUNT_SID or not settings.TWILIO_AUTH_TOKEN:
            return {"sid": call_sid, "status": "ended", "mode": "dry_run"}

        with timed_step("twilio", "end_call", details={"call_sid": call_sid}):
            url = (
                f"https://api.twilio.com/2010-04-01/Accounts/{settings.TWILIO_ACCOUNT_SID}/Calls/{call_sid}.json"
            )
            async with httpx.AsyncClient(auth=(
                settings.TWILIO_ACCOUNT_SID,
                settings.TWILIO_AUTH_TOKEN,
            )) as client:
                resp = await client.delete(url)
                if resp.status_code not in (200, 204):
                    resp.raise_for_status()
                return {"sid": call_sid, "status": "ended", "status_code": resp.status_code}

    async def transfer_call(self, call_sid: str, to_phone: str) -> Dict[str, Any]:
        if not self._E164_RE.match((to_phone or "").strip()):
            raise ValueError("transfer target must be E.164 format, e.g. +16505551212")

        with timed_step("twilio", "transfer_call", details={"call_sid": call_sid, "to": to_phone}):
            twiml = (
                '<?xml version="1.0" encoding="UTF-8"?>'
                f'<Response><Dial answerOnBridge="true" callerId="{settings.TWILIO_PHONE_NUMBER}">{to_phone}</Dial></Response>'
            )
            return await self._update_call_twiml(call_sid, twiml)

    async def send_dtmf(self, call_sid: str, task_id: str, digits: str) -> Dict[str, Any]:
        normalized = self.normalize_dtmf_digits(digits)

        webhook_host, webhook_error = self._resolve_public_webhook_host()
        if webhook_error or not webhook_host:
            raise ValueError(webhook_error or "TWILIO_WEBHOOK_HOST is invalid")

        stream_url = self._build_media_stream_url(webhook_host, task_id)
        with timed_step("twilio", "send_dtmf", task_id=task_id, details={"call_sid": call_sid, "digits": normalized}):
            twiml = (
                '<?xml version="1.0" encoding="UTF-8"?>'
                "<Response>"
                f'<Play digits="{normalized}" />'
                "<Connect>"
                f'<Stream url="{stream_url}"><Parameter name="task_id" value="{task_id}" /></Stream>'
                "</Connect>"
                "</Response>"
            )
            result = await self._update_call_twiml(call_sid, twiml)
            return {"sid": call_sid, "status": result.get("status", "updated"), "digits": normalized}
