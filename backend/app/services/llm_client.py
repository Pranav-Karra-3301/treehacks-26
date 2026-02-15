from __future__ import annotations

import json
import random
import time
import inspect
from typing import Any, AsyncGenerator, Dict, Iterable, List

import httpx

from app.core.config import settings
from app.core.telemetry import log_event


def _normalize_openai_chat_endpoint(base_url: str) -> str:
    base = base_url.rstrip("/")
    if base.endswith("/v1"):
        return f"{base}/chat/completions"
    return f"{base}/v1/chat/completions"


FALLBACK_RESPONSES = [
    "Sorry, I missed that -- could you say that again?",
    "Hey, I think we had a little connection issue. What was that last part?",
    "I didn't quite catch that. Could you repeat it?",
    "Oh sorry, you cut out for a second there. One more time?",
    "My signal's being weird -- what did you say?",
]


def _fallback_stream() -> Iterable[str]:
    response = random.choice(FALLBACK_RESPONSES)
    for word in response.split():
        yield word + " "


class OpenAICompatibleProvider:
    """OpenAI-style chat completions endpoint used by OpenAI, Azure, Ollama, vLLM, etc."""

    def __init__(
        self,
        base_url: str,
        api_key: str,
        model: str,
        *,
        provider_tag: str = "openai_compatible",
        timeout_seconds: float = 30.0,
        extra_body: Dict | None = None,
    ) -> None:
        self._base_url = base_url.rstrip("/")
        self._chat_url = _normalize_openai_chat_endpoint(self._base_url)
        self._api_key = api_key
        self._model = model
        self._provider_tag = provider_tag
        self._extra_body = extra_body or {}
        self._timeout = httpx.Timeout(
            connect=5.0,
            read=timeout_seconds,
            write=5.0,
            pool=5.0,
        )
        headers = {"Content-Type": "application/json"}
        if self._api_key:
            headers["Authorization"] = f"Bearer {self._api_key}"
        self._client = httpx.AsyncClient(
            timeout=self._timeout,
            headers=headers,
            limits=httpx.Limits(max_connections=20, max_keepalive_connections=5),
        )

    async def stream_completion(
        self, messages: List[Dict[str, str]], max_tokens: int = 200
    ) -> AsyncGenerator[str, None]:
        start_ts = time.perf_counter()
        started_at = time.perf_counter()
        first_token_ms = None
        token_count = 0
        total_chars = 0
        payload: Dict[str, Any] = {
            "model": self._model,
            "messages": messages,
            "stream": True,
            "max_tokens": max_tokens,
            **self._extra_body,
        }

        url = self._chat_url
        try:
            async with self._client.stream("POST", url, json=payload) as resp:
                resp.raise_for_status()
                async for raw_line in resp.aiter_lines():
                    if not raw_line.startswith("data:"):
                        continue
                    line = raw_line.removeprefix("data:").strip()
                    if line == "[DONE]":
                        break
                    if not line:
                        continue
                    data = json.loads(line)
                    choice = data["choices"][0]
                    delta = choice.get("delta", {})
                    content = delta.get("content")
                    if content:
                        if first_token_ms is None:
                            first_token_ms = (time.perf_counter() - started_at) * 1000.0
                        token_count += 1
                        total_chars += len(content)
                        yield content
        finally:
            total_ms = (time.perf_counter() - start_ts) * 1000.0
            log_event(
                "llm",
                "stream_completion",
                duration_ms=total_ms,
                details={
                    "provider": self._provider_tag,
                    "model": self._model,
                    "endpoint": url,
                    "token_count": token_count,
                    "chars": total_chars,
                    "first_token_ms": round(first_token_ms, 3) if first_token_ms is not None else None,
                    "max_tokens": max_tokens,
                },
            )

    async def aclose(self) -> None:
        await self._client.aclose()


