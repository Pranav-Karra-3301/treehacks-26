from __future__ import annotations

import asyncio
import json


class _FakeRedis:
    def __init__(self) -> None:
        self.storage: dict[str, str] = {}

    async def ping(self) -> bool:
        return True

    async def get(self, key: str) -> str | None:
        return self.storage.get(key)

    async def set(self, key: str, value: str, ex: int | None = None) -> bool:
        self.storage[key] = value
        return True

    async def delete(self, key: str) -> int:
        return 1 if self.storage.pop(key, None) is not None else 0

    async def exists(self, key: str) -> int:
        return 1 if key in self.storage else 0


def test_cache_service_roundtrip(monkeypatch) -> None:
    async def _test() -> None:
        fake_redis = _FakeRedis()
        monkeypatch.setattr(
            "app.services.cache.redis_asyncio.from_url",
            lambda *_, **__: fake_redis,  # type: ignore[no-any-return]
        )

        from app.services.cache import CacheService

        cache = CacheService(
            redis_url="redis://localhost:6379/0",
            enabled=True,
            default_ttl_seconds=60,
            key_prefix="kiru",
        )

        assert cache.enabled
        assert await cache.ping()

        cache_key = cache.key("research", "search", "hotel")
        payload = {"enabled": True, "query": "hotel", "results": [{"title": "Hotel"}]}
        assert await cache.set_json(cache_key, payload, ttl_seconds=30)
        assert await cache.exists(cache_key)
        loaded = await cache.get_json(cache_key)
        assert loaded == payload
        assert loaded is not None
        assert json.loads(fake_redis.storage[cache_key]) == payload

        assert await cache.delete(cache_key)
        assert not await cache.exists(cache_key)
        assert await cache.get_json(cache_key) is None

    asyncio.run(_test())


def test_cache_service_key_is_deterministic(monkeypatch) -> None:
    async def _test() -> None:
        monkeypatch.setattr(
            "app.services.cache.redis_asyncio.from_url",
            lambda *_, **__: _FakeRedis(),  # type: ignore[no-any-return]
        )

        from app.services.cache import CacheService

        cache = CacheService(redis_url="redis://localhost:6379/0", enabled=True)

        first = cache.key("research", "search", "query", 3)
        second = cache.key("research", "search", "query", 3)
        assert first == second
        assert first.startswith("kiru:")

        third = cache.key("research", "search", "query", 4)
        assert third != first

    asyncio.run(_test())
