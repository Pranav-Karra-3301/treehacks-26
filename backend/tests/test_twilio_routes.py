from __future__ import annotations

import base64


def _create_task(client):
    payload = {
        "task_type": "custom",
        "target_phone": "+15550003333",
        "objective": "negotiate discount",
        "context": "service issue",
        "target_outcome": "reduce cost",
        "walkaway_point": "No increase above current",
        "agent_persona": "Friendly but firm",
        "opening_line": "Hi, this is a test call.",
        "style": "collaborative",
    }
    response = client.post("/api/tasks", json=payload)
    assert response.status_code == 200
    return response.json()["id"]


def test_twilio_voice_webhook_returns_twiml(client) -> None:
    response = client.post("/twilio/voice", data={"task_id": "task_for_voice_webhook"})

    assert response.status_code == 200
    body = response.text
    assert body.startswith('<?xml version="1.0" encoding="UTF-8"?>')
    assert "<Response>" in body
    assert "<Connect>" in body
    assert "<Parameter name=\"task_id\" value=\"task_for_voice_webhook\" />" in body
    assert "task_id=task_for_voice_webhook" in body


def test_twilio_media_stream_events_are_handled_and_end_call(client) -> None:
    task_id = _create_task(client)

    with client.websocket_connect(f"/ws/call/{task_id}") as ws:
        connection = ws.receive_json()
        assert connection["type"] == "call_status"

        start_call = client.post(f"/api/tasks/{task_id}/call")
        assert start_call.status_code == 200
        assert start_call.json()["ok"] is True

        with client.websocket_connect(f"/twilio/media-stream?task_id={task_id}") as media_ws:
            media_ws.send_json({"event": "start", "start": {"streamSid": "stream_abc"}})
            media_ws.send_json(
                {
                    "event": "media",
                    "media": {"payload": base64.b64encode(b"test").decode("ascii")},
                }
            )
            media_ws.send_json(
                {
                    "event": "mark",
                    "mark": {
                        "name": "agent_turn_1",
                        "markTime": "123",
                        "sequenceNumber": 1,
                    },
                }
            )
            media_ws.send_json({"event": "stop"})

        statuses = [ws.receive_json() for _ in range(6)]
        status_values = {
            item["data"]["status"] for item in statuses if item["type"] == "call_status"
        }
        assert "media_connected" in status_values
        assert "mark" in status_values
        assert "ended" in status_values

    final = client.get(f"/api/tasks/{task_id}")
    assert final.status_code == 200
    assert final.json()["status"] == "ended"


def test_twilio_media_stream_resolves_task_from_call_sid_when_query_missing(client) -> None:
    task_id = _create_task(client)

    with client.websocket_connect(f"/ws/call/{task_id}") as ws:
        connection = ws.receive_json()
        assert connection["type"] == "call_status"

        start_call = client.post(f"/api/tasks/{task_id}/call")
        assert start_call.status_code == 200
        assert start_call.json()["ok"] is True

        with client.websocket_connect("/twilio/media-stream") as media_ws:
            media_ws.send_json(
                {
                    "event": "start",
                    "start": {
                        "streamSid": "stream_abc",
                        "callSid": f"mock_call_sid_{task_id}",
                    },
                }
            )
            media_ws.send_json(
                {
                    "event": "media",
                    "media": {"payload": base64.b64encode(b"test").decode("ascii")},
                }
            )
            media_ws.send_json({"event": "stop"})

            status_values = {
                item["data"]["status"]
                for item in [ws.receive_json() for _ in range(6)]
                if item["type"] == "call_status"
            }

        assert "media_connected" in status_values
        assert "ended" in status_values


def test_twilio_media_stream_resolves_task_from_start_payload_task_id_when_query_missing(client) -> None:
    task_id = _create_task(client)

    with client.websocket_connect(f"/ws/call/{task_id}") as ws:
        connection = ws.receive_json()
        assert connection["type"] == "call_status"

        start_call = client.post(f"/api/tasks/{task_id}/call")
        assert start_call.status_code == 200
        assert start_call.json()["ok"] is True

        with client.websocket_connect("/twilio/media-stream") as media_ws:
            media_ws.send_json(
                {
                    "event": "start",
                    "start": {
                        "streamSid": "stream_task_resolver",
                        "customParameters": {"task_id": task_id},
                    },
                }
            )
            media_ws.send_json(
                {
                    "event": "media",
                    "media": {"payload": base64.b64encode(b"test").decode("ascii")},
                }
            )
            media_ws.send_json({"event": "stop"})

            status_values = {
                item["data"]["status"]
                for item in [ws.receive_json() for _ in range(6)]
                if item["type"] == "call_status"
            }

        assert "media_connected" in status_values
        assert "ended" in status_values


def test_twilio_status_callback_without_task_id_can_end_call(client) -> None:
    task_id = _create_task(client)

    start_call = client.post(f"/api/tasks/{task_id}/call")
    assert start_call.status_code == 200

    response = client.post(
        "/twilio/status",
        data={
            "CallSid": f"mock_call_sid_{task_id}",
            "CallStatus": "completed",
        },
    )
    assert response.status_code == 200
    assert response.json()["ok"] is True

    task = client.get(f"/api/tasks/{task_id}").json()
    assert task["status"] == "ended"
