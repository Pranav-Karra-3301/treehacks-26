from __future__ import annotations

import asyncio
import base64
import inspect
import struct
from typing import List
from uuid import uuid4

from fastapi import APIRouter, HTTPException, Query, Request
from fastapi.responses import Response
from pydantic import BaseModel, Field

from app.core.config import settings
from app.services.cache import CacheService
from app.models.schemas import AnalysisPayload, ActionResponse, CallOutcome, TaskDetail, TaskSummary, TranscriptTurn
from app.models.schemas import NegotiationTaskCreate
from app.services.orchestrator import CallOrchestrator
from app.services.storage import DataStore
from app.core.telemetry import timed_step


def get_routes(store: DataStore, orchestrator: CallOrchestrator, cache: CacheService | None = None):
    router = APIRouter(prefix="/api/tasks", tags=["tasks"])
    local_cache = cache

    def _tasks_cache_key() -> str:
        if local_cache is None:
            return "tasks:list"
        return local_cache.key("tasks", "list")

    def _task_cache_key(task_id: str) -> str:
        if local_cache is None:
            return f"tasks:task:{task_id}"
        return local_cache.key("tasks", "task", task_id)

    def _analysis_cache_key(task_id: str) -> str:
        if local_cache is None:
            return f"tasks:analysis:{task_id}"
        return local_cache.key("tasks", "analysis", task_id)

    async def _summarize_transcript(
        transcript: List[TranscriptTurn],
        task: dict[str, object],
    ) -> dict[str, object]:
        summarize_fn = orchestrator._engine.summarize_turn
        try:
            param_count = len(inspect.signature(summarize_fn).parameters)
        except (TypeError, ValueError):
            param_count = 1

        # Backward compatibility: older test doubles may only accept transcript.
        if param_count >= 2:
            return await summarize_fn(transcript, task)
        return await summarize_fn(transcript)

    class TransferRequest(BaseModel):
        to_phone: str = Field(min_length=8, max_length=20)

    class DtmfRequest(BaseModel):
        digits: str = Field(min_length=1, max_length=64)

    class HangupRequest(BaseModel):
        reason: str = Field(default="", max_length=240)

    @router.post("", response_model=TaskSummary)
    async def create_task(task: NegotiationTaskCreate):
        with timed_step("api", "create_task"):
            task_id = str(uuid4())
            payload = task.model_dump()
            store.create_task(task_id, payload)
            if local_cache is not None:
                await local_cache.delete(_tasks_cache_key())
            row = store.get_task(task_id)
            return TaskSummary(**row)

    @router.get("", response_model=List[TaskSummary])
    async def list_tasks():
        with timed_step("api", "list_tasks"):
            if local_cache is not None:
                cached = await local_cache.get_json(_tasks_cache_key())
                if cached is not None:
                    return [TaskSummary(**row) for row in cached]

            rows = [TaskSummary(**row) for row in store.list_tasks()]
            if local_cache is not None:
                serializable_rows = [row.model_dump() for row in rows]
                await local_cache.set_json(
                    _tasks_cache_key(),
                    serializable_rows,
                    ttl_seconds=settings.CACHE_TASK_TTL_SECONDS,
                )
            return rows

    @router.get("/{task_id}", response_model=TaskDetail)
    async def get_task(task_id: str):
        with timed_step("api", "get_task", task_id=task_id):
            if local_cache is not None:
                cached = await local_cache.get_json(_task_cache_key(task_id))
                if cached is not None:
                    cached = dict(cached)
                    cached.update(
                        {
                            k: cached.get(k, None)
                            for k in [
                                "context",
                                "target_outcome",
                                "walkaway_point",
                                "agent_persona",
                                "opening_line",
                                "style",
                            ]
                        }
                    )
                    return TaskDetail(**cached)

            row = store.get_task(task_id)
            if not row:
                raise HTTPException(status_code=404, detail="Task not found")
            row.update({k: row.get(k, None) for k in ["context", "target_outcome", "walkaway_point", "agent_persona", "opening_line", "style"]})
            if local_cache is not None:
                await local_cache.set_json(
                    _task_cache_key(task_id),
                    row,
                    ttl_seconds=settings.CACHE_TASK_TTL_SECONDS,
                )
            return TaskDetail(**row)

    @router.post("/{task_id}/call", response_model=ActionResponse)
    async def start_call(task_id: str):
        with timed_step("api", "start_call", task_id=task_id):
            row = store.get_task(task_id)
            if not row:
                raise HTTPException(status_code=404, detail="Task not found")
            if local_cache is not None:
                await local_cache.delete(_task_cache_key(task_id))
                await local_cache.delete(_tasks_cache_key())
                await local_cache.delete(_analysis_cache_key(task_id))
            payload = await orchestrator.start_task_call(task_id, row)
            return ActionResponse(ok=True, message="call started", session_id=payload["session_id"])

    @router.post("/{task_id}/stop", response_model=ActionResponse)
    async def stop_call(task_id: str):
        with timed_step("api", "stop_call", task_id=task_id):
            if local_cache is not None:
                await local_cache.delete(_task_cache_key(task_id))
                await local_cache.delete(_tasks_cache_key())
                await local_cache.delete(_analysis_cache_key(task_id))
            await orchestrator.stop_task_call(task_id, stop_reason="user_stop")
            return ActionResponse(ok=True, message="call stopped")

    @router.delete("/{task_id}", response_model=ActionResponse)
    async def delete_task(task_id: str):
        with timed_step("api", "delete_task", task_id=task_id):
            row = store.get_task(task_id)
            if not row:
                raise HTTPException(status_code=404, detail="Task not found")
            # Stop any active call first
            status = str(row.get("status") or "")
            if status not in {"ended", "failed"}:
                try:
                    await orchestrator.stop_task_call(task_id, stop_reason="task_deleted")
                except Exception:
                    pass
            # Delete from Supabase and disk
            store.delete_task(task_id)
            # Clear caches
            if local_cache is not None:
                await local_cache.delete(_task_cache_key(task_id))
                await local_cache.delete(_tasks_cache_key())
                await local_cache.delete(_analysis_cache_key(task_id))
            return ActionResponse(ok=True, message="task deleted")

    @router.post("/{task_id}/transfer", response_model=ActionResponse)
    async def transfer_call(task_id: str, payload: TransferRequest):
        with timed_step("api", "transfer_call", task_id=task_id):
            row = store.get_task(task_id)
            if not row:
                raise HTTPException(status_code=404, detail="Task not found")
            if local_cache is not None:
                await local_cache.delete(_task_cache_key(task_id))
                await local_cache.delete(_tasks_cache_key())
            try:
                await orchestrator.transfer_task_call(task_id, payload.to_phone)
            except LookupError as exc:
                raise HTTPException(status_code=409, detail=str(exc)) from exc
            except ValueError as exc:
                raise HTTPException(status_code=422, detail=str(exc)) from exc
            return ActionResponse(ok=True, message=f"transfer initiated to {payload.to_phone}")

    @router.post("/{task_id}/dtmf", response_model=ActionResponse)
    async def send_dtmf(task_id: str, payload: DtmfRequest):
        with timed_step("api", "send_dtmf", task_id=task_id, details={"digits": payload.digits}):
            row = store.get_task(task_id)
            if not row:
                raise HTTPException(status_code=404, detail="Task not found")
            if local_cache is not None:
                await local_cache.delete(_task_cache_key(task_id))
                await local_cache.delete(_tasks_cache_key())
            try:
                await orchestrator.request_task_dtmf(
                    task_id,
                    payload.digits,
                    source="manual_api",
                    reason="manual_dtmf_endpoint",
                )
            except LookupError as exc:
                raise HTTPException(status_code=409, detail=str(exc)) from exc
            except ValueError as exc:
                raise HTTPException(status_code=422, detail=str(exc)) from exc
            except PermissionError as exc:
                raise HTTPException(status_code=409, detail=str(exc)) from exc
            return ActionResponse(ok=True, message=f"sent keypad digits: {payload.digits}")

    @router.get("/{task_id}/call-control/state")
    async def get_call_control_state(task_id: str):
        with timed_step("api", "get_call_control_state", task_id=task_id):
            row = store.get_task(task_id)
            if not row:
                raise HTTPException(status_code=404, detail="Task not found")
            return orchestrator.get_task_call_control_state(task_id)

    @router.post("/{task_id}/call-control/hangup", response_model=ActionResponse)
    async def request_hangup(task_id: str, payload: HangupRequest):
        with timed_step("api", "request_hangup", task_id=task_id):
            row = store.get_task(task_id)
            if not row:
                raise HTTPException(status_code=404, detail="Task not found")
            if local_cache is not None:
                await local_cache.delete(_task_cache_key(task_id))
                await local_cache.delete(_tasks_cache_key())
                await local_cache.delete(_analysis_cache_key(task_id))
            try:
                await orchestrator.request_task_hangup(
                    task_id,
                    source="manual_api",
                    reason=payload.reason or "manual_hangup_endpoint",
                )
            except LookupError as exc:
                raise HTTPException(status_code=409, detail=str(exc)) from exc
            except PermissionError as exc:
                raise HTTPException(status_code=409, detail=str(exc)) from exc
            return ActionResponse(ok=True, message="call hangup requested")

    def _wrap_mulaw_wav(raw_data: bytes, sample_rate: int = 8000, channels: int = 1) -> bytes:
        """Wrap raw mulaw PCM data with a proper WAV header."""
        bits_per_sample = 8
        byte_rate = sample_rate * channels * bits_per_sample // 8
        block_align = channels * bits_per_sample // 8
        data_size = len(raw_data)
        # RIFF header (12) + fmt chunk (26 for non-PCM) + data chunk header (8)
        fmt_chunk_size = 18  # 16 base + 2 for cbSize
        header_size = 12 + 8 + fmt_chunk_size + 8
        riff_size = header_size + data_size - 8

        header = struct.pack(
            '<4sI4s'       # RIFF, size, WAVE
            '4sI'          # fmt, chunk size
            'HHIIHH'       # audioFormat, channels, sampleRate, byteRate, blockAlign, bitsPerSample
            'H'            # cbSize (extra format bytes)
            '4sI',         # data, data size
            b'RIFF', riff_size, b'WAVE',
            b'fmt ', fmt_chunk_size,
            7,             # 7 = mulaw
            channels, sample_rate, byte_rate, block_align, bits_per_sample,
            0,             # no extra format data
            b'data', data_size,
        )
        return header + raw_data

    def _artifact_audio_bytes(artifact: dict[str, object] | None, side: str) -> tuple[bytes | None, str]:
        if not artifact:
            return None, f"{side}.wav"
        audio_payload = artifact.get("audio_payload")
        if not isinstance(audio_payload, dict):
            return None, f"{side}.wav"

        candidate_keys = [side]
        if side == "mixed":
            candidate_keys.extend(["outbound", "inbound"])
        for key in candidate_keys:
            payload = audio_payload.get(key)
            if not isinstance(payload, dict):
                continue
            encoded = payload.get("payload_b64")
            if not isinstance(encoded, str) or not encoded:
                continue
            try:
                raw = base64.b64decode(encoded)
            except Exception:
                continue
            filename = str(payload.get("file_name") or f"{key}.wav")
            return raw, filename
        return None, f"{side}.wav"

    @router.get("/{task_id}/audio")
    async def get_audio(task_id: str, side: str = Query(default="mixed")):
        with timed_step("api", "get_audio", task_id=task_id, details={"side": side}):
            row = store.get_task(task_id)
            if not row:
                raise HTTPException(status_code=404, detail="Task not found")
            artifact = store.get_call_artifact(task_id)

            selected = side if side in {"mixed", "inbound", "outbound"} else "mixed"
            raw_data, filename = _artifact_audio_bytes(artifact, selected)
            if raw_data is None:
                raise HTTPException(status_code=404, detail="No audio for task")

            if not raw_data[:4] == b'RIFF':
                raw_data = _wrap_mulaw_wav(raw_data)

            return Response(
                content=raw_data,
                media_type="audio/wav",
                headers={"Content-Disposition": f'inline; filename="{filename}"'},
            )

    @router.get("/{task_id}/recording-metadata")
    async def get_recording_metadata(task_id: str):
        with timed_step("api", "get_recording_metadata", task_id=task_id):
            artifact = store.get_call_artifact(task_id)

            artifact_recording = artifact.get("recording") if isinstance(artifact, dict) else {}
            if isinstance(artifact_recording, dict) and artifact_recording:
                metadata = dict(artifact_recording)
            else:
                metadata = {
                    "task_id": task_id,
                    "status": "missing",
                    "bytes_by_side": {"caller": 0, "agent": 0, "mixed": 0},
                    "chunks_by_side": {"caller": 0, "agent": 0},
                    "last_chunk_at": None,
                }

            # Build file list from audio_payload
            audio_payload = artifact.get("audio_payload") if isinstance(artifact, dict) else {}
            files = {}
            if isinstance(audio_payload, dict):
                for key, payload in audio_payload.items():
                    if isinstance(payload, dict):
                        file_name = str(payload.get("file_name") or f"{key}.wav")
                        files[file_name] = {
                            "exists": bool(payload.get("payload_b64")),
                            "size_bytes": int(payload.get("byte_count") or 0),
                        }
            metadata["files"] = files
            return metadata

    @router.get("/{task_id}/recording-files")
    async def get_recording_files(task_id: str):
        with timed_step("api", "get_recording_files", task_id=task_id):
            artifact = store.get_call_artifact(task_id)
            audio_payload = artifact.get("audio_payload") if isinstance(artifact, dict) else {}
            files = {}
            if isinstance(audio_payload, dict):
                for key, payload in audio_payload.items():
                    if not isinstance(payload, dict):
                        continue
                    file_name = str(payload.get("file_name") or f"{key}.wav")
                    files[file_name] = {
                        "exists": bool(payload.get("payload_b64")),
                        "size_bytes": int(payload.get("byte_count") or 0),
                    }
            return {"task_id": task_id, "files": files}

    @router.get("/{task_id}/transcript")
    async def get_transcript(task_id: str):
        with timed_step("api", "get_transcript", task_id=task_id):
            row = store.get_task(task_id)
            if not row:
                raise HTTPException(status_code=404, detail="Task not found")
            artifact = store.get_call_artifact(task_id)
            turns = artifact.get("transcript") if isinstance(artifact, dict) else []
            if not isinstance(turns, list):
                turns = []
            return {"task_id": task_id, "turns": turns, "count": len(turns)}

    @router.get("/{task_id}/analysis", response_model=AnalysisPayload)
    async def get_analysis(task_id: str):
        with timed_step("api", "get_analysis", task_id=task_id):
            if local_cache is not None:
                cached = await local_cache.get_json(_analysis_cache_key(task_id))
                if cached is not None:
                    return AnalysisPayload(**cached)

            row = store.get_task(task_id)
            if not row:
                raise HTTPException(status_code=404, detail="Task not found")

            artifact = store.get_call_artifact(task_id)
            artifact_analysis = artifact.get("analysis") if isinstance(artifact, dict) else {}
            if isinstance(artifact_analysis, dict) and artifact_analysis.get("summary"):
                outcome_value = artifact_analysis.get("outcome", "unknown")
                valid_outcomes = {"unknown", "success", "partial", "failed", "walkaway"}
                outcome = outcome_value if outcome_value in valid_outcomes else "unknown"
                if row.get("outcome") != outcome:
                    store.update_status(task_id, row.get("status", "ended"), outcome=outcome)
                artifact_payload = {
                    "summary": str(artifact_analysis.get("summary", "")),
                    "outcome": outcome,
                    **artifact_analysis,
                }
                return AnalysisPayload(**artifact_payload)

            # No existing analysis — generate one from transcript
            transcript: List[TranscriptTurn] = []
            if isinstance(artifact, dict):
                transcript = [TranscriptTurn(**entry) for entry in artifact.get("transcript", []) if isinstance(entry, dict)]

            analysis = await _summarize_transcript(transcript, row)
            outcome_value = analysis.get("outcome", "unknown")
            valid_outcomes = {"unknown", "success", "partial", "failed", "walkaway"}
            outcome = outcome_value if outcome_value in valid_outcomes else "unknown"
            store.update_status(task_id, row.get("status", "ended"), outcome=outcome)
            # Write analysis to Supabase
            await asyncio.to_thread(
                store.upsert_call_artifact_partial,
                task_id,
                analysis=analysis,
                reason="api_get_analysis",
            )
            if local_cache is not None:
                await local_cache.delete(_task_cache_key(task_id))
                await local_cache.delete(_tasks_cache_key())
            response = AnalysisPayload(
                summary=analysis["summary"],
                outcome=outcome,
                outcome_reasoning=analysis.get("outcome_reasoning", ""),
                concessions=analysis.get("concessions", []),
                tactics=analysis.get("tactics", []),
                tactics_used=analysis.get("tactics_used", []),
                score=analysis.get("score", 0),
                score_reasoning=analysis.get("score_reasoning", ""),
                rapport_quality=analysis.get("rapport_quality", ""),
                key_moments=analysis.get("key_moments", []),
                improvement_suggestions=analysis.get("improvement_suggestions", []),
                details=analysis,
            )
            if local_cache is not None:
                await local_cache.set_json(
                    _analysis_cache_key(task_id),
                    response.model_dump(),
                    ttl_seconds=settings.CACHE_ANALYSIS_TTL_SECONDS,
                )
            return response

    @router.post("/multi-analysis")
    async def multi_analysis(request: Request):
        try:
            raw_payload = await request.json()
        except Exception:
            raw_payload = {}
        if not isinstance(raw_payload, dict):
            raw_payload = {}

        raw_task_ids = raw_payload.get("task_ids")
        if raw_task_ids is None:
            raw_task_ids = raw_payload.get("taskIds")
        if isinstance(raw_task_ids, str):
            raw_task_ids = [raw_task_ids]
        if not isinstance(raw_task_ids, (list, tuple, set)):
            raw_task_ids = []

        objective = raw_payload.get("objective", "")
        if objective is None:
            objective = ""
        if not isinstance(objective, str):
            objective = str(objective)

        with timed_step(
            "api",
            "multi_analysis",
            details={"requested_tasks": len(raw_task_ids)},
        ):
            terminal_statuses = {"ended", "failed"}
            normalized_ids: List[str] = []
            for tid in raw_task_ids:
                if tid is None:
                    continue
                if not isinstance(tid, str):
                    tid = str(tid)
                tid = tid.strip()
                if tid:
                    normalized_ids.append(tid)

            task_ids = list(dict.fromkeys(normalized_ids))
            if not task_ids:
                raise HTTPException(status_code=400, detail="task_ids cannot be empty")

            calls: List[dict[str, object]] = []
            active_calls: List[dict[str, object]] = []
            early_ended_calls: List[dict[str, object]] = []
            for task_id in task_ids:
                row = store.get_task(task_id)
                if not row:
                    continue

                status = str(row.get("status", "unknown") or "unknown")
                if status not in terminal_statuses:
                    active_calls.append(
                        {
                            "task_id": task_id,
                            "target_phone": row.get("target_phone", ""),
                            "status": status,
                        }
                    )

                artifact = store.get_call_artifact(task_id)
                transcript_raw: List[dict[str, object]] = []
                transcript: List[TranscriptTurn] = []
                if isinstance(artifact, dict):
                    raw_turns = artifact.get("transcript", [])
                    if isinstance(raw_turns, list):
                        transcript_raw = raw_turns
                        transcript = [TranscriptTurn(**entry) for entry in raw_turns if isinstance(entry, dict)]

                artifact_analysis = artifact.get("analysis") if isinstance(artifact, dict) else {}
                if isinstance(artifact_analysis, dict) and artifact_analysis.get("summary"):
                    analysis = artifact_analysis
                else:
                    analysis = await _summarize_transcript(transcript, row)
                    # Persist generated analysis to Supabase
                    await asyncio.to_thread(
                        store.upsert_call_artifact_partial,
                        task_id,
                        analysis=analysis,
                        reason="multi_analysis",
                    )

                if len(transcript_raw) == 0 and status in terminal_statuses:
                    early_ended_calls.append(
                        {
                            "task_id": task_id,
                            "target_phone": row.get("target_phone", ""),
                            "status": status,
                            "reason": "call ended before meaningful transcript",
                        }
                    )

                calls.append(
                    {
                        "task_id": task_id,
                        "target_phone": row.get("target_phone", ""),
                        "target_name": row.get("target_name"),
                        "target_url": row.get("target_url"),
                        "target_source": row.get("target_source"),
                        "target_snippet": row.get("target_snippet"),
                        "location": row.get("location"),
                        "status": status,
                        "outcome": row.get("outcome", analysis.get("outcome", "unknown")),
                        "duration_seconds": row.get("duration_seconds", 0),
                        "analysis": analysis,
                        "transcript_turn_count": len(transcript_raw),
                        "transcript_excerpt": transcript_raw[-40:],
                    }
                )

            if not calls:
                raise HTTPException(status_code=404, detail="No tasks found for multi-analysis")
            if active_calls:
                active_labels = ", ".join(
                    f"{item.get('task_id')} ({item.get('status')})"
                    for item in active_calls[:5]
                )
                raise HTTPException(
                    status_code=409,
                    detail=(
                        "Cannot generate combined summary yet: one or more calls are still active. "
                        f"Wait for calls to end first. Active: {active_labels}"
                    ),
                )

            summary = await orchestrator._engine.summarize_multi_calls(
                calls,
                objective=objective,
            )
            if early_ended_calls:
                note = (
                    f"{len(early_ended_calls)} call(s) ended before meaningful transcript; "
                    "combined summary may be incomplete for those calls."
                )
                missing = summary.get("missing_information")
                if not isinstance(missing, list):
                    missing = []
                if note not in missing:
                    missing.append(note)
                summary["missing_information"] = missing

                important = summary.get("important_facts")
                if not isinstance(important, list):
                    important = []
                important_note = "Some calls ended before the final combined summarization step."
                if important_note not in important:
                    important.append(important_note)
                summary["important_facts"] = important

            return {
                "ok": True,
                "call_count": len(calls),
                "summary": summary,
                "checks": {
                    "all_calls_terminal": True,
                    "active_calls": [],
                    "early_ended_calls": early_ended_calls,
                },
                "calls": [
                    {
                        "task_id": call.get("task_id"),
                        "target_phone": call.get("target_phone"),
                        "target_name": call.get("target_name"),
                        "target_url": call.get("target_url"),
                        "location": call.get("location"),
                        "status": call.get("status"),
                        "outcome": call.get("outcome"),
                        "transcript_turn_count": int(call.get("transcript_turn_count") or 0),
                        "score": int((call.get("analysis") or {}).get("score", 0)),
                    }
                    for call in calls
                ],
            }

    return router
