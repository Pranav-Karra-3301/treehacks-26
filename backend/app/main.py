from __future__ import annotations

import time
import uuid
from pathlib import Path
from typing import Any, List, Optional

from fastapi import FastAPI, Request, Response
from fastapi.middleware.cors import CORSMiddleware

from app.core.config import settings
from app.core.telemetry import configure_logging, log_event, timed_step
from app.services.orchestrator import CallOrchestrator
from app.services.cache import CacheService
from app.services.session_manager import SessionManager
from app.services.storage import DataStore
from app.services.supabase_store import SupabaseStore
from app.services.ws_manager import ConnectionManager
from app.routes import chat_sessions as chat_session_routes
from app.routes import llm_proxy as llm_proxy_routes
from app.routes import research as research_routes
from app.routes import system as system_routes
from app.routes import tasks as task_routes
from app.routes import telemetry as telemetry_routes
from app.routes import twilio as twilio_routes
from app.routes import ws as ws_routes


ALLOWED_ORIGINS_TYPE = List[str]


def create_app(
    *,
    store: Optional[DataStore] = None,
    session_manager: Optional[SessionManager] = None,
    ws_manager: Optional[ConnectionManager] = None,
    orchestrator: Optional[CallOrchestrator] = None,
    cache: Optional[CacheService] = None,
    data_root: str | Path | None = None,
    sqlite_path: str | Path | None = None,
    allowed_origins: Optional[ALLOWED_ORIGINS_TYPE] = None,
    llm_overrides: Optional[dict[str, Any]] = None,
) -> FastAPI:
    """Create the FastAPI app with injectable dependencies.

    This makes it easy to create isolated app instances for tests, including
    temporary data roots and mocked orchestrator/dependency objects.
    """

    if data_root is not None:
        settings.DATA_ROOT = Path(data_root)
    if sqlite_path is not None:
        settings.SQLITE_PATH = Path(sqlite_path)

    configure_logging()

    if store:
        local_store = store
    elif settings.SUPABASE_URL and (settings.SUPABASE_SERVICE_ROLE_KEY or settings.SUPABASE_ANON_KEY):
        local_store = SupabaseStore()
    else:
        local_store = DataStore(data_root=data_root, sqlite_path=sqlite_path)
    local_session_manager = session_manager or SessionManager()
    local_ws_manager = ws_manager or ConnectionManager()
    local_cache = cache or CacheService(
        redis_url=settings.REDIS_URL,
        enabled=settings.CACHE_ENABLED,
        default_ttl_seconds=settings.CACHE_DEFAULT_TTL_SECONDS,
        key_prefix=settings.CACHE_KEY_PREFIX,
    )
    local_orchestrator = orchestrator
    app = FastAPI(title="kiru Orchestrator")
    if local_orchestrator is None:
        local_orchestrator = CallOrchestrator(
            store=local_store,
            sessions=local_session_manager,
            ws_manager=local_ws_manager,
            **(llm_overrides or {}),
        )
    app.state.llm_client = getattr(local_orchestrator, "_llm", None)
    app.state.store = local_store
    app.state.session_manager = local_session_manager
    app.state.ws_manager = local_ws_manager
    app.state.orchestrator = local_orchestrator
    app.state.cache = local_cache

    app.include_router(task_routes.get_routes(local_store, local_orchestrator, local_cache))
    app.include_router(chat_session_routes.get_routes(local_store))
    app.include_router(ws_routes.get_routes(local_ws_manager, local_orchestrator))
    app.include_router(twilio_routes.get_routes(local_orchestrator, local_ws_manager))
    app.include_router(telemetry_routes.get_routes())
    app.include_router(research_routes.get_routes(local_cache))
    app.include_router(system_routes.get_routes(local_cache))
    app.include_router(llm_proxy_routes.get_routes())

    cors_origins = list(allowed_origins or settings.ALLOWED_ORIGINS)
    if not cors_origins:
        cors_origins = ["*"]

    allow_credentials = True
    allow_origin_regex = None

    # Browser-origin wildcard with credentials is blocked by CORS spec.
    # In dev we allow wildcard origins without credentials to avoid missing headers.
    if len(cors_origins) == 1 and cors_origins[0] == "*":
        allow_credentials = False
    else:
        has_local_host = any(
            "localhost" in origin or "127.0.0.1" in origin
            for origin in cors_origins
        )
        if has_local_host:
            allow_origin_regex = r"https?://(?:localhost|127\.0\.0\.1):[0-9]+"

    app.add_middleware(
        CORSMiddleware,
        allow_origins=cors_origins,
        allow_origin_regex=allow_origin_regex,
        allow_credentials=allow_credentials,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    @app.middleware("http")
    async def log_request_timing(request: Request, call_next):
        request_id = request.headers.get("x-request-id", str(uuid.uuid4()))
        request.state.request_id = request_id
        start = time.perf_counter()
        route = request.scope.get("route")
        route_path = getattr(route, "path", None)
        action = f"{request.method} {route_path or request.url.path}"
        should_skip_request_log = request.url.path in settings.LOG_SKIP_REQUEST_PATHS
        details = {
            "request_id": request_id,
            "route": route_path or str(request.url.path),
            "route_name": getattr(route, "name", None),
            "method": request.method,
            "query_params_count": len(request.query_params),
            "path_params_count": len(request.path_params),
            "content_type": request.headers.get("content-type"),
            "content_length": request.headers.get("content-length"),
            "client_ip": request.client.host if request.client else None,
            "user_agent": request.headers.get("user-agent"),
        }
        try:
            response = await call_next(request)
        except Exception as exc:
            elapsed_ms = (time.perf_counter() - start) * 1000.0
            details["status_code"] = 500
            details["error"] = f"{type(exc).__name__}: {exc}"
            details["path"] = str(request.url.path)
            log_event(
                "http",
                action,
                status="error",
                duration_ms=elapsed_ms,
                details=details,
            )
            raise
        else:
            elapsed_ms = (time.perf_counter() - start) * 1000.0
            details["status_code"] = response.status_code
            details["path"] = str(request.url.path)
            details["response_content_type"] = (
                response.headers.get("content-type") if isinstance(response, Response) else None
            )
            details["response_content_length"] = (
                response.headers.get("content-length") if isinstance(response, Response) else None
            )
            if not should_skip_request_log or details["status_code"] >= 400:
                log_event(
                    "http",
                    action,
                    status="ok",
                    duration_ms=elapsed_ms,
                    details=details,
                )
            return response

    @app.get("/health")
    async def health() -> dict:
        with timed_step("http", "healthcheck"):
            return {"status": "ok"}

    # On startup, mark any stale active/dialing calls as ended.
    # When Cloud Run recycles the container mid-call, those calls never get
    # properly ended — their status stays stuck as 'active' in the DB forever.
    @app.on_event("startup")
    async def cleanup_stale_calls() -> None:
        try:
            count = local_store.mark_stale_calls_ended()
            if count:
                log_event(
                    "system",
                    "cleanup_stale_calls",
                    details={"stale_calls_ended": count},
                )
        except Exception as exc:
            log_event(
                "system",
                "cleanup_stale_calls",
                status="error",
                details={"error": str(exc)},
            )

    # Ensure Supabase Storage audio bucket exists
    @app.on_event("startup")
    async def ensure_audio_bucket() -> None:
        try:
            local_store.ensure_audio_bucket()
        except Exception as exc:
            log_event(
                "system",
                "ensure_audio_bucket",
                status="warning",
                details={"error": str(exc)},
            )

    # Startup telemetry — dump full config so we can trace issues back to settings
    @app.on_event("startup")
    async def startup_telemetry() -> None:
        log_event(
            "system",
            "startup",
            details={
                "llm_provider": settings.LLM_PROVIDER,
                "llm_model": (
                    settings.VLLM_MODEL
                    if settings.LLM_PROVIDER in ("local", "ollama")
                    else settings.OPENAI_MODEL
                    if settings.LLM_PROVIDER == "openai"
                    else settings.GROQ_MODEL
                    if settings.LLM_PROVIDER == "groq"
                    else settings.ANTHROPIC_MODEL
                ),
                "llm_base_url": (
                    settings.VLLM_BASE_URL
                    if settings.LLM_PROVIDER in ("local", "ollama")
                    else settings.OPENAI_BASE_URL
                    if settings.LLM_PROVIDER == "openai"
                    else settings.GROQ_BASE_URL
                    if settings.LLM_PROVIDER == "groq"
                    else settings.ANTHROPIC_BASE_URL
                ),
                "llm_max_tokens_voice": settings.LLM_MAX_TOKENS_VOICE,
                "llm_max_tokens_analysis": settings.LLM_MAX_TOKENS_ANALYSIS,
                "llm_voice_context_turns": settings.LLM_VOICE_CONTEXT_TURNS,
                "llm_stream_timeout_seconds": settings.LLM_STREAM_TIMEOUT_SECONDS,
                "deepgram_voice_agent_enabled": settings.DEEPGRAM_VOICE_AGENT_ENABLED,
                "deepgram_listen_model": settings.DEEPGRAM_VOICE_AGENT_LISTEN_MODEL,
                "deepgram_speak_model": settings.DEEPGRAM_VOICE_AGENT_SPEAK_MODEL,
                "deepgram_think_provider": settings.DEEPGRAM_VOICE_AGENT_THINK_PROVIDER or "(inherit from LLM_PROVIDER)",
                "deepgram_think_model": settings.DEEPGRAM_VOICE_AGENT_THINK_MODEL or "(inherit from provider)",
                "deepgram_think_provider_effective": "openai",
                "deepgram_think_model_effective": settings.DEEPGRAM_VOICE_AGENT_THINK_MODEL or settings.OPENAI_MODEL,
                "twilio_configured": bool(settings.TWILIO_ACCOUNT_SID and settings.TWILIO_AUTH_TOKEN),
                "twilio_webhook_host": settings.TWILIO_WEBHOOK_HOST or "(not set)",
                "cache_enabled": settings.CACHE_ENABLED,
                "exa_search_enabled": settings.EXA_SEARCH_ENABLED,
                "log_level": settings.LOG_LEVEL,
            },
        )

    @app.on_event("shutdown")
    async def shutdown() -> None:
        llm_client = getattr(app.state, "llm_client", None)
        if llm_client is None:
            return

        close_fn = getattr(llm_client, "close", None)
        if close_fn is None or not callable(close_fn):
            return

        await close_fn()

    return app


app = create_app()
