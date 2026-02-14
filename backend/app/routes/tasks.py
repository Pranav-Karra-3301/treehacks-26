from __future__ import annotations

import json
from pathlib import Path
from typing import List
from uuid import uuid4

from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import FileResponse

from app.models.schemas import AnalysisPayload, ActionResponse, CallOutcome, TaskDetail, TaskSummary, TranscriptTurn
from app.models.schemas import NegotiationTaskCreate
from app.services.orchestrator import CallOrchestrator
from app.services.storage import DataStore
from app.core.telemetry import timed_step


router = APIRouter(prefix="/api/tasks", tags=["tasks"])


def get_routes(store: DataStore, orchestrator: CallOrchestrator):
    def _build_recording_files(call_dir: Path) -> dict[str, object]:
        file_stats = {}
        for name in ("inbound.wav", "outbound.wav", "mixed.wav", "recording_stats.json"):
            path = call_dir / name
            file_stats[name] = {
                "exists": path.exists(),
                "size_bytes": path.stat().st_size if path.exists() else 0,
            }
        return file_stats

    @router.post("", response_model=TaskSummary)
    async def create_task(task: NegotiationTaskCreate):
        with timed_step("api", "create_task"):
            task_id = str(uuid4())
            payload = task.model_dump()
            store.create_task(task_id, payload)
            row = store.get_task(task_id)
            return TaskSummary(**row)

    @router.get("", response_model=List[TaskSummary])
    async def list_tasks():
        with timed_step("api", "list_tasks"):
            return [TaskSummary(**row) for row in store.list_tasks()]

    @router.get("/{task_id}", response_model=TaskDetail)
    async def get_task(task_id: str):
        with timed_step("api", "get_task", task_id=task_id):
            row = store.get_task(task_id)
            if not row:
                raise HTTPException(status_code=404, detail="Task not found")
            row.update({k: row.get(k, None) for k in ["context", "target_outcome", "walkaway_point", "agent_persona", "opening_line", "style"]})
            return TaskDetail(**row)

    @router.post("/{task_id}/call", response_model=ActionResponse)
    async def start_call(task_id: str):
        with timed_step("api", "start_call", task_id=task_id):
            row = store.get_task(task_id)
            if not row:
                raise HTTPException(status_code=404, detail="Task not found")
            payload = await orchestrator.start_task_call(task_id, row)
            return ActionResponse(ok=True, message="call started", session_id=payload["session_id"])

    @router.post("/{task_id}/stop", response_model=ActionResponse)
    async def stop_call(task_id: str):
        with timed_step("api", "stop_call", task_id=task_id):
            await orchestrator.stop_task_call(task_id)
            return ActionResponse(ok=True, message="call stopped")

    @router.get("/{task_id}/audio")
    async def get_audio(task_id: str, side: str = Query(default="mixed")):
        with timed_step("api", "get_audio", task_id=task_id, details={"side": side}):
            call_dir = store.get_task_dir(task_id)
            if not call_dir.exists():
                raise HTTPException(status_code=404, detail="Task recordings not found")

            files = {
                "mixed": call_dir / "mixed.wav",
                "inbound": call_dir / "inbound.wav",
                "outbound": call_dir / "outbound.wav",
            }

            selected = side if side in files else "mixed"
            file_path = files[selected]
            if not file_path.exists():
                # Fallback to the first available wav when preferred side is missing.
                fallback = next(iter(sorted(call_dir.glob("*.wav"))), None)
                if not fallback:
                    raise HTTPException(status_code=404, detail="No audio for task")
                file_path = fallback

            return FileResponse(file_path, media_type="audio/wav", filename=file_path.name)

    @router.get("/{task_id}/recording-metadata")
    async def get_recording_metadata(task_id: str):
        with timed_step("api", "get_recording_metadata", task_id=task_id):
            call_dir = store.get_task_dir(task_id)
            metadata_path = call_dir / "recording_stats.json"
            if not call_dir.exists():
                raise HTTPException(status_code=404, detail="Task recordings not found")
            if not metadata_path.exists():
                metadata = {
                    "task_id": task_id,
                    "status": "missing",
                    "bytes_by_side": {"caller": 0, "agent": 0, "mixed": 0},
                    "chunks_by_side": {"caller": 0, "agent": 0},
                    "last_chunk_at": None,
                }
                return {
                    "recording": {},
                    "files": _build_recording_files(call_dir),
                    **metadata,
                }

            with open(metadata_path, "r", encoding="utf-8") as f:
                metadata = json.load(f)
            metadata["files"] = _build_recording_files(call_dir)
            return metadata

    @router.get("/{task_id}/recording-files")
    async def get_recording_files(task_id: str):
        with timed_step("api", "get_recording_files", task_id=task_id):
            call_dir = store.get_task_dir(task_id)
            if not call_dir.exists():
                raise HTTPException(status_code=404, detail="Task recordings not found")
            return {
                "task_id": task_id,
                "files": _build_recording_files(call_dir),
            }

    @router.get("/{task_id}/analysis", response_model=AnalysisPayload)
    async def get_analysis(task_id: str):
        with timed_step("api", "get_analysis", task_id=task_id):
            row = store.get_task(task_id)
            if not row:
                raise HTTPException(status_code=404, detail="Task not found")

            call_dir = store.get_task_dir(task_id)
            analysis_path = call_dir / "analysis.json"
            if analysis_path.exists():
                with open(analysis_path, "r", encoding="utf-8") as f:
                    return AnalysisPayload(**json.load(f))

            transcript_file = call_dir / "transcript.json"
            transcript: List[TranscriptTurn] = []
            if transcript_file.exists():
                with open(transcript_file, "r", encoding="utf-8") as f:
                    transcript = [TranscriptTurn(**entry) for entry in json.load(f)]

            analysis = await orchestrator._engine.summarize_turn(transcript)
            with open(analysis_path, "w", encoding="utf-8") as f:
                json.dump(analysis, f, indent=2)
            outcome_value = analysis.get("outcome", "unknown")
            try:
                outcome = CallOutcome(outcome_value)
            except Exception:
                outcome = "unknown"
            return AnalysisPayload(
                summary=analysis["summary"],
                outcome=outcome,
                concessions=analysis.get("concessions", []),
                tactics=analysis.get("tactics", []),
                score=analysis.get("score", 0),
                details=analysis,
            )

    return router
