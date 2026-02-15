from __future__ import annotations

import json
import inspect
import struct
from pathlib import Path
from typing import List
from uuid import uuid4

from fastapi import APIRouter, HTTPException, Query, Request
from fastapi.responses import FileResponse, Response
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

    def _build_recording_files(call_dir: Path, task_id: str | None = None) -> dict[str, object]:
        file_stats = {}
        for name in ("inbound.wav", "outbound.wav", "mixed.wav", "recording_stats.json"):
            path = call_dir / name
            local_exists = path.exists()
            exists = local_exists
            size = path.stat().st_size if local_exists else 0
            # Check remote storage if local file is missing
            if not local_exists and task_id and name.endswith(".wav"):
                exists = store.audio_exists(task_id, name)
            file_stats[name] = {
                "exists": exists,
                "size_bytes": size,
            }
        return file_stats

    class TransferRequest(BaseModel):
        to_phone: str = Field(min_length=8, max_length=20)

    class DtmfRequest(BaseModel):
        digits: str = Field(min_length=1, max_length=64)

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
                await orchestrator.send_task_dtmf(task_id, payload.digits)
            except LookupError as exc:
                raise HTTPException(status_code=409, detail=str(exc)) from exc
            except ValueError as exc:
                raise HTTPException(status_code=422, detail=str(exc)) from exc
            return ActionResponse(ok=True, message=f"sent keypad digits: {payload.digits}")

    def _mulaw_decode_table() -> list[int]:
        """Build mulaw byte → 16-bit PCM lookup table (ITU G.711)."""
        table = []
        for byte_val in range(256):
            complement = ~byte_val & 0xFF
            sign = (complement & 0x80) >> 7
            exponent = (complement & 0x70) >> 4
            mantissa = complement & 0x0F
            magnitude = ((mantissa << 1) + 33) << (exponent + 2)
            magnitude -= 132
            sample = -magnitude if sign else magnitude
            table.append(max(-32768, min(32767, sample)))
        return table

    _MULAW_TABLE = _mulaw_decode_table()

    def _mulaw_to_pcm_wav(raw_data: bytes, sample_rate: int = 8000, channels: int = 1) -> bytes:
        """Decode raw mulaw bytes to 16-bit PCM and wrap in a standard WAV."""
        # Decode mulaw → 16-bit signed PCM
        pcm_samples = bytearray(len(raw_data) * 2)
        for i, byte_val in enumerate(raw_data):
            sample = _MULAW_TABLE[byte_val]
            pcm_samples[i * 2] = sample & 0xFF
            pcm_samples[i * 2 + 1] = (sample >> 8) & 0xFF

        bits_per_sample = 16
        byte_rate = sample_rate * channels * bits_per_sample // 8
        block_align = channels * bits_per_sample // 8
        data_size = len(pcm_samples)
        # Standard PCM WAV: RIFF(12) + fmt(24) + data(8+data)
        fmt_chunk_size = 16
        riff_size = 4 + (8 + fmt_chunk_size) + (8 + data_size)

        header = struct.pack(
            '<4sI4s'       # RIFF, size, WAVE
            '4sI'          # fmt, chunk size
            'HHIIHH'       # audioFormat, channels, sampleRate, byteRate, blockAlign, bitsPerSample
            '4sI',         # data, data size
            b'RIFF', riff_size, b'WAVE',
            b'fmt ', fmt_chunk_size,
            1,             # 1 = PCM (universally supported)
            channels, sample_rate, byte_rate, block_align, bits_per_sample,
            b'data', data_size,
        )
        return header + bytes(pcm_samples)

    @router.get("/{task_id}/audio")
    async def get_audio(task_id: str, side: str = Query(default="mixed")):
        with timed_step("api", "get_audio", task_id=task_id, details={"side": side}):
            call_dir = store.get_task_dir(task_id)

            side_to_file = {
                "mixed": "mixed.wav",
                "inbound": "inbound.wav",
                "outbound": "outbound.wav",
            }

            selected = side if side in side_to_file else "mixed"
            filename = side_to_file[selected]
            file_path = call_dir / filename

            raw_data: bytes | None = None

            # Try local filesystem first
            if file_path.exists():
                raw_data = file_path.read_bytes()
            else:
                # Fallback: try other local .wav files
                fallback = next(iter(sorted(call_dir.glob("*.wav"))), None) if call_dir.exists() else None
                if fallback:
                    raw_data = fallback.read_bytes()
                    filename = fallback.name
                else:
                    # Fallback: download from remote storage
                    raw_data = store.download_audio(task_id, filename)

            if not raw_data:
                raise HTTPException(status_code=404, detail="No audio for task")

            # If the file lacks a RIFF header, it's raw mulaw — decode to PCM WAV
            if not raw_data[:4] == b'RIFF':
                raw_data = _mulaw_to_pcm_wav(raw_data)
            # If it has a RIFF header but mulaw format tag, also decode to PCM
            elif raw_data[20:22] == b'\x07\x00':
                # Strip existing header, decode payload to PCM
                raw_data = _mulaw_to_pcm_wav(raw_data[44:])

            return Response(
                content=raw_data,
                media_type="audio/wav",
                headers={
                    "Content-Disposition": f'inline; filename="{filename}"',
                    "Content-Length": str(len(raw_data)),
                    "Accept-Ranges": "bytes",
                },
            )

    @router.get("/{task_id}/recording-metadata")
    async def get_recording_metadata(task_id: str):
        with timed_step("api", "get_recording_metadata", task_id=task_id):
            metadata = store.get_artifact(task_id, "recording_stats")
            if not metadata:
                metadata = {
                    "task_id": task_id,
                    "status": "missing",
                    "bytes_by_side": {"caller": 0, "agent": 0, "mixed": 0},
                    "chunks_by_side": {"caller": 0, "agent": 0},
                    "last_chunk_at": None,
                }
            call_dir = store.get_task_dir(task_id)
            metadata["files"] = _build_recording_files(call_dir, task_id)
            return metadata

    @router.get("/{task_id}/recording-files")
    async def get_recording_files(task_id: str):
        with timed_step("api", "get_recording_files", task_id=task_id):
            call_dir = store.get_task_dir(task_id)
            if not call_dir.exists():
                call_dir.mkdir(parents=True, exist_ok=True)
            return {
                "task_id": task_id,
                "files": _build_recording_files(call_dir, task_id),
            }

    @router.get("/{task_id}/transcript")
    async def get_transcript(task_id: str):
        with timed_step("api", "get_transcript", task_id=task_id):
            row = store.get_task(task_id)
            if not row:
                raise HTTPException(status_code=404, detail="Task not found")
            raw = store.get_artifact(task_id, "transcript")
            if raw is None:
                return {"task_id": task_id, "turns": [], "count": 0}
            return {
                "task_id": task_id,
                "turns": raw,
                "count": len(raw),
            }

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

            existing_analysis = store.get_artifact(task_id, "analysis")
            if existing_analysis:
                return AnalysisPayload(**existing_analysis)

            transcript_raw = store.get_artifact(task_id, "transcript")
            transcript: List[TranscriptTurn] = []
            if transcript_raw:
                transcript = [TranscriptTurn(**entry) for entry in transcript_raw]

            analysis = await _summarize_transcript(transcript, row)
            store.save_artifact(task_id, "analysis", analysis)
            outcome_value = analysis.get("outcome", "unknown")
            valid_outcomes = {"unknown", "success", "partial", "failed", "walkaway"}
            outcome = outcome_value if outcome_value in valid_outcomes else "unknown"
            store.update_status(task_id, row.get("status", "ended"), outcome=outcome)
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

            # Gather task data and generate missing analyses in parallel
            import asyncio as _asyncio

            async def _prepare_call(task_id: str) -> dict[str, object] | None:
                try:
                    row = store.get_task(task_id)
                    if not row:
                        return None

                    transcript_raw = store.get_artifact(task_id, "transcript") or []
                    transcript: List[TranscriptTurn] = [TranscriptTurn(**entry) for entry in transcript_raw]

                    analysis = store.get_artifact(task_id, "analysis")
                    if not analysis:
                        analysis = await _summarize_transcript(transcript, row)
                        store.save_artifact(task_id, "analysis", analysis)

                    return {
                        "task_id": task_id,
                        "target_phone": row.get("target_phone", ""),
                        "target_name": row.get("target_name"),
                        "target_url": row.get("target_url"),
                        "target_source": row.get("target_source"),
                        "target_snippet": row.get("target_snippet"),
                        "location": row.get("location"),
                        "status": row.get("status", "unknown"),
                        "outcome": row.get("outcome", (analysis or {}).get("outcome", "unknown")),
                        "duration_seconds": row.get("duration_seconds", 0),
                        "analysis": analysis,
                        "transcript_excerpt": transcript_raw[-40:],
                    }
                except Exception:
                    # Individual call preparation failure should not crash entire multi-analysis
                    return None

            prepared = await _asyncio.gather(*[_prepare_call(tid) for tid in task_ids])
            calls: List[dict[str, object]] = [c for c in prepared if c is not None]

            if not calls:
                raise HTTPException(status_code=404, detail="No tasks found for multi-analysis")

            summary = await orchestrator._engine.summarize_multi_calls(
                calls,
                objective=objective,
            )
            return {
                "ok": True,
                "call_count": len(calls),
                "summary": summary,
                "calls": [
                    {
                        "task_id": call.get("task_id"),
                        "target_phone": call.get("target_phone"),
                        "target_name": call.get("target_name"),
                        "target_url": call.get("target_url"),
                        "location": call.get("location"),
                        "status": call.get("status"),
                        "outcome": call.get("outcome"),
                        "score": int((call.get("analysis") or {}).get("score", 0)),
                    }
                    for call in calls
                ],
            }

    return router
