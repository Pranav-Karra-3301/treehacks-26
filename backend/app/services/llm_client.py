from __future__ import annotations

import json
import time
from typing import AsyncGenerator, Dict, Iterable, List

import httpx

from app.core.config import settings
from app.core.telemetry import log_event


FALLBACK_TOKENS = [
    "I",
    "can",
    "help",
    " with",
    "you",
    " now.",
    "Let\'s",
    "focus",
    "on",
    "the",
    "next",
    "step",
    "in",
    "this",
    "call.",
]


def _fallback_stream() -> Iterable[str]:
    for word in FALLBACK_TOKENS:
        yield word + " "


class OpenAICompatibleProvider:
    """OpenAI-style chat completions endpoint used by OpenAI, Azure, vLLM, etc."""

    def __init__(self, base_url: str, api_key: str, model: str) -> None:
        self._base_url = base_url.rstrip("/")
        self._api_key = api_key
        self._model = model

    async def stream_completion(
        self, messages: List[Dict[str, str]], max_tokens: int = 128
    ) -> AsyncGenerator[str, None]:
        start_ts = time.perf_counter()
        started_at = time.perf_counter()
        first_token_ms = None
        token_count = 0
        total_chars = 0
        payload = {
            "model": self._model,
            "messages": messages,
            "stream": True,
            "max_tokens": max_tokens,
        }

        headers = {"Content-Type": "application/json"}
        if self._api_key:
            headers["Authorization"] = f"Bearer {self._api_key}"

        url = f"{self._base_url}/v1/chat/completions"
        async with httpx.AsyncClient(timeout=None, headers=headers) as client:
            try:
                async with client.stream("POST", url, json=payload) as resp:
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
                        "provider": "openai_compatible",
                        "model": self._model,
                        "endpoint": url,
                        "token_count": token_count,
                        "chars": total_chars,
                        "first_token_ms": round(first_token_ms, 3) if first_token_ms is not None else None,
                        "max_tokens": max_tokens,
                    },
                )


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
        self, messages: List[Dict[str, str]], max_tokens: int = 128
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

        if self._provider_name == "local":
            self._provider = OpenAICompatibleProvider(
                base_url=settings.VLLM_BASE_URL,
                api_key=settings.VLLM_API_KEY,
                model=settings.VLLM_MODEL,
            )
        elif self._provider_name == "openai":
            self._provider = OpenAICompatibleProvider(
                base_url=settings.OPENAI_BASE_URL,
                api_key=settings.OPENAI_API_KEY,
                model=settings.OPENAI_MODEL,
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
        self, messages: List[Dict[str, str]], max_tokens: int = 128
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
