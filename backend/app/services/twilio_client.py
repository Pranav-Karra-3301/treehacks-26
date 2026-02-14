from __future__ import annotations

from typing import Any, Dict

import httpx

from app.core.config import settings
from app.core.telemetry import log_event
from app.core.telemetry import timed_step


class TwilioClient:
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
                url = (
                    f"https://api.twilio.com/2010-04-01/Accounts/{settings.TWILIO_ACCOUNT_SID}/Calls.json"
                )
                callback = f"{settings.TWILIO_WEBHOOK_HOST}/twilio/status?task_id={task_id}"
                twiml_url = f"{settings.TWILIO_WEBHOOK_HOST}/twilio/voice?task_id={task_id}"

                payload = {
                    "To": to_phone,
                    "From": settings.TWILIO_PHONE_NUMBER,
                    "Url": twiml_url,
                    "StatusCallback": callback,
                    "StatusCallbackEvent": "initiated ringing answered completed",
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
