from __future__ import annotations

import json
from typing import AsyncGenerator, Dict, List

import httpx

from app.core.config import settings


class LLMClient:
    """Streaming wrapper for an OpenAI-compatible endpoint (vLLM/TGI style)."""

    def __init__(self, base_url: str = settings.VLLM_BASE_URL, model: str = settings.VLLM_MODEL) -> None:
        self._base_url = base_url.rstrip("/")
        self._model = model

    async def stream_completion(
        self, messages: List[Dict[str, str]], max_tokens: int = 128
    ) -> AsyncGenerator[str, None]:
        payload = {
            "model": self._model,
            "messages": messages,
            "stream": True,
            "max_tokens": max_tokens,
        }

        url = f"{self._base_url}/v1/chat/completions"
        try:
            async with httpx.AsyncClient(timeout=None) as client:
                async with client.stream("POST", url, json=payload) as resp:
                    async for raw_line in resp.aiter_lines():
                        if not raw_line.startswith("data:"):
                            continue
                        line = raw_line.removeprefix("data:").strip()
                        if line == "[DONE]":
                            break
                        data = json.loads(line)
                        choice = data["choices"][0]
                        delta = choice.get("delta", {})
                        content = delta.get("content")
                        if content:
                            yield content
        except Exception:
            # Keep the agent alive if local model is down; replace with better fallback policy later.
            for word in [
                "I",
                "can",
                "help",
                " help",
                "you",
                "with",
                "that.",
                "Let\'s",
                "start",
                "with",
                "a",
                "brief",
                "confirmation",
            ]:
                yield word + " "
