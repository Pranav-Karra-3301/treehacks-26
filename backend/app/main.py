from __future__ import annotations

import time
import uuid

from fastapi import FastAPI, Request, Response
from fastapi.middleware.cors import CORSMiddleware

from app.core.config import settings
from app.core.telemetry import configure_logging, log_event, timed_step
from app.services.orchestrator import CallOrchestrator
from app.services.session_manager import SessionManager
from app.services.storage import DataStore
from app.services.ws_manager import ConnectionManager
from app.routes import tasks as task_routes
from app.routes import ws as ws_routes
from app.routes import twilio as twilio_routes
from app.routes import telemetry as telemetry_routes
from app.routes import research as research_routes
from app.routes import system as system_routes

app = FastAPI(title="NegotiateAI Orchestrator")
configure_logging()

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

store = DataStore()
session_manager = SessionManager()
ws_manager = ConnectionManager()
orchestrator = CallOrchestrator(store, session_manager, ws_manager)

app.include_router(task_routes.get_routes(store, orchestrator))
app.include_router(ws_routes.get_routes(ws_manager, orchestrator))
app.include_router(twilio_routes.get_routes(orchestrator, ws_manager))
app.include_router(telemetry_routes.get_routes())
app.include_router(research_routes.get_routes())
app.include_router(system_routes.get_routes())


@app.middleware("http")
async def log_request_timing(request: Request, call_next):
    request_id = request.headers.get("x-request-id", str(uuid.uuid4()))
    request.state.request_id = request_id
    start = time.perf_counter()
    route = request.scope.get("route")
    route_path = getattr(route, "path", None)
    action = f"{request.method} {route_path or request.url.path}"
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
            response.headers.get("content-length")
            if isinstance(response, Response)
            else None
        )
        log_event(
            "http",
            action,
            status="ok",
            duration_ms=elapsed_ms,
            details=details,
        )
        return response


@app.get("/health")
def health() -> dict:
    with timed_step("http", "healthcheck"):
        return {"status": "ok"}