class AnthropicProvider:
    """Anthropic Messages API streaming support."""

    def __init__(self, base_url: str, api_key: str, model: str) -> None:
        self._base_url = base_url.rstrip("/")
        self._api_key = api_key
        self._model = model

    def _prepare_messages(self, messages: List[Dict[str, str]]) -> tuple[str, List[Dict[str, str]]]:
        system_prompt = ""
        conversation = messages

        if messages and messages[0].get("role") == "system":
            system_prompt = messages[0].get("content", "")
            conversation = messages[1:]

        if not conversation:
            conversation = [{"role": "user", "content": ""}]

        return system_prompt, conversation

    async def stream_completion(
        self, messages: List[Dict[str, str]], max_tokens: int = 200
    ) -> AsyncGenerator[str, None]:
        start_ts = time.perf_counter()
        started_at = time.perf_counter()
        first_token_ms = None
        token_count = 0
        total_chars = 0
        system_prompt, conversation = self._prepare_messages(messages)

        payload = {
            "model": self._model,
            "max_tokens": max_tokens,
            "stream": True,
            "messages": conversation,
        }
        if system_prompt:
            payload["system"] = system_prompt

        headers = {
            "Content-Type": "application/json",
            "x-api-key": self._api_key,
            "anthropic-version": "2023-06-01",
            "anthropic-dangerous-direct-browser-access": "false",
        }

        url = f"{self._base_url}/messages"
        async with httpx.AsyncClient(timeout=None, headers=headers) as client:
            try:
                async with client.stream("POST", url, json=payload) as resp:
                    resp.raise_for_status()
                    current_event = ""
                    async for raw_line in resp.aiter_lines():
                        if raw_line.startswith("event:"):
                            current_event = raw_line.removeprefix("event:").strip()
                            continue
                        if not raw_line.startswith("data:"):
                            continue

                        line = raw_line.removeprefix("data:").strip()
                        if not line:
                            continue
                        data = json.loads(line)

                        if data.get("type") == "message_stop" or current_event == "message_stop":
                            break

                        if data.get("type") == "content_block_delta":
                            delta = data.get("delta", {})
                            text = delta.get("text") if isinstance(delta, dict) else None
                            if text:
                                if first_token_ms is None:
                                    first_token_ms = (time.perf_counter() - started_at) * 1000.0
                                token_count += 1
                                total_chars += len(text)
                                yield text
            finally:
                total_ms = (time.perf_counter() - start_ts) * 1000.0
                log_event(
                    "llm",
                    "stream_completion",
                    duration_ms=total_ms,
                    details={
                        "provider": "anthropic",
                        "model": self._model,
                        "endpoint": url,
                        "token_count": token_count,
                        "chars": total_chars,
                        "first_token_ms": round(first_token_ms, 3) if first_token_ms is not None else None,
                        "max_tokens": max_tokens,
                    },
                )


class LLMClient:
    """Thin modular wrapper over different LLM providers."""

    def __init__(self, provider: str | None = None) -> None:
        self._provider_name = (provider or settings.LLM_PROVIDER).strip().lower()

        if self._provider_name in ("local", "ollama"):
            extra_body = {}
            if settings.OLLAMA_KEEP_ALIVE:
                extra_body["keep_alive"] = settings.OLLAMA_KEEP_ALIVE
            self._provider = OpenAICompatibleProvider(
                base_url=settings.VLLM_BASE_URL,
                api_key=settings.VLLM_API_KEY,
                model=settings.VLLM_MODEL,
                provider_tag="ollama" if self._provider_name == "ollama" else "local",
                timeout_seconds=settings.LLM_STREAM_TIMEOUT_SECONDS,
                extra_body=extra_body,
            )
        elif self._provider_name == "openai":
            self._provider = OpenAICompatibleProvider(
                base_url=settings.OPENAI_BASE_URL,
                api_key=settings.OPENAI_API_KEY,
                model=settings.OPENAI_MODEL,
                provider_tag="openai",
                timeout_seconds=settings.LLM_STREAM_TIMEOUT_SECONDS,
            )
        elif self._provider_name == "groq":
            self._provider = OpenAICompatibleProvider(
                base_url=settings.GROQ_BASE_URL,
                api_key=settings.GROQ_API_KEY,
                model=settings.GROQ_MODEL,
                provider_tag="groq",
                timeout_seconds=settings.LLM_STREAM_TIMEOUT_SECONDS,
            )
        elif self._provider_name == "anthropic":
            self._provider = AnthropicProvider(
                base_url=settings.ANTHROPIC_BASE_URL,
                api_key=settings.ANTHROPIC_API_KEY,
                model=settings.ANTHROPIC_MODEL,
            )
        else:
            raise ValueError(f"Unsupported LLM provider '{self._provider_name}'")

    async def stream_completion(
        self, messages: List[Dict[str, str]], max_tokens: int = 200
    ) -> AsyncGenerator[str, None]:
        try:
            async for token in self._provider.stream_completion(messages, max_tokens=max_tokens):
                yield token
            return
        except Exception as exc:
            log_event(
                "llm",
                "stream_completion_fallback",
                status="fallback",
                details={"provider": self._provider_name, "error": f"{type(exc).__name__}: {exc}"},
            )
            # Keep the agent alive if the configured API is unavailable.
            for token in _fallback_stream():
                yield token

    async def close(self) -> None:
        close_fn = getattr(self._provider, "aclose", None)
        if close_fn is None or not callable(close_fn):
            return

        result = close_fn()
        if inspect.isawaitable(result):
            await result
