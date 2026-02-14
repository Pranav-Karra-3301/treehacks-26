from __future__ import annotations

import asyncio
from pathlib import Path

from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.core.config import settings
from app.main import create_app
from app.models.schemas import CallOutcome
from app.routes.tasks import get_routes
from app.services.storage import DataStore


class _CountingCache:
    def __init__(self) -> None:
        self.data: dict[str, object] = {}
        self.enabled = True
        self.ping_calls = 0
        self.set_calls = 0
        self.delete_calls = 0

    def key(self, namespace: str, *parts: object) -> str:
        from hashlib import sha256

        normalized = ":".join(str(part) for part in parts)
        return f"kiru:{namespace}:{sha256(normalized.encode()).hexdigest()}"

    async def ping(self) -> bool:
        self.ping_calls += 1
        return True

    async def get_json(self, key: str):
        return self.data.get(key)

    async def set_json(self, key: str, value: object, ttl_seconds: int | None = None) -> bool:
        del ttl_seconds
        self.set_calls += 1
        self.data[key] = value
        return True

    async def delete(self, key: str) -> bool:
        self.delete_calls += 1
        return self.data.pop(key, None) is not None

    async def exists(self, key: str) -> bool:
        return key in self.data


class _CountingStore(DataStore):
    def __init__(self, data_root: Path, sqlite_path: Path):
        super().__init__(data_root=data_root, sqlite_path=sqlite_path)
        self.list_calls = 0

    def list_tasks(self):
        self.list_calls += 1
        return super().list_tasks()


def _build_task_payload() -> dict[str, str]:
    return {
        "task_type": "custom",
        "target_phone": "+15550000000",
        "objective": "negotiate better price",
        "context": "hotel booking",
        "target_outcome": "Lower by 20%",
        "walkaway_point": "No less than $100",
        "agent_persona": "Friendly and firm",
        "opening_line": "Hi there, this is a test call",
        "style": "collaborative",
    }


def test_research_route_uses_cache(monkeypatch, tmp_path) -> None:
    async def _test() -> None:
        cache = _CountingCache()
        calls = {"search": 0}

        async def _mock_search(self, _query, limit: int | None = None):  # noqa: ARG001
            calls["search"] += 1
            return {
                "enabled": True,
                "query": _query,
                "count": 1,
                "results": [
                    {
                        "title": "Cached hotel",
                        "url": "https://example.test/hotel",
                        "snippet": "great location",
                        "published": "2024-01-01",
                        "score": 0.99,
                    }
                ],
            }

        monkeypatch.setattr("app.routes.research.ExaSearchService.search", _mock_search)
        monkeypatch.setattr(settings, "EXA_SEARCH_ENABLED", True)
        monkeypatch.setattr(settings, "EXA_API_KEY", "exa")
        app = create_app(
            data_root=tmp_path / "cache-data",
            sqlite_path=tmp_path / "cache-data" / "calls.db",
            cache=cache,  # type: ignore[arg-type]
        )

        client = TestClient(app)
        first = client.post("/api/research", json={"query": "hotel", "limit": 2})
        second = client.post("/api/research", json={"query": "hotel", "limit": 2})

        assert first.status_code == 200
        assert second.status_code == 200
        assert first.json()["results"][0]["title"] == "Cached hotel"
        assert second.json()["results"][0]["title"] == "Cached hotel"
        assert calls["search"] == 1
        assert cache.set_calls == 1

    asyncio.run(_test())


def test_task_list_cached_and_invalidated(monkeypatch, tmp_path) -> None:
    async def _test() -> None:
        cache = _CountingCache()
        store = _CountingStore(
            data_root=tmp_path / "cache-data",
            sqlite_path=tmp_path / "cache-data" / "tasks.db",
        )
        app = create_app(
            data_root=tmp_path / "cache-data",
            sqlite_path=tmp_path / "cache-data" / "tasks.db",
            store=store,
            cache=cache,  # type: ignore[arg-type]
        )

        client = TestClient(app)

        first_list = client.get("/api/tasks")
        assert first_list.status_code == 200
        assert store.list_calls == 1

        client.post("/api/tasks", json=_build_task_payload())
        second_list = client.get("/api/tasks")
        assert second_list.status_code == 200
        assert store.list_calls == 2

        third_list = client.get("/api/tasks")
        assert third_list.status_code == 200
        assert store.list_calls == 2

    asyncio.run(_test())


class _FakeLLMClient:
    def stream_completion(self, messages, max_tokens: int = 128):
        return []


class _EngineWithCount:
    def __init__(self) -> None:
        self.summarize_calls = 0

    async def summarize_turn(self, transcript):
        self.summarize_calls += 1
        return {
            "summary": "cached analysis",
            "outcome": "success",
            "concessions": [{"type": "offer", "detail": "yes"}],
            "tactics": ["calm"],
            "score": 9,
            "details": {"length_seconds_estimate": 3.0},
        }


class _FakeOrchestrator:
    def __init__(self) -> None:
        self._engine = _EngineWithCount()


def test_task_analysis_cached(monkeypatch, tmp_path) -> None:
    async def _test() -> None:
        class _OutcomeStore(DataStore):
            pass

        cache = _CountingCache()
        store = DataStore(data_root=tmp_path / "analysis", sqlite_path=tmp_path / "analysis" / "calls.db")
        app = FastAPI()
        task_id = "analysis-task"
        payload = _build_task_payload()
        payload["style"] = "collaborative"
        store.create_task(task_id, payload)

        task_dir = store.get_task_dir(task_id)
        task_dir.mkdir(parents=True, exist_ok=True)
        with open(task_dir / "transcript.json", "w", encoding="utf-8") as f:
            f.write('[{"speaker":"caller","content":"can you lower the price","created_at":"2024-01-01T00:00:00Z"}]')

        app.include_router(
            get_routes(store, _FakeOrchestrator(), cache)  # type: ignore[arg-type]
        )
        client = TestClient(app)

        first = client.get(f"/api/tasks/{task_id}/analysis")
        second = client.get(f"/api/tasks/{task_id}/analysis")

        assert first.status_code == 200
        assert second.status_code == 200
        assert first.json()["summary"] == "cached analysis"
        assert second.json()["summary"] == "cached analysis"
        assert first.json() == second.json()
        assert cache.set_calls == 1

    asyncio.run(_test())
