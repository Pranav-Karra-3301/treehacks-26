from __future__ import annotations

import pytest


@pytest.mark.ws
def test_websocket_receives_connection_event(client) -> None:
    payload = {
        "task_type": "custom",
        "target_phone": "+15550009999",
        "objective": "Test websocket",
        "context": "",
        "target_outcome": None,
        "walkaway_point": None,
        "agent_persona": None,
        "opening_line": None,
        "style": "collaborative",
    }

    response = client.post("/api/tasks", json=payload)
    assert response.status_code == 200
    task_id = response.json()["id"]

    with client.websocket_connect(f"/ws/call/{task_id}") as ws:
        message = ws.receive_json()
        assert message["type"] == "call_status"
        assert message["data"]["status"] == "connected"
