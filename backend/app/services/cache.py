from __future__ import annotations

import hashlib
import json
from typing import Any, Optional

import redis.asyncio as redis_asyncio

from app.core.config import settings
from app.core.telemetry import log_event


class CacheService:
    """Redis-backed cache with graceful fallback when unavailable."""

    def __init__(
        self,
        *,
        redis_url: str | None = None,
        enabled: bool = False,
        default_ttl_seconds: int = 300,
        key_prefix: str = "negotiatai",
    ) -> None:
        self._enabled = bool(enabled)
        self._redis_url = (redis_url or settings.REDIS_URL or "").strip()
        self._ttl = default_ttl_seconds
        self._key_prefix = key_prefix
        self._client = None
        self._usable = False

        if self._enabled and self._redis_url:
            try:
                self._client = redis_asyncio.from_url(
                    self._redis_url,
                    decode_responses=True,
                )
            except Exception as exc:
                log_event(
                    "cache",
                    "init_error",
                    status="error",
                    details={"error": f"{type(exc).__name__}: {exc}"},
                )
                self._client = None
                self._enabled = False

    @property
    def prefix(self) -> str:
        return self._key_prefix

    @property
    def enabled(self) -> bool:
        return bool(self._enabled and self._redis_url and self._client is not None)

    def key(self, namespace: str, *parts: object) -> str:
        normalized = ":".join(str(part) for part in parts if part is not None)
        digest = hashlib.sha256(normalized.encode("utf-8")).hexdigest()
        return f"{self._key_prefix}:{namespace}:{digest}"

    async def ping(self) -> bool:
        if not self.enabled:
            return False
        if self._usable:
            return True
        try:
            await self._client.ping()  # type: ignore[union-attr]
            self._usable = True
            return True
        except Exception as exc:
            log_event(
                "cache",
                "ping_failed",
                status="error",
                details={"error": f"{type(exc).__name__}: {exc}"},
            )
            return False

    async def get_json(self, cache_key: str) -> Optional[Any]:
        if not self.enabled:
            return None
        try:
            if not await self.ping():
                return None
            raw = await self._client.get(cache_key)  # type: ignore[union-attr]
            if raw is None:
                return None
            return json.loads(raw)
        except Exception as exc:
            log_event(
                "cache",
                "get_json_failed",
                status="error",
                details={"key": cache_key, "error": f"{type(exc).__name__}: {exc}"},
            )
            return None

    async def set_json(self, cache_key: str, value: Any, *, ttl_seconds: int | None = None) -> bool:
        if not self.enabled:
            return False
        try:
            if not await self.ping():
                return False
            serialized = json.dumps(value)
            await self._client.set(cache_key, serialized, ex=int(ttl_seconds or self._ttl))  # type: ignore[union-attr]
            return True
        except Exception as exc:
            log_event(
                "cache",
                "set_json_failed",
                status="error",
                details={"key": cache_key, "error": f"{type(exc).__name__}: {exc}"},
            )
            return False

    async def delete(self, cache_key: str) -> bool:
        if not self.enabled:
            return False
        try:
            if not await self.ping():
                return False
            deleted = await self._client.delete(cache_key)  # type: ignore[union-attr]
            return bool(deleted)
        except Exception as exc:
            log_event(
                "cache",
                "delete_failed",
                status="error",
                details={"key": cache_key, "error": f"{type(exc).__name__}: {exc}"},
            )
            return False

    async def exists(self, cache_key: str) -> bool:
        if not self.enabled:
            return False
        try:
            if not await self.ping():
                return False
            exists = await self._client.exists(cache_key)  # type: ignore[union-attr]
            return bool(exists)
        except Exception as exc:
            log_event(
                "cache",
                "exists_failed",
                status="error",
                details={"key": cache_key, "error": f"{type(exc).__name__}: {exc}"},
            )
            return False

