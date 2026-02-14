from __future__ import annotations

import asyncio
import json
from typing import Any, Awaitable, Callable, Dict, Optional

import websockets

from app.core.config import settings
from app.core.telemetry import log_event, timed_step
from app.services.prompt_builder import build_negotiation_prompt, build_greeting


def _coerce_headers(raw: str) -> Dict[str, str]:
    if not raw:
        return {}
    try:
        parsed = json.loads(raw)
    except Exception:
        return {}
    if isinstance(parsed, dict):
        return {str(k): str(v) for k, v in parsed.items()}
    return {}


def _normalize_openai_endpoint(base_url: str) -> str:
    base = base_url.rstrip("/")
    if base.endswith("/v1"):
        return f"{base}/chat/completions"
    return f"{base}/v1/chat/completions"


def _build_think_payload(task: Dict[str, Any], endpoint_url: str) -> Dict[str, Any]:
    model = settings.DEEPGRAM_VOICE_AGENT_THINK_MODEL
    provider = settings.DEEPGRAM_VOICE_AGENT_THINK_PROVIDER.lower() if settings.DEEPGRAM_VOICE_AGENT_THINK_PROVIDER else ""

    if not provider:
        provider = settings.LLM_PROVIDER

    think_headers = {}
    if provider == "openai":
        if not model:
            model = settings.OPENAI_MODEL
        if not endpoint_url:
            endpoint_url = _normalize_openai_endpoint(settings.OPENAI_BASE_URL)
        if not endpoint_url and settings.OPENAI_API_KEY:
            think_headers["Authorization"] = f"Bearer {settings.OPENAI_API_KEY}"
    elif provider == "anthropic":
        if not model:
            model = settings.ANTHROPIC_MODEL
        if settings.ANTHROPIC_API_KEY and not think_headers:
            think_headers["x-api-key"] = settings.ANTHROPIC_API_KEY
    elif provider == "local":
        if not model:
            model = settings.VLLM_MODEL
        if not endpoint_url:
            endpoint_url = _normalize_openai_endpoint(settings.VLLM_BASE_URL)
    else:
        if not model:
            model = settings.OPENAI_MODEL

    think_headers = think_headers or _coerce_headers(settings.DEEPGRAM_VOICE_AGENT_THINK_ENDPOINT_HEADERS)

    think: Dict[str, Any] = {
        "provider": {
            "type": "open_ai" if provider in {"openai", "local"} else provider,
            "model": model,
            "temperature": settings.DEEPGRAM_VOICE_AGENT_THINK_TEMPERATURE,
        },
        "prompt": build_negotiation_prompt(task),
    }

    if endpoint_url:
        endpoint: Dict[str, Any] = {"url": endpoint_url}
        if think_headers:
            endpoint["headers"] = think_headers
        think["endpoint"] = endpoint

    if think_headers and not endpoint_url:
        think["endpoint"] = {"headers": think_headers}

    return think


