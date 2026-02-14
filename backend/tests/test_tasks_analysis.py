from __future__ import annotations

import json

from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.core.config import settings
from app.routes.tasks import get_routes
from app.services.storage import DataStore


class _FakeEngine:
    async def summarize_turn(self, _transcript):
        return {
            "summary": "Negotiation concluded successfully",
            "outcome": "success",
            "concessions": [{"type": "offer", "detail": "reduced ask"}],
            "tactics": ["firm_constraints", "rapport_building"],
            "score": 77,
            "details": {"length_seconds_estimate": 11.2},
        }


class _FakeOrchestrator:
    def __init__(self) -> None:
        self._engine = _FakeEngine()


def test_task_analysis_uses_engine_summary(monkeypatch, tmp_path) -> None:
    monkeypatch.setattr(settings, "DATA_ROOT", tmp_path / "backend-data")
    monkeypatch.setattr(settings, "SQLITE_PATH", tmp_path / "backend-data" / "calls.db")

    app = FastAPI()
    store = DataStore()
    app.include_router(get_routes(store, _FakeOrchestrator()))

    payload = {
        "task_type": "custom",
        "target_phone": "+15550000000",
        "objective": "Negotiate a better rate",
        "context": "Hotel booking",
        "target_outcome": "Save 15%",
        "walkaway_point": "No discount below 10%",
        "agent_persona": "Friendly agent",
        "opening_line": "Hi there",
        "style": "collaborative",
    }

    task_id = "analysis-task"
    store.create_task(task_id, payload)

    transcript = [
        {
            "speaker": "caller",
            "content": "I can do this if you include breakfast",
            "created_at": "2024-01-01T00:00:00Z",
        },
        {
            "speaker": "agent",
            "content": "We can include breakfast if you confirm today",
            "created_at": "2024-01-01T00:00:01Z",
        },
    ]
    call_dir = store.get_task_dir(task_id)
    call_dir.mkdir(parents=True, exist_ok=True)
    with open(call_dir / "transcript.json", "w", encoding="utf-8") as f:
        json.dump(transcript, f)

    response = TestClient(app).get(f"/api/tasks/{task_id}/analysis")

    assert response.status_code == 200
    body = response.json()
    assert body["outcome"] == "success"
    assert body["summary"] == "Negotiation concluded successfully"
    assert body["score"] == 77
    assert body["concessions"] == [{"type": "offer", "detail": "reduced ask"}]
