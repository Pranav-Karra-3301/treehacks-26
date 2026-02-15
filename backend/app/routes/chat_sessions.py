from __future__ import annotations

from fastapi import APIRouter, HTTPException, Query

from app.core.telemetry import timed_step
from app.models.schemas import (
    ChatSessionMode,
    ChatSessionPatchRequest,
    ChatSessionResponse,
    ChatSessionUpsertRequest,
)
from app.services.storage import DataStore


def get_routes(store: DataStore):
    router = APIRouter(prefix="/api/chat-sessions", tags=["chat-sessions"])

    @router.post("", response_model=ChatSessionResponse)
    async def upsert_chat_session(payload: ChatSessionUpsertRequest):
        with timed_step(
            "api",
            "upsert_chat_session",
            details={"session_id": payload.session_id, "mode": payload.mode, "revision": payload.revision},
        ):
            row = store.upsert_chat_session(
                payload.session_id,
                mode=payload.mode,
                revision=payload.revision,
                run_id=payload.run_id,
                task_ids=payload.task_ids,
                data=payload.data,
            )
            return ChatSessionResponse(**row)

    @router.patch("/{session_id}", response_model=ChatSessionResponse)
    async def patch_chat_session(session_id: str, payload: ChatSessionPatchRequest):
        with timed_step("api", "patch_chat_session", details={"session_id": session_id}):
            row = store.patch_chat_session(
                session_id,
                revision=payload.revision,
                run_id=payload.run_id,
                task_ids=payload.task_ids,
                data=payload.data,
            )
            if row is None:
                raise HTTPException(status_code=404, detail="Chat session not found")
            return ChatSessionResponse(**row)

    @router.get("/latest", response_model=ChatSessionResponse)
    async def get_latest_chat_session(mode: ChatSessionMode | None = Query(default=None)):
        with timed_step("api", "get_latest_chat_session", details={"mode": mode}):
            row = store.get_latest_chat_session(mode=mode)
            if row is None:
                raise HTTPException(status_code=404, detail="No chat sessions found")
            return ChatSessionResponse(**row)

    @router.get("/{session_id}", response_model=ChatSessionResponse)
    async def get_chat_session(session_id: str):
        with timed_step("api", "get_chat_session", details={"session_id": session_id}):
            row = store.get_chat_session(session_id)
            if row is None:
                raise HTTPException(status_code=404, detail="Chat session not found")
            return ChatSessionResponse(**row)

    @router.post("/{session_id}/heartbeat", response_model=ChatSessionResponse)
    async def heartbeat_chat_session(session_id: str):
        with timed_step("api", "chat_session_heartbeat", details={"session_id": session_id}):
            row = store.touch_chat_session(session_id)
            if row is None:
                raise HTTPException(status_code=404, detail="Chat session not found")
            return ChatSessionResponse(**row)

    return router

