from __future__ import annotations

from pathlib import Path

import pytest

from app.main import create_app


@pytest.mark.integration
def test_task_lifecycle_events(client, fake_twilio, app) -> None:
    payload = {
        "task_type": "custom",
        "target_phone": "+15550000000",
        "objective": "lower this plan price",
        "context": "Customer support call",
        "target_outcome": "Save 10%",
        "walkaway_point": "Never above $200",
        "agent_persona": "Calm and firm",
        "opening_line": "Hello, this is a test call",
        "style": "collaborative",
    }

    create_response = client.post("/api/tasks", json=payload)
    assert create_response.status_code == 200
    task = create_response.json()
    task_id = task["id"]

    # Start websocket monitoring before call lifecycle begins.
    with client.websocket_connect(f"/ws/call/{task_id}") as ws:
        connected = ws.receive_json()
        assert connected["type"] == "call_status"
        assert connected["data"]["status"] == "connected"

        start_response = client.post(f"/api/tasks/{task_id}/call")
        assert start_response.status_code == 200
        call_body = start_response.json()
        assert call_body["ok"] is True
        assert call_body["session_id"]

        events = []
        for _ in range(2):
            events.append(ws.receive_json())

        events.append(connected)
        stop_response = client.post(f"/api/tasks/{task_id}/stop")
        assert stop_response.status_code == 200
        events.append(ws.receive_json())

    assert any(event["type"] == "call_status" for event in events)
    statuses = {event["data"]["status"] for event in events if event["type"] == "call_status"}
    assert {"dialing", "active", "connected"}.issubset(statuses)

    get_response = client.get(f"/api/tasks/{task_id}")
    assert get_response.status_code == 200
    assert get_response.json()["status"] in {"active", "dialing", "ended"}

    assert fake_twilio.ended

    final = client.get(f"/api/tasks/{task_id}")
    assert final.json()["status"] == "ended"


@pytest.mark.integration
def test_recording_endpoints_return_metadata(tmp_path, client) -> None:
    payload = {
        "task_type": "custom",
        "target_phone": "+15550000001",
        "objective": "negotiation test",
        "context": "No context",
        "target_outcome": None,
        "walkaway_point": None,
        "agent_persona": None,
        "opening_line": None,
        "style": "collaborative",
    }
    create_response = client.post("/api/tasks", json=payload)
    task = create_response.json()
    task_id = task["id"]

    task_dir = tmp_path / "data" / task_id
    task_dir.mkdir(parents=True, exist_ok=True)
    with open(task_dir / "mixed.wav", "wb") as f:
        f.write(b"RIFF")

    # endpoint falls back to available wav when requested side is missing
    metadata_response = client.get(f"/api/tasks/{task_id}/recording-metadata")
    assert metadata_response.status_code == 200
    metadata = metadata_response.json()
    assert "files" in metadata

    files_response = client.get(f"/api/tasks/{task_id}/recording-files")
    assert files_response.status_code == 200
    files_payload = files_response.json()
    assert files_payload["files"]["mixed.wav"]["exists"] is True
