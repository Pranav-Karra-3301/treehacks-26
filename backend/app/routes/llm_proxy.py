from __future__ import annotations

import json
import time
from typing import AsyncIterator

from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import StreamingResponse

import httpx

from app.core.config import settings
from app.core.telemetry import log_event


def get_routes():
    router = APIRouter(prefix="/api/llm-proxy", tags=["llm-proxy"])

    def _normalize_openai_chat_endpoint(base_url: str) -> str:
        base = base_url.rstrip("/")
        if base.endswith("/v1"):
            return f"{base}/chat/completions"
        return f"{base}/v1/chat/completions"

    def _ollama_native_chat_endpoint(base_url: str) -> str:
        return base_url.rstrip("/") + "/api/chat"

    def _get_proxy_secret(request: Request) -> str:
        header_key = request.headers.get("x-llm-proxy-key", "")
        if not header_key:
            auth_header = request.headers.get("authorization", "").strip()
            if auth_header.lower().startswith("bearer "):
                header_key = auth_header[7:].strip()
        return header_key

    def _is_ollama_provider() -> bool:
        return settings.LLM_PROVIDER in ("ollama", "local")

    # ------------------------------------------------------------------
    # Ollama-native translation helpers
    # ------------------------------------------------------------------

    def _nothink_model_name(model: str) -> str:
        """Return the ``-nothink`` variant of a model name.

        We maintain a custom Ollama Modelfile (``Modelfile.nothink``) that
        derives from the base model but pre-fills the ``<think>`` block as
        closed.  This stops Qwen-3 from generating chain-of-thought tokens
        so every output token is spoken dialogue — no reasoning leak and no
        multi-second thinking delay.
        """
        if model.endswith("-nothink"):
            return model
        # Strip any tag (e.g. "qwen3:30b-a3b" → "qwen3-nothink")
        base = model.split(":")[0] if ":" in model else model
        return f"{base}-nothink"

    def _openai_to_ollama_request(openai_body: dict) -> dict:
        """Translate an OpenAI chat-completion request to Ollama /api/chat.

        Uses the ``-nothink`` model variant whose template pre-fills a
        closed ``<think>`` block, so the model outputs only spoken dialogue
        with zero thinking delay (<300ms to first token).
        """
        base_model = openai_body.get("model", settings.VLLM_MODEL)

        ollama_req: dict = {
            "model": _nothink_model_name(base_model),
            "messages": openai_body.get("messages", []),
            "stream": openai_body.get("stream", False),
            "think": False,
        }
        opts: dict = {}
        if "max_tokens" in openai_body:
            opts["num_predict"] = openai_body["max_tokens"]
        else:
            # Cap output for voice — 1-3 spoken sentences need ~150 tokens max
            opts["num_predict"] = 150
        if "temperature" in openai_body:
            opts["temperature"] = openai_body["temperature"]
        if "top_p" in openai_body:
            opts["top_p"] = openai_body["top_p"]
        if "stop" in openai_body:
            opts["stop"] = openai_body["stop"]
        if opts:
            ollama_req["options"] = opts
        return ollama_req

    def _ollama_chunk_to_openai_sse(chunk_json: dict, chunk_id: str) -> bytes | None:
        """Convert a single Ollama streaming JSON line to an OpenAI SSE chunk.

        With ``think: false`` + ``/no_think``, the model should only produce
        content tokens (no separate thinking field).  Forward them directly.
        """
        msg = chunk_json.get("message", {})
        content = msg.get("content", "")
        done = chunk_json.get("done", False)

        finish_reason = "stop" if done else None

        openai_chunk = {
            "id": chunk_id,
            "object": "chat.completion.chunk",
            "created": int(time.time()),
            "model": chunk_json.get("model", ""),
            "choices": [{
                "index": 0,
                "delta": {"content": content} if content else {},
                "finish_reason": finish_reason,
            }],
        }
        return b"data: " + json.dumps(openai_chunk).encode() + b"\n\n"

    def _ollama_final_to_openai(resp_json: dict) -> dict:
        """Convert a non-streaming Ollama response to OpenAI format."""
        msg = resp_json.get("message", {})
        return {
            "id": f"chatcmpl-ollama-{int(time.time())}",
            "object": "chat.completion",
            "created": int(time.time()),
            "model": resp_json.get("model", ""),
            "choices": [{
                "index": 0,
                "message": {
                    "role": msg.get("role", "assistant"),
                    "content": msg.get("content", ""),
                },
                "finish_reason": "stop",
            }],
            "usage": {
                "prompt_tokens": resp_json.get("prompt_eval_count", 0),
                "completion_tokens": resp_json.get("eval_count", 0),
                "total_tokens": (
                    resp_json.get("prompt_eval_count", 0)
                    + resp_json.get("eval_count", 0)
                ),
            },
        }

    # ------------------------------------------------------------------
    # Shared SSE reasoning-strip (fallback for non-Ollama providers)
    # ------------------------------------------------------------------

    def _strip_reasoning_from_sse(raw: bytes, counter: list[int]) -> bytes:
        """Remove ``reasoning`` field from SSE chunks."""
        lines = raw.split(b"\n")
        out_lines: list[bytes] = []
        for line in lines:
            if not line.startswith(b"data: ") or line == b"data: [DONE]":
                out_lines.append(line)
                continue
            try:
                payload = json.loads(line[6:])
                choices = payload.get("choices") or []
                modified = False
                for choice in choices:
                    delta = choice.get("delta", {})
                    if "reasoning" in delta:
                        counter[0] += len(delta["reasoning"] or "")
                        del delta["reasoning"]
                        modified = True
                if modified:
                    out_lines.append(b"data: " + json.dumps(payload).encode())
                else:
                    out_lines.append(line)
            except (json.JSONDecodeError, KeyError):
                out_lines.append(line)
        return b"\n".join(out_lines)

    # ------------------------------------------------------------------
    # Main proxy endpoint
    # ------------------------------------------------------------------

    @router.post("/v1/chat/completions")
    async def proxy_chat_completions(request: Request):
        """Reverse-proxy OpenAI-compatible chat completions to the local LLM.

        Deepgram's cloud voice-agent calls this endpoint (via ngrok) so that
        the "think" step can reach a local Ollama / vLLM instance that is not
        otherwise publicly accessible.

        When the LLM provider is Ollama, the proxy translates to the native
        ``/api/chat`` endpoint with ``think: false`` to skip the extended
        reasoning phase that causes multi-second latency and confuses
        Deepgram's TTS pipeline.
        """
        t0 = time.perf_counter()
        body = await request.body()

        try:
            req_json = json.loads(body)
            model = req_json.get("model", "unknown")
            streaming = req_json.get("stream", False)
        except Exception:
            req_json = {}
            model = "unknown"
            streaming = False

        # Auth check
        proxy_secret = settings.LLM_PROXY_API_KEY
        if proxy_secret:
            request_secret = _get_proxy_secret(request)
            if request_secret != proxy_secret:
                log_event(
                    "llm_proxy", "proxy_auth_failed", status="error",
                    details={"model": model},
                )
                raise HTTPException(status_code=403, detail="proxy access denied")

        use_ollama_native = _is_ollama_provider()

        if use_ollama_native:
            target_url = _ollama_native_chat_endpoint(settings.VLLM_BASE_URL)
            ollama_body = _openai_to_ollama_request(req_json)
            body = json.dumps(ollama_body).encode()
        else:
            target_url = _normalize_openai_chat_endpoint(settings.VLLM_BASE_URL)

        log_event(
            "llm_proxy", "forward_request",
            details={
                "target": target_url,
                "body_bytes": len(body),
                "model": model,
                "streaming": streaming,
                "native_ollama": use_ollama_native,
            },
        )

        client = httpx.AsyncClient(
            timeout=httpx.Timeout(connect=5.0, read=60.0, write=5.0, pool=5.0),
        )

        req = client.build_request(
            "POST", target_url, content=body,
            headers={
                "Content-Type": "application/json",
                "Accept": request.headers.get("Accept", "application/json"),
            },
        )

        try:
            resp = await client.send(req, stream=True)
            resp.raise_for_status()
        except httpx.HTTPStatusError as exc:
            elapsed_ms = (time.perf_counter() - t0) * 1000.0
            upstream_status = exc.response.status_code
            response_preview = ""
            try:
                response_preview = exc.response.text[:500]
            except Exception:
                pass
            log_event(
                "llm_proxy", "forward_http_error", status="error",
                duration_ms=elapsed_ms,
                details={
                    "target": target_url, "model": model,
                    "upstream_status": upstream_status,
                    "error": f"{type(exc).__name__}: {exc}",
                    "response_preview": response_preview,
                },
            )
            await resp.aclose()
            await client.aclose()
            raise HTTPException(
                status_code=upstream_status if upstream_status < 500 else 502,
                detail=f"llm proxy upstream error: {type(exc).__name__}: {exc}",
            )
        except httpx.RequestError as exc:
            elapsed_ms = (time.perf_counter() - t0) * 1000.0
            log_event(
                "llm_proxy", "forward_request_error", status="error",
                duration_ms=elapsed_ms,
                details={
                    "target": target_url, "model": model,
                    "error": f"{type(exc).__name__}: {exc}",
                },
            )
            await client.aclose()
            raise HTTPException(
                status_code=502,
                detail=f"llm proxy request failed: {type(exc).__name__}: {exc}",
            )
        except Exception as exc:
            elapsed_ms = (time.perf_counter() - t0) * 1000.0
            log_event(
                "llm_proxy", "forward_error", status="error",
                duration_ms=elapsed_ms,
                details={
                    "target": target_url, "model": model,
                    "error": f"{type(exc).__name__}: {exc}",
                },
            )
            await client.aclose()
            raise HTTPException(
                status_code=500,
                detail=f"llm proxy unexpected error: {type(exc).__name__}: {exc}",
            )

        connect_ms = (time.perf_counter() - t0) * 1000.0
        log_event(
            "llm_proxy", "upstream_connected", duration_ms=connect_ms,
            details={
                "target": target_url, "model": model,
                "upstream_status": resp.status_code,
            },
        )

        total_bytes = 0
        chunk_count = 0
        first_byte_ms = None
        reasoning_stripped = [0]  # mutable counter for nested closures

        # --- Ollama-native streaming: NDJSON → OpenAI SSE ---
        async def _stream_ollama_as_sse() -> AsyncIterator[bytes]:
            nonlocal total_bytes, chunk_count, first_byte_ms
            chunk_id = f"chatcmpl-{int(time.time())}"
            buf = b""
            try:
                async for raw in resp.aiter_bytes():
                    if first_byte_ms is None:
                        first_byte_ms = (time.perf_counter() - t0) * 1000.0
                    buf += raw
                    # Ollama streams newline-delimited JSON
                    while b"\n" in buf:
                        line, buf = buf.split(b"\n", 1)
                        line = line.strip()
                        if not line:
                            continue
                        try:
                            obj = json.loads(line)
                        except json.JSONDecodeError:
                            continue
                        sse = _ollama_chunk_to_openai_sse(obj, chunk_id)
                        if sse is not None:
                            total_bytes += len(sse)
                            chunk_count += 1
                            yield sse
                # flush remaining
                if buf.strip():
                    try:
                        obj = json.loads(buf)
                        sse = _ollama_chunk_to_openai_sse(obj, chunk_id)
                        if sse is not None:
                            total_bytes += len(sse)
                            chunk_count += 1
                            yield sse
                    except json.JSONDecodeError:
                        pass
                yield b"data: [DONE]\n\n"
            finally:
                await resp.aclose()
                await client.aclose()
                elapsed_ms = (time.perf_counter() - t0) * 1000.0
                log_event(
                    "llm_proxy", "forward_complete", duration_ms=elapsed_ms,
                    details={
                        "model": model, "upstream_status": resp.status_code,
                        "total_bytes": total_bytes, "chunk_count": chunk_count,
                        "first_byte_ms": round(first_byte_ms, 3) if first_byte_ms else None,
                        "streaming": True, "native_ollama": True,
                    },
                )

        # --- Ollama-native non-streaming: read full, translate ---
        async def _respond_ollama_non_streaming():
            nonlocal total_bytes, first_byte_ms
            try:
                data = await resp.aread()
                first_byte_ms = (time.perf_counter() - t0) * 1000.0
                total_bytes = len(data)
                ollama_resp = json.loads(data)
                openai_resp = _ollama_final_to_openai(ollama_resp)
                return openai_resp
            finally:
                await resp.aclose()
                await client.aclose()
                elapsed_ms = (time.perf_counter() - t0) * 1000.0
                log_event(
                    "llm_proxy", "forward_complete", duration_ms=elapsed_ms,
                    details={
                        "model": model, "upstream_status": resp.status_code,
                        "total_bytes": total_bytes,
                        "first_byte_ms": round(first_byte_ms, 3) if first_byte_ms else None,
                        "streaming": False, "native_ollama": True,
                    },
                )

        # --- OpenAI-passthrough streaming (with reasoning strip) ---
        async def _stream_openai_passthrough() -> AsyncIterator[bytes]:
            nonlocal total_bytes, chunk_count, first_byte_ms
            try:
                async for chunk in resp.aiter_bytes():
                    if first_byte_ms is None:
                        first_byte_ms = (time.perf_counter() - t0) * 1000.0
                    chunk = _strip_reasoning_from_sse(chunk, reasoning_stripped)
                    total_bytes += len(chunk)
                    chunk_count += 1
                    yield chunk
            finally:
                await resp.aclose()
                await client.aclose()
                elapsed_ms = (time.perf_counter() - t0) * 1000.0
                log_event(
                    "llm_proxy", "forward_complete", duration_ms=elapsed_ms,
                    details={
                        "model": model, "upstream_status": resp.status_code,
                        "total_bytes": total_bytes, "chunk_count": chunk_count,
                        "first_byte_ms": round(first_byte_ms, 3) if first_byte_ms else None,
                        "streaming": streaming,
                        "reasoning_bytes_stripped": reasoning_stripped[0],
                    },
                )

        # --- OpenAI-passthrough non-streaming ---
        async def _stream_openai_raw() -> AsyncIterator[bytes]:
            nonlocal total_bytes, chunk_count, first_byte_ms
            try:
                async for chunk in resp.aiter_bytes():
                    if first_byte_ms is None:
                        first_byte_ms = (time.perf_counter() - t0) * 1000.0
                    total_bytes += len(chunk)
                    chunk_count += 1
                    yield chunk
            finally:
                await resp.aclose()
                await client.aclose()
                elapsed_ms = (time.perf_counter() - t0) * 1000.0
                log_event(
                    "llm_proxy", "forward_complete", duration_ms=elapsed_ms,
                    details={
                        "model": model, "upstream_status": resp.status_code,
                        "total_bytes": total_bytes, "chunk_count": chunk_count,
                        "first_byte_ms": round(first_byte_ms, 3) if first_byte_ms else None,
                        "streaming": streaming,
                    },
                )

        # Dispatch
        if use_ollama_native:
            if streaming:
                return StreamingResponse(
                    _stream_ollama_as_sse(),
                    status_code=200,
                    media_type="text/event-stream; charset=utf-8",
                )
            else:
                result = await _respond_ollama_non_streaming()
                return result
        else:
            if streaming:
                return StreamingResponse(
                    _stream_openai_passthrough(),
                    status_code=resp.status_code,
                    media_type=resp.headers.get("content-type", "application/json"),
                )
            else:
                return StreamingResponse(
                    _stream_openai_raw(),
                    status_code=resp.status_code,
                    media_type=resp.headers.get("content-type", "application/json"),
                )

    return router
