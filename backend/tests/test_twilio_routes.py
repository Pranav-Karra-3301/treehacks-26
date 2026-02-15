from __future__ import annotations

import pytest

pytestmark = pytest.mark.unit


def test_twilio_voice_webhook_returns_twiml(client) -> None:
    response = client.post("/twilio/voice", data={"task_id": "task_for_voice_webhook"})

    assert response.status_code == 200
    body = response.text
    assert body.startswith('<?xml version="1.0" encoding="UTF-8"?>')
    assert "<Response>" in body
    assert "<Connect>" in body
    assert "<Parameter name=\"task_id\" value=\"task_for_voice_webhook\" />" in body
    assert "task_id=task_for_voice_webhook" in body
