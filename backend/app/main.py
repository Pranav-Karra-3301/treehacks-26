from __future__ import annotations

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.core.config import settings
from app.services.orchestrator import CallOrchestrator
from app.services.session_manager import SessionManager
from app.services.storage import DataStore
from app.services.ws_manager import ConnectionManager
from app.routes import tasks as task_routes
from app.routes import ws as ws_routes
from app.routes import twilio as twilio_routes

app = FastAPI(title="NegotiateAI Orchestrator")

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
app.include_router(ws_routes.get_routes(ws_manager))
app.include_router(twilio_routes.get_routes(orchestrator, ws_manager))


@app.get("/health")
def health() -> dict:
    return {"status": "ok"}
