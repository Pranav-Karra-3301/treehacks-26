from __future__ import annotations

from datetime import datetime
from typing import Any, Dict, List, Literal, Optional

from pydantic import BaseModel, Field


NegotiationStyle = Literal["collaborative", "assertive", "empathetic"]
CallStatus = Literal["pending", "dialing", "active", "ended", "failed"]
CallOutcome = Literal["unknown", "success", "partial", "failed", "walkaway"]


class NegotiationTaskCreate(BaseModel):
    task_type: str = "custom"
    target_phone: str
    objective: str
    context: str = ""
    target_outcome: Optional[str] = None
    walkaway_point: Optional[str] = None
    agent_persona: Optional[str] = None
    opening_line: Optional[str] = None
    style: NegotiationStyle = "collaborative"


class TranscriptTurn(BaseModel):
    speaker: Literal["caller", "agent"]
    content: str
    created_at: datetime = Field(default_factory=datetime.utcnow)


class TaskSummary(BaseModel):
    id: str
    task_type: str = "custom"
    target_phone: str
    objective: str
    status: CallStatus
    outcome: CallOutcome = "unknown"
    duration_seconds: int = 0
    created_at: datetime
    ended_at: Optional[datetime] = None


class TaskDetail(TaskSummary):
    context: str = ""
    target_outcome: Optional[str] = None
    walkaway_point: Optional[str] = None
    agent_persona: Optional[str] = None
    opening_line: Optional[str] = None
    style: NegotiationStyle = "collaborative"


class CallEvent(BaseModel):
    type: Literal["call_status", "transcript_update", "agent_thinking", "strategy_update", "audio_level", "analysis_ready"]
    data: Dict[str, Any]
    timestamp: datetime = Field(default_factory=datetime.utcnow)


class AnalysisRequest(BaseModel):
    session_id: str


class AnalysisPayload(BaseModel):
    summary: str
    outcome: CallOutcome
    outcome_reasoning: str = ""
    concessions: List[Dict[str, Any]] = Field(default_factory=list)
    tactics: List[str] = Field(default_factory=list)
    tactics_used: List[Dict[str, Any]] = Field(default_factory=list)
    score: int = 0
    score_reasoning: str = ""
    rapport_quality: str = ""
    key_moments: List[str] = Field(default_factory=list)
    improvement_suggestions: List[str] = Field(default_factory=list)
    details: Dict[str, Any] = Field(default_factory=dict)


class WsSubscribeResponse(BaseModel):
    session_id: str
    status: CallStatus


class ActionResponse(BaseModel):
    ok: bool
    message: str
    session_id: Optional[str] = None
