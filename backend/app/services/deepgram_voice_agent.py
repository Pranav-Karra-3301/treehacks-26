from __future__ import annotations

import asyncio
import json
import time
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
    configured_provider = (
        settings.DEEPGRAM_VOICE_AGENT_THINK_PROVIDER.lower()
        if settings.DEEPGRAM_VOICE_AGENT_THINK_PROVIDER
        else settings.LLM_PROVIDER
    )
    if configured_provider != "openai":
        task_id = str(task.get("id") or task.get("task_id") or "unknown")
        log_event(
            "deepgram",
            "think_provider_forced_openai",
            task_id=task_id,
            status="warning",
            details={"configured_provider": configured_provider},
        )

    think_headers = {}
    if not model:
        model = settings.OPENAI_MODEL
    if not endpoint_url:
        endpoint_url = _normalize_openai_endpoint(settings.OPENAI_BASE_URL)
    if settings.OPENAI_API_KEY:
        think_headers["Authorization"] = f"Bearer {settings.OPENAI_API_KEY}"

    think_headers = think_headers or _coerce_headers(settings.DEEPGRAM_VOICE_AGENT_THINK_ENDPOINT_HEADERS)

    if settings.LLM_PROXY_API_KEY and endpoint_url and "/api/llm-proxy/" in endpoint_url:
        think_headers = {**think_headers}
        think_headers.setdefault("X-Llm-Proxy-Key", settings.LLM_PROXY_API_KEY)

    think: Dict[str, Any] = {
        "provider": {
            "type": "open_ai",
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


def _build_function_definitions(
    *,
    research_enabled: bool,
    dtmf_enabled: bool,
) -> list[Dict[str, Any]]:
    """Build function definitions for Deepgram voice agent tool use."""
    functions: list[Dict[str, Any]] = []
    if research_enabled:
        functions.append(
            {
                "name": "web_research",
                "description": (
                    "Search the web for real-time information during the call. "
                    "Use this when you need current pricing, competitor rates, market data, "
                    "company policies, promotions, or any factual information to strengthen "
                    "your negotiation position. Also use it to verify claims the other party makes."
                ),
                "parameters": {
                    "type": "object",
                    "properties": {
                        "query": {
                            "type": "string",
                            "description": "Concise search query for finding relevant information",
                        }
                    },
                    "required": ["query"],
                },
            }
        )
    if dtmf_enabled:
        functions.append(
            {
                "name": "send_keypad_tones",
                "description": (
                    "Send DTMF keypad tones on the active call to navigate IVR phone menus. "
                    "Use only when the other side requests a menu selection (for example: "
                    "'press 1 for sales', 'enter extension', or 'press # to confirm')."
                ),
                "parameters": {
                    "type": "object",
                    "properties": {
                        "digits": {
                            "type": "string",
                            "description": "DTMF digits sequence using 0-9, *, #, A-D, and optional pauses with w or comma.",
                        },
                        "reason": {
                            "type": "string",
                            "description": "Short reason for the keypad action.",
                        },
                    },
                    "required": ["digits"],
                },
            }
        )
    return functions


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
        on_research: Optional[Callable[[str], Awaitable[Dict[str, Any]]]] = None,
        on_send_dtmf: Optional[Callable[[str], Awaitable[Dict[str, Any]]]] = None,
    ) -> None:
        self._task_id = task_id
        self._task = task
        self._on_conversation = on_conversation
        self._on_agent_audio = on_agent_audio
        self._on_thinking = on_thinking
        self._on_event = on_event
        self._on_research = on_research
        self._on_send_dtmf = on_send_dtmf

        self._ws: Optional[websockets.WebSocketClientProtocol] = None
        self._receive_task: Optional[asyncio.Task[None]] = None
        self._closed = False
        self._connected = asyncio.Event()
        self._settings_applied = asyncio.Event()
        self._is_ready = asyncio.Event()

        # Telemetry counters
        self._audio_chunks_sent = 0
        self._audio_bytes_sent = 0
        self._audio_chunks_received = 0
        self._audio_bytes_received = 0
        self._messages_received = 0
        self._session_start_time: Optional[float] = None
        self._last_dtmf_digits = ""
        self._last_dtmf_at = 0.0

    async def start(self) -> None:
        if self._closed:
            return

        self._session_start_time = time.perf_counter()

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
                self._is_ready.set()
            except asyncio.TimeoutError:
                log_event(
                    "deepgram",
                    "voice_agent_start_timeout",
                    task_id=self._task_id,
                    status="warning",
                    details={"reason": "agent_did_not_ready"},
                )
                self._closed = True
                if self._receive_task:
                    self._receive_task.cancel()
                if self._ws:
                    await self._ws.close()
                raise RuntimeError("Deepgram voice agent did not become ready")

    async def stop(self) -> None:
        if self._closed:
            return
        self._closed = True
        # Close the WebSocket first so _receive_loop exits its async-for naturally
        if self._ws is not None:
            await self._ws.close()
            self._ws = None
        # Give the receive loop a moment to drain any final audio chunks
        if self._receive_task is not None:
            try:
                await asyncio.wait_for(asyncio.shield(self._receive_task), timeout=1.0)
            except (asyncio.TimeoutError, asyncio.CancelledError, Exception):
                self._receive_task.cancel()
            self._receive_task = None

        session_dur_ms = None
        if self._session_start_time is not None:
            session_dur_ms = (time.perf_counter() - self._session_start_time) * 1000.0

        log_event(
            "deepgram",
            "voice_agent_session_stopped",
            task_id=self._task_id,
            status="ok",
            duration_ms=session_dur_ms,
            details={
                "audio_chunks_sent": self._audio_chunks_sent,
                "audio_bytes_sent": self._audio_bytes_sent,
                "audio_chunks_received": self._audio_chunks_received,
                "audio_bytes_received": self._audio_bytes_received,
                "messages_received": self._messages_received,
            },
        )

    async def send_audio(self, data: bytes) -> None:
        if self._closed or self._ws is None:
            return
        if not self._is_ready.is_set():
            try:
                await asyncio.wait_for(self._is_ready.wait(), timeout=8.0)
            except asyncio.TimeoutError:
                log_event(
                    "deepgram",
                    "send_audio_ready_timeout",
                    task_id=self._task_id,
                    status="warning",
                )
                self._closed = True
                return
        try:
            await self._ws.send(data)
            self._audio_chunks_sent += 1
            self._audio_bytes_sent += len(data)
        except Exception:
            self._closed = True
            raise

    async def _send_settings(self) -> None:
        if self._ws is None:
            return

        think_endpoint = settings.DEEPGRAM_VOICE_AGENT_THINK_ENDPOINT_URL
        think = _build_think_payload(self._task, think_endpoint)

        # Add function calling when callbacks are available.
        function_definitions = _build_function_definitions(
            research_enabled=self._on_research is not None,
            dtmf_enabled=self._on_send_dtmf is not None,
        )
        if function_definitions:
            think["functions"] = function_definitions

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

        # === DEEPGRAM SETTINGS DEBUG LOGGING ===
        prompt_text = think.get("prompt", "")
        print(f"\n{'='*60}")
        print(f"[DEEPGRAM] Sending settings for task: {self._task_id}")
        print(f"[DEEPGRAM] Provider: {think.get('provider', {}).get('type')} | Model: {think.get('provider', {}).get('model')}")
        print(f"[DEEPGRAM] Greeting: {settings_message.get('agent', {}).get('greeting', 'N/A')}")
        print(f"[DEEPGRAM] System prompt ({len(prompt_text)} chars):")
        print(f"  {prompt_text[:600]}{'...' if len(prompt_text) > 600 else ''}")
        if think.get("functions"):
            print(f"[DEEPGRAM] Functions enabled: {[f['name'] for f in think['functions']]}")
        print(f"{'='*60}\n")

        with timed_step(
            "deepgram",
            "send_settings",
            task_id=self._task_id,
            details={
                "think_provider": think.get("provider", {}).get("type"),
                "think_model": think.get("provider", {}).get("model"),
                "think_endpoint": think.get("endpoint", {}).get("url", "default"),
                "listen_model": settings.DEEPGRAM_VOICE_AGENT_LISTEN_MODEL,
                "speak_model": settings.DEEPGRAM_VOICE_AGENT_SPEAK_MODEL,
            },
        ):
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
                    self._messages_received += 1
                    await self._handle_text_message(payload)
                elif isinstance(message, (bytes, bytearray)):
                    audio = bytes(message)
                    if not audio:
                        continue
                    self._audio_chunks_received += 1
                    self._audio_bytes_received += len(audio)
                    await self._on_agent_audio(audio)
        except asyncio.CancelledError:
            return
        except Exception as exc:
            log_event(
                "deepgram",
                "voice_agent_receive_error",
                task_id=self._task_id,
                status="error",
                details={
                    "error": f"{type(exc).__name__}: {exc}",
                    "messages_received": self._messages_received,
                    "audio_chunks_received": self._audio_chunks_received,
                },
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
            log_event("deepgram", "welcome_received", task_id=self._task_id)
            return
        if message_type == "SettingsApplied":
            self._settings_applied.set()
            log_event("deepgram", "settings_applied", task_id=self._task_id)
            return

        if message_type == "ConversationText":
            role = payload.get("role", "")
            content = (payload.get("content") or "").strip()
            if not content:
                return
            # === CONVERSATION DEBUG LOGGING ===
            speaker = "CALLER" if role == "user" else "AGENT"
            print(f"[CALL] {speaker}: {content}")
            log_event(
                "deepgram",
                "conversation_text",
                task_id=self._task_id,
                details={"role": role, "content_chars": len(content)},
            )
            if role == "user":
                await self._on_conversation("caller", content)
            elif role == "assistant":
                await self._on_conversation("agent", content)
            return

        if message_type == "AgentThinking":
            content = payload.get("content", "")
            if content:
                print(f"[CALL] AGENT THINKING: {content[:200]}")
                log_event(
                    "deepgram",
                    "agent_thinking",
                    task_id=self._task_id,
                    details={"content_chars": len(content)},
                )
                await self._on_thinking(content)
            return

        if message_type == "FunctionCalling":
            log_event("deepgram", "function_calling", task_id=self._task_id,
                      details={"function_name": payload.get("function_name")})
            return

        if message_type == "FunctionCallRequest":
            asyncio.create_task(self._handle_function_call(payload))
            return

        if message_type == "AgentStartedSpeaking":
            log_event("deepgram", "agent_started_speaking", task_id=self._task_id)
            return

        if message_type == "UserStartedSpeaking":
            log_event("deepgram", "user_started_speaking", task_id=self._task_id)
            return

        if message_type == "AgentAudioDone":
            log_event(
                "deepgram",
                "agent_audio_done",
                task_id=self._task_id,
                details={
                    "audio_chunks_received": self._audio_chunks_received,
                    "audio_bytes_received": self._audio_bytes_received,
                },
            )
            return

        if message_type == "Error":
            log_event(
                "deepgram",
                "agent_error",
                task_id=self._task_id,
                status="error",
                details={"message_type": message_type, "payload": payload},
            )
            return

        # Unrecognized message type
        log_event(
            "deepgram",
            "unhandled_message",
            task_id=self._task_id,
            details={"message_type": message_type},
        )

    async def _handle_function_call(self, payload: Dict[str, Any]) -> None:
        """Execute a function call from Deepgram and return the result."""
        function_name = payload.get("function_name", "")
        function_call_id = payload.get("function_call_id", "")
        parameters = payload.get("input", {})

        log_event(
            "deepgram", "function_call_request", task_id=self._task_id,
            details={"function": function_name, "params": parameters},
        )

        result: Dict[str, Any] = {}

        if function_name == "web_research" and self._on_research is not None:
            query = parameters.get("query", "")
            print(f"[CALL] RESEARCH REQUEST: query='{query}'")
            try:
                with timed_step("deepgram", "function_web_research", task_id=self._task_id,
                                details={"query": query}):
                    search_result = await self._on_research(query)
                    # Flatten into concise text for the LLM
                    snippets = []
                    for r in search_result.get("results", []):
                        title = r.get("title", "")
                        snippet = r.get("snippet", "")
                        if title or snippet:
                            snippets.append(f"{title}: {snippet[:200]}")
                    result = {
                        "query": query,
                        "findings": "\n".join(snippets[:5]) if snippets else "No results found.",
                        "result_count": len(snippets),
                    }
            except Exception as exc:
                log_event("deepgram", "function_call_error", task_id=self._task_id,
                          status="error", details={"error": f"{type(exc).__name__}: {exc}"})
                result = {"query": query, "findings": "Search temporarily unavailable.", "result_count": 0}
        elif function_name == "send_keypad_tones" and self._on_send_dtmf is not None:
            digits = str(parameters.get("digits", "") or "")
            reason = str(parameters.get("reason", "") or "")
            now = time.monotonic()
            if digits == self._last_dtmf_digits and (now - self._last_dtmf_at) < 2.0:
                result = {
                    "ok": False,
                    "digits": digits,
                    "error": "duplicate keypad request blocked (too soon)",
                }
                # Send immediate response without replaying the same tones repeatedly.
                response = {
                    "type": "FunctionCallResponse",
                    "function_call_id": function_call_id,
                    "output": json.dumps(result),
                }
                if self._ws and not self._closed:
                    try:
                        await self._ws.send(json.dumps(response))
                    except Exception:
                        pass
                return
            try:
                with timed_step(
                    "deepgram",
                    "function_send_keypad_tones",
                    task_id=self._task_id,
                    details={"digits": digits, "reason": reason[:120]},
                ):
                    send_result = await self._on_send_dtmf(digits)
                    self._last_dtmf_digits = digits
                    self._last_dtmf_at = now
                    result = {
                        "ok": True,
                        "digits": digits,
                        "reason": reason,
                        "status": send_result.get("status", "sent"),
                    }
            except Exception as exc:
                log_event(
                    "deepgram",
                    "function_call_error",
                    task_id=self._task_id,
                    status="error",
                    details={"error": f"{type(exc).__name__}: {exc}", "function": function_name},
                )
                result = {
                    "ok": False,
                    "digits": digits,
                    "error": f"{type(exc).__name__}: {exc}",
                }
        else:
            result = {"error": f"Unknown function: {function_name}"}

        # Send response back to Deepgram
        response = {
            "type": "FunctionCallResponse",
            "function_call_id": function_call_id,
            "output": json.dumps(result),
        }
        if self._ws and not self._closed:
            try:
                await self._ws.send(json.dumps(response))
                log_event("deepgram", "function_call_response", task_id=self._task_id,
                          details={"function": function_name, "result_count": result.get("result_count", 0)})
            except Exception as exc:
                log_event("deepgram", "function_call_response_error", task_id=self._task_id,
                          status="error", details={"error": f"{type(exc).__name__}: {exc}"})