class DeepgramVoiceAgentSession:
    """Manages one Deepgram Voice Agent websocket session."""

    def __init__(
        self,
        task_id: str,
        task: Dict[str, Any],
        on_conversation: Callable[[str, str], Awaitable[None]],
        on_agent_audio: Callable[[bytes], Awaitable[None]],
        on_thinking: Callable[[str], Awaitable[None]],
        on_event: Callable[[Dict[str, Any]], Awaitable[None]],
    ) -> None:
        self._task_id = task_id
        self._task = task
        self._on_conversation = on_conversation
        self._on_agent_audio = on_agent_audio
        self._on_thinking = on_thinking
        self._on_event = on_event

        self._ws: Optional[websockets.WebSocketClientProtocol] = None
        self._receive_task: Optional[asyncio.Task[None]] = None
        self._closed = False
        self._connected = asyncio.Event()
        self._settings_applied = asyncio.Event()
        self._is_ready = asyncio.Event()

    async def start(self) -> None:
        if self._closed:
            return

        with timed_step("deepgram", "voice_agent_connect", task_id=self._task_id):
            self._ws = await websockets.connect(
                settings.DEEPGRAM_VOICE_AGENT_WS_URL,
                subprotocols=["token", settings.DEEPGRAM_API_KEY],
            )
            self._receive_task = asyncio.create_task(self._receive_loop())

            try:
                await asyncio.wait_for(self._connected.wait(), timeout=2.5)
                await self._send_settings()
                await asyncio.wait_for(self._settings_applied.wait(), timeout=5.0)
            except asyncio.TimeoutError:
                log_event(
                    "deepgram",
                    "voice_agent_start_timeout",
                    task_id=self._task_id,
                    status="warning",
                    details={"reason": "agent_did_not_ready"},
                )
            self._is_ready.set()

    async def stop(self) -> None:
        if self._closed:
            return
        self._closed = True
        if self._receive_task is not None:
            self._receive_task.cancel()
            self._receive_task = None
        if self._ws is not None:
            await self._ws.close()
            self._ws = None
        log_event("deepgram", "voice_agent_session_stopped", task_id=self._task_id, status="ok")

    async def send_audio(self, data: bytes) -> None:
        if self._closed or self._ws is None:
            return
        if not self._is_ready.is_set():
            await asyncio.wait_for(self._is_ready.wait(), timeout=8.0)
        await self._ws.send(data)

    async def _send_settings(self) -> None:
        if self._ws is None:
            return

        think_endpoint = settings.DEEPGRAM_VOICE_AGENT_THINK_ENDPOINT_URL
        think = _build_think_payload(self._task, think_endpoint)

        settings_message = {
            "type": "Settings",
            "audio": {
                "input": {"encoding": "mulaw", "sample_rate": 8000},
                "output": {"encoding": "mulaw", "sample_rate": 8000, "container": "none"},
            },
            "agent": {
                "language": "en",
                "listen": {"provider": {"type": "deepgram", "model": settings.DEEPGRAM_VOICE_AGENT_LISTEN_MODEL}},
                "think": think,
                "speak": {
                    "provider": {"type": "deepgram", "model": settings.DEEPGRAM_VOICE_AGENT_SPEAK_MODEL}
                },
                "greeting": build_greeting(self._task),
            },
            "tags": [self._task_id],
        }

        await self._ws.send(json.dumps(settings_message))

    async def _receive_loop(self) -> None:
        if self._ws is None:
            return
        try:
            async for message in self._ws:
                if isinstance(message, str):
                    try:
                        payload = json.loads(message)
                    except Exception:
                        continue
                    await self._handle_text_message(payload)
                elif isinstance(message, (bytes, bytearray)):
                    audio = bytes(message)
                    if not audio:
                        continue
                    await self._on_agent_audio(audio)
        except asyncio.CancelledError:
            return
        except Exception as exc:
            log_event(
                "deepgram",
                "voice_agent_receive_error",
                task_id=self._task_id,
                status="error",
                details={"error": f"{type(exc).__name__}: {exc}"},
            )
            await self._on_event({"type": "Error", "description": f"{type(exc).__name__}: {exc}"})
        finally:
            self._closed = True
            if self._ws is not None:
                await self._ws.close()

    async def _handle_text_message(self, payload: Dict[str, Any]) -> None:
        message_type = payload.get("type")
        await self._on_event(payload)

        if message_type == "Welcome":
            self._connected.set()
            return
        if message_type == "SettingsApplied":
            self._settings_applied.set()
            return

        if message_type == "ConversationText":
            role = payload.get("role", "")
            content = (payload.get("content") or "").strip()
            if not content:
                return
            if role == "user":
                await self._on_conversation("caller", content)
            elif role == "assistant":
                await self._on_conversation("agent", content)
            return

        if message_type == "AgentThinking":
            content = payload.get("content", "")
            if content:
                await self._on_thinking(content)
            return

        if message_type in {"AgentStartedSpeaking", "UserStartedSpeaking", "AgentAudioDone"}:
            return
