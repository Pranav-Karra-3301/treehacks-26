from __future__ import annotations

import json
import time

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

    def _get_proxy_secret(request: Request) -> str:
        header_key = request.headers.get("x-llm-proxy-key", "")
        if not header_key:
            auth_header = request.headers.get("authorization", "").strip()
            if auth_header.lower().startswith("bearer "):
                header_key = auth_header[7:].strip()
        return header_key

    @router.post("/v1/chat/completions")
    async def proxy_chat_completions(request: Request):
        """Reverse-proxy OpenAI-compatible chat completions to the local LLM.

        Deepgram's cloud voice-agent calls this endpoint (via ngrok) so that
        the "think" step can reach a local Ollama / vLLM instance that is not
        otherwise publicly accessible.
        """
        t0 = time.perf_counter()
        body = await request.body()
        target_url = _normalize_openai_chat_endpoint(settings.VLLM_BASE_URL)

        # Extract model from request body for logging
        try:
            req_json = json.loads(body)
            model = req_json.get("model", "unknown")
            streaming = req_json.get("stream", False)
        except Exception:
            model = "unknown"
            streaming = False

        proxy_secret = settings.LLM_PROXY_API_KEY
        if proxy_secret:
            request_secret = _get_proxy_secret(request)
            if request_secret != proxy_secret:
                log_event(
                    "llm_proxy",
                    "proxy_auth_failed",
                    status="error",
                    details={"target": target_url, "model": model},
                )
                raise HTTPException(status_code=403, detail="proxy access denied")

        log_event(
            "llm_proxy",
            "forward_request",
            details={
                "target": target_url,
                "body_bytes": len(body),
                "model": model,
                "streaming": streaming,
            },
        )

        client = httpx.AsyncClient(timeout=httpx.Timeout(connect=5.0, read=60.0, write=5.0, pool=5.0))

        req = client.build_request(
            "POST",
            target_url,
            content=body,
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
            response_preview = None
            try:
                response_preview = exc.response.text[:500]
            except Exception:
                response_preview = ""
            log_event(
                "llm_proxy",
                "forward_http_error",
                status="error",
                duration_ms=elapsed_ms,
                details={
                    "target": target_url,
                    "model": model,
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
                "llm_proxy",
                "forward_request_error",
                status="error",
                duration_ms=elapsed_ms,
                details={
                    "target": target_url,
                    "model": model,
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
                "llm_proxy",
                "forward_error",
                status="error",
                duration_ms=elapsed_ms,
                details={
                    "target": target_url,
                    "model": model,
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
            "llm_proxy",
            "upstream_connected",
            duration_ms=connect_ms,
            details={
                "target": target_url,
                "model": model,
                "upstream_status": resp.status_code,
            },
        )

        total_bytes = 0
        chunk_count = 0
        first_byte_ms = None

        async def stream_response():
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
                    "llm_proxy",
                    "forward_complete",
                    duration_ms=elapsed_ms,
                    details={
                        "model": model,
                        "upstream_status": resp.status_code,
                        "total_bytes": total_bytes,
                        "chunk_count": chunk_count,
                        "first_byte_ms": round(first_byte_ms, 3) if first_byte_ms else None,
                        "streaming": streaming,
                    },
                )

        return StreamingResponse(
            stream_response(),
            status_code=resp.status_code,
            media_type=resp.headers.get("content-type", "application/json"),
        )

    return router
