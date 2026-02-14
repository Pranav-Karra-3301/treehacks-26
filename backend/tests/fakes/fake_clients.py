from __future__ import annotations

from typing import AsyncGenerator, Dict, List, Optional


class FakeLLMClient:
    responses: List[str]
    calls: List[Dict[str, object]]

    def __init__(self, responses: Optional[List[str]] = None) -> None:
        self.responses = responses or ["I", " can", " help", " with", " this"]
        self.calls = []

    async def stream_completion(
        self, messages: List[Dict[str, str]], max_tokens: int = 128
    ) -> AsyncGenerator[str, None]:
        self.calls.append({"messages": list(messages), "max_tokens": max_tokens})
        for token in self.responses:
            yield token


class FakeTwilioClient:
    status: str
    sid_prefix: str
    calls: List[Dict[str, str]]
    ended: List[str]

    def __init__(self, status: str = "queued", sid_prefix: str = "mock_call_sid") -> None:
        self.status = status
        self.sid_prefix = sid_prefix
        self.calls = []
        self.ended = []

    async def place_call(self, to_phone: str, task_id: str) -> Dict[str, str]:
        self.calls.append({"to_phone": to_phone, "task_id": task_id})
        return {
            "sid": f"{self.sid_prefix}_{task_id}",
            "status": self.status,
            "to": to_phone,
            "task_id": task_id,
            "mode": "fake",
        }

    async def end_call(self, call_sid: str) -> Dict[str, str]:
        self.ended.append(call_sid)
        return {"sid": call_sid, "status": "ended", "mode": "fake"}
