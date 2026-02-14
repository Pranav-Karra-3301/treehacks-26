from __future__ import annotations

from typing import Any, Dict

import httpx

from app.core.config import settings


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

        url = (
            f"https://api.twilio.com/2010-04-01/Accounts/{settings.TWILIO_ACCOUNT_SID}/Calls.json"
        )
        callback = f"{settings.TWILIO_WEBHOOK_HOST}/twilio/status"
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

    async def end_call(self, call_sid: str) -> Dict[str, Any]:
        if not settings.TWILIO_ACCOUNT_SID or not settings.TWILIO_AUTH_TOKEN:
            return {"sid": call_sid, "status": "ended", "mode": "dry_run"}

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
